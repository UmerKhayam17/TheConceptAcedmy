"""
Stateless InsightFace worker for the school MongoDB backend.
No database — Node stores embeddings/attendance in MongoDB.

Run:  uvicorn app:app --host 127.0.0.1 --port 8090
"""
from __future__ import annotations

import base64
import logging
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-worker")

app = FastAPI(title="School Face Worker", version="1.0.0")

_engine = None
_lock = threading.Lock()

MIN_DET_SCORE = 0.5
MIN_FACE_AREA_RATIO = 0.02
MIN_BLUR_VARIANCE = 40.0


class ImageBody(BaseModel):
    image: str = Field(..., description="Base64 JPEG (data URL allowed)")


def _select_providers() -> list[str]:
    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except Exception:
        return ["CPUExecutionProvider"]
    preferred = ("CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider")
    out = [p for p in preferred if p in available]
    return out or ["CPUExecutionProvider"]


def get_engine():
    global _engine
    if _engine is None:
        with _lock:
            if _engine is None:
                from insightface.app import FaceAnalysis

                providers = _select_providers()
                ctx_id = -1 if providers == ["CPUExecutionProvider"] else 0
                fa = FaceAnalysis(name="buffalo_l", providers=providers)
                fa.prepare(ctx_id=ctx_id, det_size=(640, 640))
                _engine = fa
                logger.info("InsightFace ready providers=%s", providers)
    return _engine


def decode_base64_image(data: str) -> np.ndarray:
    if "," in data:
        data = data.split(",", 1)[1]
    raw = base64.b64decode(data)
    arr = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image data")
    return image


def resize_max(image: np.ndarray, max_side: int = 640) -> np.ndarray:
    h, w = image.shape[:2]
    side = max(h, w)
    if side <= max_side:
        return image
    scale = max_side / side
    return cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def blur_score(crop: np.ndarray) -> float:
    if crop is None or crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if len(crop.shape) == 3 else crop
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def pick_face(faces, allow_largest: bool):
    if not faces:
        return None, "No face detected"
    if len(faces) > 1 and not allow_largest:
        return None, "Multiple faces detected — only one person allowed"
    if len(faces) == 1:
        return faces[0], None

    def area(f):
        x1, y1, x2, y2 = f.bbox
        return max(float(x2 - x1), 1.0) * max(float(y2 - y1), 1.0)

    return max(faces, key=area), None


def quality_ok(image: np.ndarray, face) -> dict[str, Any]:
    h, w = image.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in face.bbox]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    ratio = (max(x2 - x1, 1) * max(y2 - y1, 1)) / (w * h)
    det = float(getattr(face, "det_score", 0.0))
    blur = blur_score(image[y1:y2, x1:x2])
    checks = {
        "det_score_ok": det >= MIN_DET_SCORE,
        "face_size_ok": ratio >= MIN_FACE_AREA_RATIO,
        "blur_ok": blur >= MIN_BLUR_VARIANCE,
    }
    passed = all(checks.values())
    msg = "OK"
    if not checks["det_score_ok"]:
        msg = "Face detection confidence too low"
    elif not checks["face_size_ok"]:
        msg = "Move closer — face too small"
    elif not checks["blur_ok"]:
        msg = "Image too blurry"
    return {
        "passed": passed,
        "message": msg,
        "det_score": det,
        "face_area_ratio": ratio,
        "blur_score": blur,
        "bbox": [x1, y1, x2, y2],
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "face-worker"}


class StreamBody(BaseModel):
    cameraId: str
    rtspUrl: str | None = None
    name: str | None = None


@app.post("/stream/start")
def stream_start(body: StreamBody):
    if not body.rtspUrl:
        raise HTTPException(400, "rtspUrl required")
    from stream_manager import get_stream_manager

    return get_stream_manager().start(body.cameraId, body.name or body.cameraId, body.rtspUrl)


@app.post("/stream/stop")
def stream_stop(body: StreamBody):
    from stream_manager import get_stream_manager

    return get_stream_manager().stop(body.cameraId)


@app.post("/stream/frame")
def stream_frame(body: StreamBody):
    from stream_manager import get_stream_manager

    return get_stream_manager().latest_frame(body.cameraId, body.rtspUrl, body.name)


@app.get("/stream/status")
def stream_status(cameraId: str | None = None):
    from stream_manager import get_stream_manager

    return get_stream_manager().status(cameraId)


@app.post("/analyze")
def analyze(body: ImageBody):
    """Enrollment: quality check + embedding."""
    try:
        image = resize_max(decode_base64_image(body.image), 640)
    except Exception as exc:
        raise HTTPException(400, f"Invalid image: {exc}") from exc

    engine = get_engine()
    with _lock:
        faces = engine.get(image)
    face, err = pick_face(faces, allow_largest=True)
    if err:
        return {"passed": False, "message": err, "embedding": None}

    q = quality_ok(image, face)
    if not q["passed"]:
        return {**q, "embedding": None}

    emb = face.embedding
    norm = float(np.linalg.norm(emb))
    if norm > 0:
        emb = emb / norm
    return {**q, "embedding": emb.astype(float).tolist()}


@app.post("/embed")
def embed(body: ImageBody):
    """Identify: single-face embedding (strict one face)."""
    try:
        image = resize_max(decode_base64_image(body.image), 640)
    except Exception as exc:
        raise HTTPException(400, f"Invalid image: {exc}") from exc

    engine = get_engine()
    with _lock:
        faces = engine.get(image)
    face, err = pick_face(faces, allow_largest=False)
    if err:
        return {"matched": False, "message": err, "embedding": None, "confidence": 0.0}

    emb = face.embedding
    norm = float(np.linalg.norm(emb))
    if norm > 0:
        emb = emb / norm
    return {
        "matched": True,
        "message": "Face embedded",
        "embedding": emb.astype(float).tolist(),
        "confidence": float(getattr(face, "det_score", 0.0)),
    }
