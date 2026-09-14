#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../web/convex/_generated/api.js";
import { deriveKey, base64ToSalt, decrypt, encrypt, hashToken } from "@devcents/shared";

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

// ─── Key derivation helper ──────────────────────────────────────────────────

async function getEncryptionKey(tokenHash: string) {
  if (!PASSPHRASE) throw new Error("No passphrase provided");
  const saltB64 = await client.query(api.mcp.mcpGetEncryptionSalt, {
    tokenHash,
  });
  const salt = base64ToSalt(saltB64);
  return await deriveKey(PASSPHRASE, salt);
}

// ─── MCP Server Factory ─────────────────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name: "DevCents MCP Server",
    version: "2.0.0",
  });

  // Tool: get_transactions
  server.registerTool(
    "get_transactions",
    {
      description:
        "Get the user's recent DevCents transactions. The MCP server decrypts them automatically.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe("Number of transactions to fetch, defaults to 50"),
      },
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
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error fetching transactions: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Tool: add_transaction
  server.registerTool(
    "add_transaction",
    {
      description:
        "Add a new expense or income to DevCents. Automatically encrypted before saving.",
      inputSchema: {
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
          content: [{ type: "text", text: "Transaction encrypted and saved successfully." }],
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error adding transaction: ${message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ─── Entry Point ────────────────────────────────────────────────────────────

async function main() {
  const handle = serveStdio(createServer);
  console.error("DevCents MCP Server (v2.0) is running securely over stdio.");

  const shutdown = async () => {
    try {
      await handle.close();
    } catch {
      // ignore errors during close
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
