/**
 * Spoken announcements for AI attendance (webcam + CCTV marks).
 * Uses the browser's speech engine, preferring natural/neural voices, and
 * falls back to a short chime on devices that have no voice installed.
 */

export type AttendanceVoiceSettings = { enabled: boolean; volume: number };

const STORAGE_KEY = "ai-attendance-voice";
const DEFAULT_SETTINGS: AttendanceVoiceSettings = { enabled: true, volume: 1 };

export function loadVoiceSettings(): AttendanceVoiceSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AttendanceVoiceSettings>;
    return {
      enabled: parsed.enabled !== false,
      volume:
        typeof parsed.volume === "number" ? Math.min(1, Math.max(0, parsed.volume)) : 1,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveVoiceSettings(settings: AttendanceVoiceSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage blocked — settings last for this page only */
  }
}

/** Sentence for a mark, covering every status the backend can return. */
export function attendancePhrase(name: string, status?: string, action?: string) {
  const who = name.trim() || "Someone";
  if (action === "check_out") return `${who} has checked out`;
  switch (String(status || "").toLowerCase()) {
    case "late":
      return `${who} is late`;
    case "absent":
      return `${who} is marked absent`;
    case "half_day":
      return `${who} is marked half day`;
    case "leave":
      return `${who} is on leave`;
    case "present":
    case "":
      return `${who} is present`;
    default:
      return `${who} is marked ${String(status).replace(/_/g, " ")}`;
  }
}

const hasSpeech = () => typeof window !== "undefined" && "speechSynthesis" in window;

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Chrome loads voices asynchronously; wait briefly for them before deciding there are none. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!hasSpeech()) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      const done = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", done);
        const list = window.speechSynthesis.getVoices();
        if (!list.length) voicesPromise = null;
        resolve(list);
      };
      window.speechSynthesis.addEventListener("voiceschanged", done);
      window.setTimeout(done, 1500);
    });
  }
  return voicesPromise;
}

/** Most human-sounding English voice available on this device. */
function pickVoice(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural|online/.test(name)) s += 10;
    if (name.includes("google")) s += 6;
    if (/samantha|aria|jenny|guy|libby|sonia|ava|allison/.test(name)) s += 4;
    if (v.lang.toLowerCase() === "en-us" || v.lang.toLowerCase() === "en-gb") s += 2;
    if (v.localService === false) s += 1;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0] || null;
}

let audioCtx: AudioContext | null = null;

/** Two-note chime, used when the device cannot speak. */
function playChime(volume: number) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    const ctx = audioCtx;
    void ctx.resume();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.18;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.25 * volume), start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    /* audio blocked */
  }
}

/**
 * Must run inside a click handler: browsers block audio until the user interacts.
 * Warms up both the speech engine and the chime.
 */
export function primeAttendanceVoice() {
  if (hasSpeech()) {
    void loadVoices();
    const utter = new SpeechSynthesisUtterance(" ");
    utter.volume = 0;
    window.speechSynthesis.speak(utter);
  }
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioCtx = audioCtx || new Ctx();
      void audioCtx.resume();
    }
  } catch {
    /* audio blocked */
  }
}

export async function speakText(text: string, settings: AttendanceVoiceSettings = loadVoiceSettings()) {
  if (!settings.enabled || settings.volume <= 0) return;
  const voices = await loadVoices();
  if (!hasSpeech() || voices.length === 0) {
    playChime(settings.volume);
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(voices);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = "en-US";
  }
  utter.rate = 0.95;
  utter.volume = settings.volume;
  utter.onerror = (e) => {
    if (e.error !== "interrupted" && e.error !== "canceled") playChime(settings.volume);
  };
  window.speechSynthesis.resume();
  window.speechSynthesis.speak(utter);
}

export function announceAttendance(
  mark: { name: string; status?: string; action?: string },
  settings?: AttendanceVoiceSettings
) {
  return speakText(attendancePhrase(mark.name, mark.status, mark.action), settings);
}
