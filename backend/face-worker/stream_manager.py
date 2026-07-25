"""
Keep RTSP connections open and serve JPEG frames for the Node CCTV poller.
"""
from __future__ import annotations

import base64
import logging
import threading
import time
from dataclasses import dataclass, field

import cv2

from rtsp_utils import open_rtsp_capture

logger = logging.getLogger("face-worker.stream")


@dataclass
class StreamState:
    camera_id: str
    name: str
    rtsp_url: str
    running: bool = False
    connected: bool = False
    last_error: str = ""
    last_jpeg_b64: str | None = None
    last_frame_at: float | None = None
    thread: threading.Thread | None = None
    stop_event: threading.Event = field(default_factory=threading.Event)
    lock: threading.Lock = field(default_factory=threading.Lock)


class StreamManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._streams: dict[str, StreamState] = {}

    def start(self, camera_id: str, name: str, rtsp_url: str) -> dict:
        with self._lock:
            existing = self._streams.get(camera_id)
            if existing and existing.running:
                # Must not call self.status() here (would nest locks on a plain Lock)
                return self._status_dict(existing)

            state = StreamState(camera_id=camera_id, name=name or camera_id, rtsp_url=rtsp_url)
            state.running = True
            thread = threading.Thread(
                target=self._run,
                args=(state,),
                name=f"rtsp-{camera_id}",
                daemon=True,
            )
            state.thread = thread
            self._streams[camera_id] = state
            thread.start()
            return self._status_dict(state)

    def stop(self, camera_id: str) -> dict:
        with self._lock:
            state = self._streams.get(camera_id)
            if not state:
                return {"cameraId": camera_id, "running": False}
            state.stop_event.set()
            state.running = False
            thread = state.thread
        if thread and thread.is_alive():
            thread.join(timeout=3)
        with self._lock:
            self._streams.pop(camera_id, None)
        return {"cameraId": camera_id, "running": False}

    def status(self, camera_id: str | None = None) -> dict | list:
        with self._lock:
            if camera_id:
                state = self._streams.get(camera_id)
                return self._status_dict(state) if state else {"cameraId": camera_id, "running": False}
            return [self._status_dict(s) for s in self._streams.values()]

    def latest_frame(self, camera_id: str, rtsp_url: str | None = None, name: str | None = None) -> dict:
        with self._lock:
            state = self._streams.get(camera_id)
        if not state or not state.running:
            if rtsp_url:
                self.start(camera_id, name or camera_id, rtsp_url)
                with self._lock:
                    state = self._streams.get(camera_id)
            else:
                return {"ok": False, "error": "Stream not started"}

        if not state:
            return {"ok": False, "error": "Stream unavailable"}

        with state.lock:
            if not state.last_jpeg_b64:
                return {
                    "ok": False,
                    "error": state.last_error or "Connecting to camera…",
                    "connected": state.connected,
                    "message": "warming_up",
                }
            return {
                "ok": True,
                "image": state.last_jpeg_b64,
                "connected": state.connected,
                "message": "frame",
            }

    def _status_dict(self, state: StreamState | None) -> dict:
        if not state:
            return {"running": False}
        return {
            "cameraId": state.camera_id,
            "name": state.name,
            "running": state.running,
            "connected": state.connected,
            "lastError": state.last_error,
            "hasFrame": bool(state.last_jpeg_b64),
        }

    def _run(self, state: StreamState) -> None:
        # Let the HTTP /stream/start response flush before OpenCV grabs the GIL
        time.sleep(0.05)
        logger.info("Starting RTSP stream %s (%s)", state.camera_id, state.name)
        while not state.stop_event.is_set():
            cap, info = open_rtsp_capture(state.rtsp_url)
            if cap is None:
                state.connected = False
                state.last_error = str(info)
                logger.warning("Camera %s: %s", state.camera_id, info)
                if state.stop_event.wait(5):
                    break
                continue

            state.connected = True
            state.last_error = ""
            logger.info("Camera %s connected (%s)", state.camera_id, info)
            fail_reads = 0
            while not state.stop_event.is_set():
                ok, frame = cap.read()
                if not ok or frame is None:
                    fail_reads += 1
                    if fail_reads > 30:
                        state.last_error = "Lost RTSP frames"
                        break
                    time.sleep(0.05)
                    continue
                fail_reads = 0
                # Downscale for faster identify
                h, w = frame.shape[:2]
                max_side = 960
                if max(h, w) > max_side:
                    scale = max_side / max(h, w)
                    frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
                ok_enc, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ok_enc:
                    b64 = base64.b64encode(buf.tobytes()).decode("ascii")
                    with state.lock:
                        state.last_jpeg_b64 = f"data:image/jpeg;base64,{b64}"
                        state.last_frame_at = time.time()
                # Drop buffered frames to stay near live
                for _ in range(3):
                    cap.grab()
                time.sleep(0.25)

            try:
                cap.release()
            except Exception:
                pass
            state.connected = False
            if not state.stop_event.is_set():
                time.sleep(2)

        logger.info("Stopped RTSP stream %s", state.camera_id)


_manager: StreamManager | None = None
_manager_lock = threading.Lock()


def get_stream_manager() -> StreamManager:
    global _manager
    with _manager_lock:
        if _manager is None:
            _manager = StreamManager()
        return _manager
