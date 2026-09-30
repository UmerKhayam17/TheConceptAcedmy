import type { LucideIcon } from "lucide-react";
import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  ChartColumn,
  ChartNoAxesCombined,
  Dna,
  Dumbbell,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  Laptop,
  Map,
  Microscope,
  Monitor,
  Music2,
  Palette,
  ScrollText,
} from "lucide-react";

export type SubjectTone = "blue" | "purple" | "green" | "yellow" | "teal" | "slate";

export type SubjectTheme = {
  key: string;
  label: string;
  tone: SubjectTone;
  /** Soft card fill + left accent (timetable class cards). */
  card: string;
  icon: string;
  accentHex: string;
  Icon: LucideIcon;
  /** Legacy aliases used by older call sites. */
  bg: string;
  border: string;
  text: string;
  accent: string;
  iconBox: string;
};

const TONE: Record<
  SubjectTone,
  { card: string; icon: string; accentHex: string; bg: string; border: string; text: string; accent: string; iconBox: string }
> = {
  blue: {
    card: "border-l-[#3B82F6] bg-[#E8F1FF]",
    icon: "text-[#2563EB]",
    accentHex: "#3B82F6",
    bg: "bg-[#E8F1FF]",
    border: "border-[#BFDBFE]",
    text: "text-[#2563EB]",
    accent: "bg-[#3B82F6]",
    iconBox: "bg-[#DBEAFE]",
  },
  purple: {
    card: "border-l-[#8B5CF6] bg-[#F3EEFF]",
    icon: "text-[#7C3AED]",
    accentHex: "#8B5CF6",
    bg: "bg-[#F3EEFF]",
    border: "border-[#DDD6FE]",
    text: "text-[#7C3AED]",
    accent: "bg-[#8B5CF6]",
    iconBox: "bg-[#EDE9FE]",
  },
  green: {
    card: "border-l-[#22C55E] bg-[#E8F8EF]",
    icon: "text-[#16A34A]",
    accentHex: "#22C55E",
    bg: "bg-[#E8F8EF]",
    border: "border-[#BBF7D0]",
    text: "text-[#16A34A]",
    accent: "bg-[#22C55E]",
    iconBox: "bg-[#DCFCE7]",
  },
  yellow: {
    card: "border-l-[#F59E0B] bg-[#FFF8E8]",
    icon: "text-[#D97706]",
    accentHex: "#F59E0B",
    bg: "bg-[#FFF8E8]",
    border: "border-[#FDE68A]",
    text: "text-[#D97706]",
    accent: "bg-[#F59E0B]",
    iconBox: "bg-[#FEF3C7]",
  },
  teal: {
    card: "border-l-[#14B8A6] bg-[#E7F8F6]",
    icon: "text-[#0F766E]",
    accentHex: "#14B8A6",
    bg: "bg-[#E7F8F6]",
    border: "border-[#99F6E4]",
    text: "text-[#0F766E]",
    accent: "bg-[#14B8A6]",
    iconBox: "bg-[#CCFBF1]",
  },
  slate: {
    card: "border-l-[#94A3B8] bg-[#F8FAFC]",
    icon: "text-[#64748B]",
    accentHex: "#94A3B8",
    bg: "bg-[#F8FAFC]",
    border: "border-[#E2E8F0]",
    text: "text-[#64748B]",
    accent: "bg-[#94A3B8]",
    iconBox: "bg-[#F1F5F9]",
  },
};

function theme(
  key: string,
  label: string,
  tone: SubjectTone,
  Icon: LucideIcon,
): SubjectTheme {
  const t = TONE[tone];
  return { key, label, tone, Icon, ...t };
}

/** Soft pastel subject palettes + icons — matched by subject name. */
const NAMED_THEMES: Array<{ match: RegExp; theme: SubjectTheme }> = [
  { match: /\b(bio|biology|botany|zoology)\b/i, theme: theme("biology", "Biology", "blue", Dna) },
  { match: /\b(chem|chemistry)\b/i, theme: theme("chemistry", "Chemistry", "purple", FlaskConical) },
  { match: /\b(ict|information\s*technology)\b/i, theme: theme("ict", "ICT", "blue", Laptop) },
  {
    match: /\b(computer\s*science|computing|coding|programming|\bcs\b)\b/i,
    theme: theme("computer", "Computer Science", "blue", Monitor),
  },
  {
    match: /\b(math|maths|mathematics|algebra|geometry|calculus)\b/i,
    theme: theme("mathematics", "Mathematics", "purple", Calculator),
  },
  { match: /\b(phys|physics)\b/i, theme: theme("physics", "Physics", "yellow", Atom) },
  { match: /\b(english)\b/i, theme: theme("english", "English", "teal", BookOpen) },
  { match: /\b(urdu)\b/i, theme: theme("urdu", "Urdu", "green", Languages) },
  {
    match: /\b(islamiat|islamic\s*studies|islamiyat|deeniyat)\b/i,
    theme: theme("islamiat", "Islamiat", "yellow", Landmark),
  },
  {
    match: /\b(pakistan\s*studies|pak\s*studies|pakistan\s*study)\b/i,
    theme: theme("pakistan-studies", "Pakistan Studies", "green", Map),
  },
  { match: /\b(geography|geo)\b/i, theme: theme("geography", "Geography", "green", Globe2) },
  { match: /\b(history)\b/i, theme: theme("history", "History", "slate", ScrollText) },
  { match: /\b(art|arts|drawing|fine\s*arts)\b/i, theme: theme("art", "Art", "purple", Palette) },
  {
    match: /\b(physical\s*education|pe|sports|health\s*&\s*physical)\b/i,
    theme: theme("pe", "Physical Education", "yellow", Dumbbell),
  },
  { match: /\b(music)\b/i, theme: theme("music", "Music", "purple", Music2) },
  {
    match: /\b(general\s*science|science)\b/i,
    theme: theme("general-science", "General Science", "blue", Microscope),
  },
  { match: /\b(economics|eco)\b/i, theme: theme("economics", "Economics", "yellow", ChartNoAxesCombined) },
  { match: /\b(psychology)\b/i, theme: theme("psychology", "Psychology", "purple", Brain) },
  { match: /\b(statistics|stats)\b/i, theme: theme("statistics", "Statistics", "blue", ChartColumn) },
  { match: /\b(civics|civic)\b/i, theme: theme("civics", "Civics", "slate", Landmark) },
];

const FALLBACK_THEME = theme("general", "Other", "slate", BookOpen);

export const LEGEND_SUBJECTS: SubjectTheme[] = NAMED_THEMES.map((n) => n.theme);

export function subjectTheme(_id: string, name?: string): SubjectTheme {
  const n = String(name || "").trim();
  if (n) {
    for (const entry of NAMED_THEMES) {
      if (entry.match.test(n)) return entry.theme;
    }
  }
  return FALLBACK_THEME;
}

export function subjectIcon(name?: string): LucideIcon {
  return subjectTheme("", name).Icon;
}
