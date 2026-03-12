const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: [
    "grocery",
    "groceries",
    "restaurant",
    "food",
    "coffee",
    "lunch",
    "dinner",
    "breakfast",
    "uber eats",
    "doordash",
    "grubhub",
    "mcdonald",
    "starbucks",
    "pizza",
    "burger",
    "bakery",
    "cafe",
    "eat",
    "meal",
    "snack",
    "takeout",
    "sushi",
    "deli",
    "bar",
    "pub",
    "kitchen",
  ],
  transport: [
    "uber",
    "lyft",
    "gas",
    "fuel",
    "parking",
    "transit",
    "bus",
    "train",
    "flight",
    "airline",
    "taxi",
    "metro",
    "subway",
    "toll",
    "car wash",
    "auto",
    "vehicle",
    "oil change",
    "mechanic",
    "rental car",
  ],
  utilities: [
    "electric",
    "electricity",
    "water",
    "internet",
    "phone",
    "utility",
    "bill",
    "subscription",
    "cable",
    "wifi",
    "broadband",
    "mobile plan",
    "cell plan",
    "heating",
    "gas bill",
    "sewer",
    "trash",
    "waste",
  ],
  entertainment: [
    "netflix",
    "spotify",
    "hulu",
    "disney",
    "movie",
    "game",
    "gaming",
    "concert",
    "ticket",
    "theater",
    "theatre",
    "cinema",
    "music",
    "stream",
    "youtube",
    "twitch",
    "apple tv",
    "hbo",
    "amazon prime",
    "book",
  ],
  shopping: [
    "amazon",
    "walmart",
    "target",
    "clothing",
    "shoes",
    "electronics",
    "store",
    "mall",
  ],
  health: [
    "doctor",
    "dentist",
    "pharmacy",
    "hospital",
    "clinic",
    "gym",
    "fitness",
    "therapy",
    "medical",
    "medicine",
  ],
  salary: [
    "salary",
    "payroll",
    "wage",
    "commission",
    "freelance",
    "income",
    "payment received",
    "direct deposit",
    "pay",
    "earnings",
    "consulting",
    "contract",
  ],
  bonus: ["bonus", "gift", "reward"],
  investment: ["dividend", "interest", "investment", "stock", "crypto"],
  other: [],
};

/**
 * Suggests a category based on the transaction description.
 * Returns the best matching category or "other" if no match is found.
 */
export function suggestCategory(description: string): string {
  const lower = description.toLowerCase().trim();
  if (!lower) return "other";

  let bestMatch = "other";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "other") continue;
    for (const keyword of keywords) {
      if (lower.includes(keyword) && keyword.length > bestScore) {
        bestMatch = category;
        bestScore = keyword.length;
      }
    }
  }

  return bestMatch;
}

export const INCOME_CATEGORIES = [
  { value: "salary", label: "Salary" },
  { value: "bonus", label: "Bonus & Gift" },
  { value: "investment", label: "Investment" },
  { value: "other", label: "Other Income" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "food", label: "Food & Dining" },
  { value: "transport", label: "Transport" },
  { value: "utilities", label: "Utilities & Bills" },
  { value: "entertainment", label: "Entertainment" },
  { value: "shopping", label: "Shopping" },
  { value: "health", label: "Health & Fitness" },
  { value: "other", label: "Other Expense" },
] as const;

export const CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  food: "#f97316",
  transport: "#3b82f6",
  utilities: "#a855f7",
  entertainment: "#ec4899",
  shopping: "#f43f5e",
  health: "#14b8a6",
  salary: "#22c55e",
  bonus: "#10b981",
  investment: "#34d399",
  other: "#6b7280",
};
