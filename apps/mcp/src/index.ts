import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../web/convex/_generated/api.js";
import { deriveKey, base64ToSalt, decrypt, encrypt } from "@devcents/shared";

// ─── Environment configuration ──────────────────────────────────────────────

const CONVEX_URL =
  process.env.CONVEX_URL ||
  process.env.VITE_CONVEX_URL ||
  "http://127.0.0.1:3210";
const API_KEY = process.env.DEVCENTS_API_KEY;
const PASSPHRASE = process.env.DEVCENTS_PASSPHRASE;

if (!API_KEY) {
  console.error(
    "Missing DEVCENTS_API_KEY environment variable. Have you generated a token in DevCents Settings?",
  );
  process.exit(1);
}

if (!PASSPHRASE) {
  console.error("Missing DEVCENTS_PASSPHRASE environment variable.");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const server = new McpServer({
  name: "DevCents MCP Server",
  version: "1.0.0",
});

// ─── Cryptography Helper ────────────────────────────────────────────────────

/**
 * Creates the AES-GCM Key asynchronously. We need the salt from the server first.
 * If we can't get the salt via MCP yet (because the existing backend methods
 * don't expose it to the token), we should fetch it or hardcode.
 * Wait, `mcpGetTransactions` doesn't return the salt! That means we can't derive the key.
 */

// Let's add a helper to hash the provided API_KEY so we can send it to Convex
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Tools ──────────────────────────────────────────────────────────────────

async function getEncryptionKey(tokenHash: string) {
  if (!PASSPHRASE) throw new Error("No passphrase provided");
  const saltB64 = await client.query(api.mcp.mcpGetEncryptionSalt, {
    tokenHash,
  });
  const salt = base64ToSalt(saltB64);
  return await deriveKey(PASSPHRASE, salt);
}

// @ts-expect-error Type instantiation is excessively deep due to zod inference
server.tool(
  "get_transactions",
  "Get the user's recent DevCents transactions. The MCP server decrypts them automatically.",
  {
    limit: z
      .number()
      .optional()
      .describe("Number of transactions to fetch, defaults to 50"),
  },
  async ({ limit }) => {
    try {
      const tokenHash = await hashToken(API_KEY as string);
      const key = await getEncryptionKey(tokenHash);

      const transactions = await client.query(api.mcp.mcpGetTransactions, {
        tokenHash,
        limit,
      });

      const decrypted = await Promise.all(
        transactions.map(async (t) => {
          if (!t.encrypted) return t;
          try {
            return {
              ...t,
              amount:
                typeof t.amount === "string"
                  ? parseFloat(await decrypt(t.amount, key))
                  : t.amount,
              description: await decrypt(t.description, key),
            };
          } catch (e) {
            return { ...t, description: "[Decryption Failed]" };
          }
        }),
      );

      return {
        content: [{ type: "text", text: JSON.stringify(decrypted, null, 2) }],
      };
    } catch (e: any) {
      return {
        content: [
          { type: "text", text: `Error fetching transactions: ${e.message}` },
        ],
        isError: true,
      };
    }
  },
);

// @ts-expect-error Type instantiation is excessively deep due to zod inference
server.tool(
  "add_transaction",
  "Add a new expense or income to DevCents. Automatically encrypted before saving.",
  {
    amount: z.number().describe("The numerical amount"),
    type: z
      .enum(["income", "expense"])
      .describe("Whether it is an income or expense"),
    category: z
      .string()
      .describe("The category (e.g., 'Food and Dining', 'Shopping')"),
    description: z.string().describe("Description for the transaction"),
    currency: z
      .string()
      .optional()
      .describe(
        "Currency code (e.g., 'USD', 'LKR'). Leaves empty if default base currency.",
      ),
    date: z
      .number()
      .optional()
      .describe(
        "Date as Unix timestamp. Current time will be used if omitted.",
      ),
  },
  async ({ amount, type, category, description, currency, date }) => {
    try {
      const tokenHash = await hashToken(API_KEY as string);
      const key = await getEncryptionKey(tokenHash);

      const encryptedAmount = await encrypt(amount.toString(), key);
      const encryptedDescription = await encrypt(description, key);

      const txDate = date || Date.now();

      await client.mutation(api.mcp.mcpAddTransaction, {
        tokenHash,
        amount: encryptedAmount,
        type,
        category,
        description: encryptedDescription,
        currency,
        date: txDate,
        encrypted: true,
      });

      return {
        content: [
          {
            type: "text",
            text: `Successfully encrypted and added transaction: ${description} for ${amount}.`,
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          { type: "text", text: `Error adding transaction: ${e.message}` },
        ],
        isError: true,
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DevCents MCP Server is running securely.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
