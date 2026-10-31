import type { LucideIcon } from "lucide-react";
import {
  UtensilsCrossed,
  ShoppingCart,
  Home,
  Sofa,
  Zap,
  Tv,
  Car,
  Plane,
  ShoppingBag,
  Shirt,
  HeartPulse,
  Sparkles,
  Gamepad2,
  GraduationCap,
  Users,
  PawPrint,
  HandHeart,
  ShieldCheck,
  Landmark,
  CreditCard,
  Receipt,
  Banknote,
  Briefcase,
  Gift,
  TrendingUp,
  RotateCcw,
  ArrowLeftRight,
  MoreHorizontal,
} from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoryLabel,
  normalizeCategory,
  type EntryType,
} from "@devcents/shared/categories";

export {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  getCategoryLabel,
  normalizeCategory,
  suggestCategory,
  categoriesFor,
  isTransferCategory,
} from "@devcents/shared/categories";
export type { EntryType, Category } from "@devcents/shared/categories";

/** Expense options first, then income options, without a duplicate "other". */
export const CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES.filter((c) => c.value !== "other" && c.value !== "transfer"),
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  groceries: "#84cc16",
  food: "#f59e0b",
  rent: "#0ea5e9",
  home: "#a16207",
  utilities: "#a855f7",
  subscriptions: "#7c3aed",
  transport: "#6366f1",
  travel: "#06b6d4",
  shopping: "#f43f5e",
  clothing: "#d946ef",
  health: "#14b8a6",
  personal: "#fca5a5",
  entertainment: "#ec4899",
  education: "#3b82f6",
  family: "#f97316",
  pets: "#10b981",
  gifts: "#be185d",
  insurance: "#facc15",
  loans: "#dc2626",
  credit_card: "#4ade80",
  taxes: "#5eead4",
  salary: "#22c55e",
  freelance: "#0d9488",
  bonus: "#10b981",
  investment: "#34d399",
  refund: "#a3e635",
  transfer: "#94a3b8",
  other: "#6b7280",
};

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  food: UtensilsCrossed,
  rent: Home,
  home: Sofa,
  utilities: Zap,
  subscriptions: Tv,
  transport: Car,
  travel: Plane,
  shopping: ShoppingBag,
  clothing: Shirt,
  health: HeartPulse,
  personal: Sparkles,
  entertainment: Gamepad2,
  education: GraduationCap,
  family: Users,
  pets: PawPrint,
  gifts: HandHeart,
  insurance: ShieldCheck,
  loans: Landmark,
  credit_card: CreditCard,
  taxes: Receipt,
  salary: Banknote,
  freelance: Briefcase,
  bonus: Gift,
  investment: TrendingUp,
  refund: RotateCcw,
  transfer: ArrowLeftRight,
  other: MoreHorizontal,
};

export type CategoryMeta = {
  key: string;
  label: string;
  color: string;
  Icon: LucideIcon;
};

/**
 * Display info for any stored category value. Legacy free-text values
 * ("Food and Dining", "Utilities & Bills") resolve to their canonical slug.
 */
export function getCategoryMeta(raw: string, type?: EntryType): CategoryMeta {
  const key = normalizeCategory(raw, type);
  return {
    key,
    label: getCategoryLabel(key, type),
    color: CATEGORY_COLORS[key] ?? CATEGORY_COLORS.other,
    Icon: CATEGORY_ICONS[key] ?? CATEGORY_ICONS.other,
  };
}
