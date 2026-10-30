/** Pastel square-avatar colours shared by people lists (Staff, Salaries, …). */
const AVATAR_TONES = [
  "bg-[#EEF5FF] text-[#1769E0]",
  "bg-[#FFF4E6] text-[#C27803]",
  "bg-[#F3EEFF] text-[#7C3AED]",
  "bg-[#ECFDF5] text-[#059669]",
  "bg-[#FFE8EE] text-[#E11D48]",
];

/** Stable colour for a name, so the same person always gets the same tone. */
export function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h + name.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[h] || AVATAR_TONES[0];
}
