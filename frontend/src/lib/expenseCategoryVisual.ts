import {
  Banknote,
  Building2,
  Car,
  Coffee,
  Fuel,
  HandHeart,
  Megaphone,
  PenLine,
  Phone,
  Printer,
  Receipt,
  Shapes,
  Smartphone,
  Users,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { expenseCategoryLabel, type AcademyExpense, type ExpenseCategoryConfig } from "@/lib/studentManagementApi";

export type CategoryVisual = { Icon: LucideIcon; wrap: string; color: string };

const BLUE: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#dbeafe]",
  color: "text-[#2563eb]",
};
const GREEN: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#d1fae5]",
  color: "text-[#059669]",
};
const VIOLET: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#ede9fe]",
  color: "text-[#7c3aed]",
};
const AMBER: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#ffedd5]",
  color: "text-[#ea580c]",
};
const ROSE: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#ffe4e6]",
  color: "text-[#e11d48]",
};
const YELLOW: Pick<CategoryVisual, "wrap" | "color"> = {
  wrap: "bg-[#fef3c7]",
  color: "text-[#d97706]",
};

/** First matching rule wins, so more specific names stay ahead of general ones. */
const ICON_RULES: { test: RegExp; Icon: LucideIcon; tone: Pick<CategoryVisual, "wrap" | "color"> }[] = [
  { test: /ufone|u fone|mobile card/i, Icon: Smartphone, tone: BLUE },
  { test: /postpaid|phone/i, Icon: Phone, tone: VIOLET },
  { test: /ptcl|internet|broadband|wifi/i, Icon: Wifi, tone: BLUE },
  { test: /electric|power|utilit/i, Icon: Zap, tone: YELLOW },
  { test: /donat|charit/i, Icon: HandHeart, tone: ROSE },
  { test: /entertain|refresh|tea|coffee/i, Icon: Coffee, tone: AMBER },
  { test: /equip/i, Icon: Wrench, tone: AMBER },
  { test: /petrol|fuel|lubric|oil/i, Icon: Fuel, tone: YELLOW },
  { test: /stationer|stationary|suppl/i, Icon: PenLine, tone: GREEN },
  { test: /print|photo/i, Icon: Printer, tone: BLUE },
  { test: /wage|salar|payroll/i, Icon: Wallet, tone: GREEN },
  { test: /repair|maint/i, Icon: Wrench, tone: AMBER },
  { test: /travel|transport/i, Icon: Car, tone: BLUE },
  { test: /advert|market/i, Icon: Megaphone, tone: ROSE },
  { test: /cash|paid to/i, Icon: Banknote, tone: GREEN },
  { test: /rent|building/i, Icon: Building2, tone: BLUE },
  { test: /staff/i, Icon: Users, tone: VIOLET },
  { test: /misc|other/i, Icon: Shapes, tone: VIOLET },
];

/** Same name/key matching used on Academic Setup → Expense Categories. */
export function categoryVisual(row: Pick<ExpenseCategoryConfig, "key" | "name">): CategoryVisual {
  const label = `${row.key} ${row.name}`;
  const match = ICON_RULES.find((rule) => rule.test.test(label));
  if (match) return { Icon: match.Icon, ...match.tone };
  return { Icon: Receipt, ...BLUE };
}

export function expenseRowCategoryVisual(
  row: Pick<AcademyExpense, "category" | "categoryOther">,
  categories: Pick<ExpenseCategoryConfig, "key" | "name">[],
): CategoryVisual {
  const configured = categories.find((c) => c.key === row.category);
  return categoryVisual({
    key: row.category,
    name: configured?.name || expenseCategoryLabel(row, categories),
  });
}
