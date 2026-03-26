import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  transactions: defineTable({
    userId: v.string(),
    amount: v.union(v.number(), v.string()), // number (plaintext) or string (encrypted)
    currency: v.optional(v.string()), // USD, LKR, JPY
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(), // plaintext or encrypted string
    date: v.number(), // Unix timestamp
    encrypted: v.optional(v.boolean()), // true if fields are encrypted
  }).index("by_user", ["userId"]),

  // One-time future items (planned income/expenses).
  planned: defineTable({
    userId: v.string(),
    amount: v.union(v.number(), v.string()), // number (plaintext) or string (encrypted)
    currency: v.optional(v.string()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(), // plaintext or encrypted string
    date: v.number(), // Unix timestamp (local date chosen by user)
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("posted"),
        v.literal("skipped"),
      ),
    ),
    postedTransactionId: v.optional(v.id("transactions")),
    encrypted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"]),

  // Repeating items (salary, rent, subscriptions).
  recurring: defineTable({
    userId: v.string(),
    amount: v.union(v.number(), v.string()), // number (plaintext) or string (encrypted)
    currency: v.optional(v.string()),
    type: v.union(v.literal("income"), v.literal("expense")),
    category: v.string(),
    description: v.string(), // plaintext or encrypted string
    startDate: v.number(), // Unix timestamp (first occurrence)
    cadence: v.union(
      v.literal("weekly"),
      v.literal("biweekly"),
      v.literal("monthly"),
      v.literal("yearly"),
    ),
    active: v.optional(v.boolean()),
    encrypted: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_startDate", ["userId", "startDate"]),

  // Tracks which recurring occurrences have been posted to the ledger.
  postedRecurringOccurrences: defineTable({
    userId: v.string(),
    recurringId: v.id("recurring"),
    date: v.number(),
  })
    .index("by_recurring_date", ["recurringId", "date"])
    .index("by_user", ["userId"]),

  budgets: defineTable({
    userId: v.string(),
    month: v.string(), // Format: "YYYY-MM"
    limit: v.number(),
  }).index("by_user_month", ["userId", "month"]),

  encryption_settings: defineTable({
    userId: v.string(),
    salt: v.string(), // base64-encoded PBKDF2 salt
    verificationHash: v.string(), // encrypted verification string
  }).index("by_user", ["userId"]),

  user_settings: defineTable({
    userId: v.string(),
    currency: v.string(), // Base currency preference, e.g., "USD", "LKR", "JPY"
  }).index("by_user", ["userId"]),

  apiTokens: defineTable({
    userId: v.string(),
    tokenHash: v.string(),
    name: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_hash", ["tokenHash"]),
});
