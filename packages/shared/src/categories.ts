/**
 * Canonical category taxonomy shared by the web app, Convex mutations and the
 * MCP servers. Every category written to the database should pass through
 * `normalizeCategory` so free-text values ("Food and Dining",
 * "Utilities & Bills", " shopping ") collapse onto one canonical slug.
 *
 * Pure module with no runtime dependencies, so Convex functions can import it.
 */

export type EntryType = "income" | "expense";

export const EXPENSE_CATEGORIES = [
  { value: "groceries", label: "Groceries" },
  { value: "food", label: "Food & Dining" },
  { value: "rent", label: "Rent & Housing" },
  { value: "home", label: "Home & Household" },
  { value: "utilities", label: "Utilities & Bills" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "transport", label: "Transport & Fuel" },
  { value: "travel", label: "Travel & Holidays" },
  { value: "shopping", label: "Shopping" },
  { value: "clothing", label: "Clothing & Fashion" },
  { value: "health", label: "Health & Fitness" },
  { value: "personal", label: "Personal Care" },
  { value: "entertainment", label: "Entertainment" },
  { value: "education", label: "Education" },
  { value: "family", label: "Family & Kids" },
  { value: "pets", label: "Pets" },
  { value: "gifts", label: "Gifts & Donations" },
  { value: "insurance", label: "Insurance" },
  { value: "loans", label: "Loans & Installments" },
  { value: "credit_card", label: "Credit Card Payments" },
  { value: "taxes", label: "Taxes & Fees" },
  { value: "transfer", label: "Transfer Out (own money)" },
  { value: "other", label: "Other Expense" },
] as const;

export const INCOME_CATEGORIES = [
  { value: "salary", label: "Salary" },
  { value: "freelance", label: "Freelance & Business" },
  { value: "bonus", label: "Bonus & Gift" },
  { value: "investment", label: "Investment" },
  { value: "refund", label: "Refunds & Cashback" },
  { value: "transfer", label: "Transfer In (own money)" },
  { value: "other", label: "Other Income" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]["value"];
export type Category = ExpenseCategory | IncomeCategory;

export const EXPENSE_CATEGORY_VALUES: readonly string[] = EXPENSE_CATEGORIES.map((c) => c.value);
export const INCOME_CATEGORY_VALUES: readonly string[] = INCOME_CATEGORIES.map((c) => c.value);
export const ALL_CATEGORY_VALUES: readonly string[] = [
  ...new Set([...EXPENSE_CATEGORY_VALUES, ...INCOME_CATEGORY_VALUES]),
];

export function categoriesFor(type: EntryType) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

/** Display label for a slug. Unknown values are cleaned and title-cased. */
export function getCategoryLabel(value: string, type?: EntryType): string {
  if (value === "other" && !type) return "Other";
  if (value === "transfer" && !type) return "Transfer";
  const lists =
    type === "income"
      ? [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]
      : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  const match = lists.find((c) => c.value === value);
  if (match) return match.label;
  return value
    .trim()
    .replace(/[_\s]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Word stems that identify a category from a *category name* written by a
 * person or an LLM, e.g. "Furniture & Living" → home. A stem matches when a
 * word starts with it. Stems of 3 letters or fewer must match a whole word
 * (optionally plural) so "bus" doesn't catch "business". Stems containing a
 * space match as a phrase. The longest matching stem wins.
 */
const CATEGORY_NAME_STEMS: Record<Category, string[]> = {
  groceries: [
    "grocer", "supermarket", "vegetable", "fruit", "produce", "provision",
    "keells", "cargills", "arpico",
  ],
  food: [
    "food", "dining", "dine", "restaurant", "meal", "cafe", "coffee", "drink",
    "takeaway", "takeout", "eating", "snack", "bakery", "lunch", "dinner",
    "breakfast", "delivery",
  ],
  rent: ["rent", "housing", "mortgage", "accommodation", "landlord", "boarding", "lease"],
  home: [
    "home", "house", "furniture", "furnishing", "appliance", "household",
    "cleaning", "hardware", "tool", "garden", "decor", "repair",
    "maintenance", "living", "laundry",
  ],
  utilities: [
    "utilit", "bill", "electric", "water", "internet", "phone", "mobile",
    "telecom", "broadband", "reload", "wifi",
  ],
  subscriptions: ["subscription", "membership", "streaming", "saas", "software", "netflix", "spotify"],
  transport: [
    "transport", "fuel", "petrol", "diesel", "car", "vehicle", "taxi", "uber",
    "pickme", "commute", "parking", "bus", "train", "auto", "toll", "tuk",
  ],
  travel: ["travel", "holiday", "vacation", "hotel", "flight", "airfare", "trip", "tour"],
  shopping: [
    "shop", "retail", "electronic", "gadget", "online", "purchase", "amazon",
    "daraz", "misc purchase",
  ],
  clothing: ["cloth", "apparel", "fashion", "shoe", "footwear", "garment", "dress"],
  health: [
    "health", "medical", "medicine", "pharmacy", "doctor", "fitness", "gym",
    "wellness", "dental", "hospital", "clinic", "channeling", "channelling",
  ],
  personal: ["personal", "beauty", "salon", "haircut", "grooming", "cosmetic", "spa", "barber", "self care"],
  entertainment: [
    "entertain", "leisure", "hobby", "hobbies", "movie", "game", "gaming",
    "music", "fun", "recreation", "concert", "event", "party", "sport",
  ],
  education: ["education", "school", "tuition", "course", "class", "book", "university", "college", "training", "exam"],
  family: ["family", "kid", "child", "children", "baby", "parent", "daycare", "childcare"],
  pets: ["pet", "vet", "veterinary", "dog", "cat"],
  gifts: ["gift", "donation", "charity", "present", "wedding", "celebration", "alms", "temple", "church"],
  insurance: ["insurance", "premium", "policy", "assurance"],
  loans: [
    "loan", "debt", "emi", "installment", "instalment", "repayment",
    "lending", "leasing", "bank loan",
  ],
  credit_card: ["credit card", "card payment", "card bill", "credit", "amex", "visa", "mastercard"],
  taxes: ["tax", "fee", "fine", "charge", "bank charge", "government", "levy", "duty", "penalty"],
  salary: ["salary", "wage", "payroll", "paycheck", "earning", "income", "pay"],
  freelance: ["freelance", "business", "consult", "contract", "client", "side", "gig", "upwork", "fiverr"],
  bonus: ["bonus", "reward", "gift", "allowance", "prize"],
  investment: ["invest", "dividend", "interest", "stock", "crypto", "saving", "capital", "fixed deposit"],
  refund: ["refund", "cashback", "reimburse", "return", "rebate"],
  // Only an explicit category name selects this; descriptions never do,
  // because "Family Support — Transfer" is real spending.
  transfer: ["transfer", "self transfer", "own account", "own money", "between accounts"],
  other: [],
};

/**
 * Keywords matched as substrings against a free-text *transaction
 * description*, e.g. "Starbucks latte" → food. Avoid very short keywords
 * here because substring matching has no word boundaries.
 */
const DESCRIPTION_KEYWORDS: Record<Category, string[]> = {
  groceries: [
    "grocery", "groceries", "supermarket", "keells", "cargills", "arpico",
    "food city", "laugfs super", "glomark", " spar ", "whole foods", "trader joe",
    "costco", "aldi", "lidl", "tesco", "vegetables", "fruits", "milk powder",
  ],
  food: [
    "restaurant", "food", "coffee", "lunch", "dinner", "breakfast", "uber eats",
    "doordash", "grubhub", "pickme food", "mcdonald", "kfc", "starbucks",
    "pizza", "burger", "bakery", "cafe", "meal", "snack", "takeout",
    "takeaway", "sushi", "deli", "kottu", "rice and curry", "biryani",
  ],
  rent: [" rent", "landlord", "tenant", "housing", "apartment", "mortgage", "property", "boarding fee"],
  home: [
    "furniture", "sofa", "mattress", "appliance", "washing machine",
    "refrigerator", "fridge", "microwave", "vacuum", "ikea", "hardware",
    "detergent", "cleaning", "plumber", "electrician", "home repair",
    "kitchenware", "bedsheet", "curtain",
  ],
  utilities: [
    "electric", "electricity", "water bill", "internet", "phone bill", "bill payment",
    "utility", "cable", "wifi", "broadband", "mobile plan", "cell plan",
    "heating", "gas bill", "sewer", "trash", " ceb ", " leco ", "dialog", "mobitel",
    " slt ", "hutch", "airtel", "reload",
  ],
  subscriptions: [
    "netflix", "spotify", "hulu", "disney+", "youtube premium", "apple music",
    "icloud", "google one", "chatgpt", "github", "adobe", "prime video",
    "amazon prime", "subscription", "membership", "patreon",
  ],
  transport: [
    "uber", "lyft", "pickme", "fuel", "petrol", "diesel", "parking", "transit",
    "bus fare", "train ticket", "taxi", "metro", "subway", "toll", "car wash",
    "vehicle", "oil change", "mechanic", "gas station", "service station",
    "tuk tuk", "highway",
  ],
  travel: [
    "flight", "airline", "airfare", "hotel", "airbnb", "booking.com", "agoda",
    "expedia", "holiday", "vacation", "resort", "visa fee", " trip",
  ],
  shopping: [
    "amazon", "walmart", "target", "electronics", "mall", "aliexpress", "ebay",
    "daraz", "temu", "shein", "online order", "online shopping", "store",
  ],
  clothing: [
    "clothing", "clothes", "shirt", "trouser", "jeans", "dress",
    "saree", "shoes", "sneaker", "footwear", "odel", "nolimit", "fashion bug",
    "zara", "h&m", "uniqlo",
  ],
  health: [
    "doctor", "dentist", "pharmacy", "hospital", "clinic", "gym", "fitness",
    "therapy", "medical", "medicine", "channeling", "channelling", "lab test",
    "healthguard",
  ],
  personal: ["salon", "haircut", "barber", " spa ", "cosmetic", "skincare", "grooming", "makeup"],
  entertainment: [
    "movie", "game", "concert", "ticket", "theater", "theatre", "cinema",
    "music", " steam ", "playstation", "xbox", "nintendo", "bowling", "party",
  ],
  education: [
    "tuition", "school fee", "course", "udemy", "coursera", "university",
    "college", "exam fee", "textbook", " book",
  ],
  family: ["daycare", "childcare", "kids", "baby", "diaper", "toys", "pocket money"],
  pets: [" vet ", "veterinary", "pet food", "pet shop", "dog food", "cat food", "grooming pet"],
  gifts: ["gift", "donation", "charity", "wedding", "birthday present", " dana ", "temple", "church"],
  insurance: ["insurance", "premium", " aia ", "allianz", "ceylinco", "softlogic life", "policy"],
  loans: [
    "loan", " emi", "installment", "instalment", "repayment", "leasing",
    "lease payment", "mortgage payment",
  ],
  credit_card: [
    "credit card", "card payment", "card bill", "cc payment", "amex payment",
    "visa payment", "mastercard payment",
  ],
  taxes: [
    " tax", "bank charge", "service charge", "late fee", "annual fee", "penalty",
    " fine ", "stamp duty", "govt", "government",
  ],
  salary: [
    "salary", "payroll", "wage", "commission", "payment received",
    "direct deposit", "paycheck", "earnings", "income",
  ],
  freelance: ["freelance", "consulting", "contract", "client payment", "invoice", "upwork", "fiverr"],
  bonus: ["bonus", "gift", "reward", "allowance"],
  investment: ["dividend", "interest", "investment", "stock", "crypto", "fixed deposit", "unit trust"],
  refund: ["refund", "cashback", "reimburse", "rebate", "returned"],
  transfer: [],
  other: [],
};

function allowedFor(type: EntryType | undefined): readonly string[] {
  if (type === "income") return INCOME_CATEGORY_VALUES;
  if (type === "expense") return EXPENSE_CATEGORY_VALUES;
  return ALL_CATEGORY_VALUES;
}

function cleanName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[&+/,_-]+/g, " ")
    .replace(/\band\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemMatches(stem: string, name: string, words: string[]): boolean {
  if (stem.includes(" ")) return name.includes(stem);
  if (stem.length <= 3) return words.some((w) => w === stem || w === `${stem}s`);
  return words.some((w) => w.startsWith(stem));
}

/** Maps a free-text category name onto a canonical slug, or null. */
function matchCategoryName(raw: string, type?: EntryType): Category | null {
  const name = cleanName(raw);
  if (!name) return null;
  const allowed = allowedFor(type);

  const slug = name.replace(/ /g, "_");
  if (allowed.includes(slug)) return slug as Category;

  // Exact label match, e.g. "food dining" for "Food & Dining".
  for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
    if (allowed.includes(c.value) && cleanName(c.label) === name) return c.value;
  }

  const words = name.split(" ");
  let best: Category | null = null;
  let bestLen = 0;
  for (const [category, stems] of Object.entries(CATEGORY_NAME_STEMS)) {
    if (!allowed.includes(category)) continue;
    for (const stem of stems) {
      if (stem.length > bestLen && stemMatches(stem, name, words)) {
        best = category as Category;
        bestLen = stem.length;
      }
    }
  }
  return best;
}

/**
 * Suggests a category from a transaction description.
 * Returns "other" when nothing matches.
 */
export function suggestCategory(description: string, type?: EntryType): Category {
  // Pad and collapse punctuation so " ceb " style keywords match whole words.
  const cleaned = description.toLowerCase().replace(/[^a-z0-9.+&']+/g, " ").trim();
  if (!cleaned) return "other";
  const lower = ` ${cleaned} `;
  const allowed = allowedFor(type);

  let best: Category = "other";
  let bestLen = 0;
  for (const [category, keywords] of Object.entries(DESCRIPTION_KEYWORDS)) {
    if (!allowed.includes(category)) continue;
    for (const keyword of keywords) {
      if (keyword.length > bestLen && lower.includes(keyword)) {
        best = category as Category;
        bestLen = keyword.length;
      }
    }
  }
  return best;
}

/**
 * Returns the canonical slug for any category string.
 *
 * 1. Matches the category name (case, spacing and "&" insensitive, synonyms).
 * 2. Falls back to keywords in the plaintext description, when provided.
 * 3. Otherwise "other".
 */
export function normalizeCategory(
  raw: string | null | undefined,
  type?: EntryType,
  description?: string,
): Category {
  const fromName = raw ? matchCategoryName(raw, type) : null;
  if (fromName && fromName !== "other") return fromName;
  if (description) {
    const fromDescription = suggestCategory(description, type);
    if (fromDescription !== "other") return fromDescription;
  }
  return "other";
}

/**
 * Transfers move the user's own money (bank → cash wallet, currency
 * exchange). They still change wallet balances but are excluded from income,
 * expense, chart and budget totals.
 */
export function isTransferCategory(category: string, type?: EntryType): boolean {
  return normalizeCategory(category, type) === "transfer";
}
