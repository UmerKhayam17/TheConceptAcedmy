/** Arabic / Urdu script ranges (including presentation forms). */
const URDU_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsUrduScript(text: string | null | undefined): boolean {
  return URDU_SCRIPT_RE.test(String(text || ""));
}

/** Props for syllabus inputs/display so Urdu is RTL + Nastaleeq. */
export function urduAwareProps(text: string | null | undefined) {
  const isUrdu = containsUrduScript(text);
  return {
    isUrdu,
    dir: (isUrdu ? "rtl" : "auto") as "rtl" | "auto",
    lang: isUrdu ? ("ur" as const) : undefined,
  };
}
