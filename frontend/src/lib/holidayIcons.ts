import {
  Atom,
  BookOpen,
  Building2,
  Flag,
  Flame,
  HardHat,
  Landmark,
  Moon,
  MoonStar,
  Mountain,
  Palmtree,
  Sparkles,
  Star,
  type LucideIcon,
} from "lucide-react";

/** Name → icon for well-known Pakistan / Islamic holidays. */
const HOLIDAY_ICONS: { match: RegExp; icon: LucideIcon }[] = [
  { match: /kashmir/i, icon: Mountain },
  { match: /pakistan/i, icon: Flag },
  { match: /labour|labor/i, icon: HardHat },
  { match: /takbeer/i, icon: Atom },
  { match: /independence/i, icon: Sparkles },
  { match: /iqbal/i, icon: BookOpen },
  { match: /quaid/i, icon: Landmark },
  { match: /fitr/i, icon: Moon },
  { match: /adha/i, icon: MoonStar },
  { match: /ashura/i, icon: Flame },
  { match: /milad/i, icon: Star },
];

/** Pick an icon for a holiday from its code/name, falling back on its category. */
export function holidayIconFor(holiday: {
  code?: string;
  name?: string;
  shortName?: string;
  category?: string;
}): LucideIcon {
  const key = `${holiday.code || ""} ${holiday.name || ""} ${holiday.shortName || ""}`;
  const found = HOLIDAY_ICONS.find((row) => row.match.test(key));
  if (found) return found.icon;
  if (holiday.category === "vacation") return Palmtree;
  if (holiday.category === "islamic") return Moon;
  if (holiday.category === "government") return Building2;
  return Flag;
}
