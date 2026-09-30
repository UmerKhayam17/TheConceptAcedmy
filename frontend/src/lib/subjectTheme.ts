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

export type SubjectTheme = {
  key: string;
  label: string;
  bg: string;
  border: string;
  text: string;
  accent: string;
  accentHex: string;
  icon: string;
  Icon: LucideIcon;
};

/** Subject palettes + icons — matched by subject name (not hashed). */
const NAMED_THEMES: Array<{ match: RegExp; theme: SubjectTheme }> = [
  {
    match: /\b(bio|biology|botany|zoology)\b/i,
    theme: {
      key: "biology",
      label: "Biology",
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-700",
      accent: "bg-blue-500",
      accentHex: "#3B82F6",
      icon: "text-blue-700",
      Icon: Dna,
    },
  },
  {
    match: /\b(chem|chemistry)\b/i,
    theme: {
      key: "chemistry",
      label: "Chemistry",
      bg: "bg-violet-50",
      border: "border-violet-200",
      text: "text-violet-700",
      accent: "bg-violet-500",
      accentHex: "#8B5CF6",
      icon: "text-violet-700",
      Icon: FlaskConical,
    },
  },
  {
    match: /\b(ict|information\s*technology)\b/i,
    theme: {
      key: "ict",
      label: "ICT",
      bg: "bg-sky-50",
      border: "border-sky-200",
      text: "text-sky-700",
      accent: "bg-sky-500",
      accentHex: "#0EA5E9",
      icon: "text-sky-700",
      Icon: Laptop,
    },
  },
  {
    match: /\b(computer\s*science|computing|coding|programming|\bcs\b)\b/i,
    theme: {
      key: "computer",
      label: "Computer Science",
      bg: "bg-cyan-50",
      border: "border-cyan-200",
      text: "text-cyan-700",
      accent: "bg-cyan-500",
      accentHex: "#06B6D4",
      icon: "text-cyan-700",
      Icon: Monitor,
    },
  },
  {
    match: /\b(math|maths|mathematics|algebra|geometry|calculus)\b/i,
    theme: {
      key: "mathematics",
      label: "Mathematics",
      bg: "bg-purple-50",
      border: "border-purple-200",
      text: "text-purple-700",
      accent: "bg-purple-500",
      accentHex: "#A855F7",
      icon: "text-purple-700",
      Icon: Calculator,
    },
  },
  {
    match: /\b(phys|physics)\b/i,
    theme: {
      key: "physics",
      label: "Physics",
      bg: "bg-orange-50",
      border: "border-orange-200",
      text: "text-orange-700",
      accent: "bg-orange-500",
      accentHex: "#F97316",
      icon: "text-orange-700",
      Icon: Atom,
    },
  },
  {
    match: /\b(english)\b/i,
    theme: {
      key: "english",
      label: "English",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-700",
      accent: "bg-emerald-500",
      accentHex: "#10B981",
      icon: "text-emerald-700",
      Icon: BookOpen,
    },
  },
  {
    match: /\b(urdu)\b/i,
    theme: {
      key: "urdu",
      label: "Urdu",
      bg: "bg-teal-50",
      border: "border-teal-200",
      text: "text-teal-700",
      accent: "bg-teal-500",
      accentHex: "#14B8A6",
      icon: "text-teal-700",
      Icon: Languages,
    },
  },
  {
    match: /\b(islamiat|islamic\s*studies|islamiyat|deeniyat)\b/i,
    theme: {
      key: "islamiat",
      label: "Islamiat",
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-800",
      accent: "bg-amber-500",
      accentHex: "#F59E0B",
      icon: "text-amber-800",
      Icon: Landmark,
    },
  },
  {
    match: /\b(pakistan\s*studies|pak\s*studies|pakistan\s*study)\b/i,
    theme: {
      key: "pakistan-studies",
      label: "Pakistan Studies",
      bg: "bg-green-50",
      border: "border-green-200",
      text: "text-green-700",
      accent: "bg-green-600",
      accentHex: "#16A34A",
      icon: "text-green-700",
      Icon: Map,
    },
  },
  {
    match: /\b(geography|geo)\b/i,
    theme: {
      key: "geography",
      label: "Geography",
      bg: "bg-lime-50",
      border: "border-lime-200",
      text: "text-lime-800",
      accent: "bg-lime-500",
      accentHex: "#84CC16",
      icon: "text-lime-800",
      Icon: Globe2,
    },
  },
  {
    match: /\b(history)\b/i,
    theme: {
      key: "history",
      label: "History",
      bg: "bg-stone-50",
      border: "border-stone-200",
      text: "text-stone-700",
      accent: "bg-stone-500",
      accentHex: "#78716C",
      icon: "text-stone-700",
      Icon: ScrollText,
    },
  },
  {
    match: /\b(art|arts|drawing|fine\s*arts)\b/i,
    theme: {
      key: "art",
      label: "Art",
      bg: "bg-pink-50",
      border: "border-pink-200",
      text: "text-pink-700",
      accent: "bg-pink-500",
      accentHex: "#EC4899",
      icon: "text-pink-700",
      Icon: Palette,
    },
  },
  {
    match: /\b(physical\s*education|pe|sports|health\s*&\s*physical)\b/i,
    theme: {
      key: "pe",
      label: "Physical Education",
      bg: "bg-rose-50",
      border: "border-rose-200",
      text: "text-rose-700",
      accent: "bg-rose-500",
      accentHex: "#F43F5E",
      icon: "text-rose-700",
      Icon: Dumbbell,
    },
  },
  {
    match: /\b(music)\b/i,
    theme: {
      key: "music",
      label: "Music",
      bg: "bg-fuchsia-50",
      border: "border-fuchsia-200",
      text: "text-fuchsia-700",
      accent: "bg-fuchsia-500",
      accentHex: "#D946EF",
      icon: "text-fuchsia-700",
      Icon: Music2,
    },
  },
  {
    match: /\b(general\s*science|science)\b/i,
    theme: {
      key: "general-science",
      label: "General Science",
      bg: "bg-indigo-50",
      border: "border-indigo-200",
      text: "text-indigo-700",
      accent: "bg-indigo-500",
      accentHex: "#6366F1",
      icon: "text-indigo-700",
      Icon: Microscope,
    },
  },
  {
    match: /\b(economics|eco)\b/i,
    theme: {
      key: "economics",
      label: "Economics",
      bg: "bg-yellow-50",
      border: "border-yellow-200",
      text: "text-yellow-800",
      accent: "bg-yellow-500",
      accentHex: "#EAB308",
      icon: "text-yellow-800",
      Icon: ChartNoAxesCombined,
    },
  },
  {
    match: /\b(psychology)\b/i,
    theme: {
      key: "psychology",
      label: "Psychology",
      bg: "bg-violet-50",
      border: "border-violet-200",
      text: "text-violet-800",
      accent: "bg-violet-400",
      accentHex: "#A78BFA",
      icon: "text-violet-800",
      Icon: Brain,
    },
  },
  {
    match: /\b(statistics|stats)\b/i,
    theme: {
      key: "statistics",
      label: "Statistics",
      bg: "bg-blue-50",
      border: "border-blue-200",
      text: "text-blue-800",
      accent: "bg-blue-400",
      accentHex: "#60A5FA",
      icon: "text-blue-800",
      Icon: ChartColumn,
    },
  },
  {
    match: /\b(civics|civic)\b/i,
    theme: {
      key: "civics",
      label: "Civics",
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-700",
      accent: "bg-slate-500",
      accentHex: "#64748B",
      icon: "text-slate-700",
      Icon: Landmark,
    },
  },
];

const FALLBACK_THEME: SubjectTheme = {
  key: "general",
  label: "Other",
  bg: "bg-slate-50",
  border: "border-slate-200",
  text: "text-slate-700",
  accent: "bg-slate-500",
  accentHex: "#64748B",
  icon: "text-slate-700",
  Icon: BookOpen,
};

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
