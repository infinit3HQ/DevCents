import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api.js";
import {
  hashToken,
  decrypt,
  encrypt,
  base64ToSalt,
  deriveKey,
  importKeyFromBase64,
} from "@devcents/shared";

function getConvexUrl(): string {
  const url =
    (typeof process !== "undefined" && process.env && process.env.CONVEX_URL) ||
    (typeof process !== "undefined" && process.env && process.env.VITE_CONVEX_URL) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_CONVEX_URL) ||
    "http://127.0.0.1:3210";
  return url;
}

function getConvexClient() {
  return new ConvexHttpClient(getConvexUrl());
}

export const SUPPORTED_PROTOCOL_VERSIONS = [
  "2026-07-28", // MCP 2.0 draft
  "2025-11-25", // Latest standard SDK (OpenClaw, Claude, Cursor)
  "2025-06-18",
  "2025-03-26",
  "2024-11-05", // Legacy MCP 1.0
  "2024-10-07",
];

export const DEFAULT_PROTOCOL_VERSION = "2025-11-25";

export function negotiateProtocolVersion(requested?: string): string {
  if (!requested) {
    return DEFAULT_PROTOCOL_VERSION;
  }
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

export function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, X-DevCents-API-Key, X-DevCents-Passphrase",
  };
}

const TOOLS = [
  {
    name: "get_transactions",
    description:
      "Get the user's recent DevCents transactions. The MCP server decrypts them automatically.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        limit: {
          type: "number",
          description: "Number of transactions to fetch, defaults to 50",
        },
      },
    },
  },
  {
    name: "add_transaction",
    description:
      "Add a new expense or income to DevCents. Automatically encrypted before saving.",
    inputSchema: {
      type: "object",
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        amount: {
          type: "number",
          description: "The numerical amount",
        },
        type: {
          type: "string",
          enum: ["income", "expense"],
          description: "Whether it is an income or expense",
        },
        category: {
          type: "string",
          description: "The category (e.g., 'Food and Dining', 'Shopping')",
        },
        description: {
          type: "string",
          description: "Description for the transaction",
        },
        currency: {
          type: "string",
          description:
            "Currency code (e.g., 'USD', 'LKR'). Leaves empty if default base currency.",
        },
        date: {
          type: "number",
          description:
            "Date as Unix timestamp. Current time will be used if omitted.",
        },
      },
      required: ["amount", "type", "category", "description"],
    },
  },
];

async function resolveEncryptionKey(
  client: ConvexHttpClient,
  tokenHash: string,
  passphraseHeader?: string,
): Promise<{ key: CryptoKey | null; error?: string }> {
  // 1. Check if key is attached directly to the API token
  let tokenLookupError: string | undefined;
  try {
    const keyB64 = await client.query(api.mcp.mcpGetTokenKey, { tokenHash });
    if (keyB64) {
      const key = await importKeyFromBase64(keyB64);
      return { key };
    }
  } catch (err: any) {
    tokenLookupError = err?.message || String(err);
    console.error("[mcp] Error querying mcpGetTokenKey:", err);
  }

  // 2. Check server environment variable or header
  const serverPassphrase =
    (typeof process !== "undefined" && process.env && process.env.DEVCENTS_PASSPHRASE) ||
    passphraseHeader;

  if (serverPassphrase) {
    try {
      const saltB64 = await client.query(api.mcp.mcpGetEncryptionSalt, {
        tokenHash,
      });
      const salt = base64ToSalt(saltB64);
      const key = await deriveKey(serverPassphrase, salt);
      return { key };
    } catch (err: any) {
      console.error("[mcp] Error querying salt or deriving key:", err);
      return {
        key: null,
        error: `Failed to derive key from server passphrase: ${err?.message || String(err)}`,
      };
    }
  }

  if (tokenLookupError) {
    return {
      key: null,
      error: `Convex token lookup failed: ${tokenLookupError}`,
    };
  }

  return {
    key: null,
    error:
      "No encryption key is attached to this token in Convex. If you just created this token, ensure you used 'Generate Remote Token' and entered your passphrase. Otherwise, set DEVCENTS_PASSPHRASE on the server.",
  };
}

export function handleMcpOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}

export function handleMcpGet(): Response {
  return Response.json(
    {
      status: "ok",
      service: "DevCents Remote Web MCP Server",
      version: "2.0.0",
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
      endpoint: "/mcp",
      tools: TOOLS.map((t) => t.name),
    },
    {
      headers: getCorsHeaders(),
    },
  );
}

export async function handleMcpPost(request: Request): Promise<Response> {
  let rawBody: any;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: Invalid JSON" },
      },
      { status: 400, headers: getCorsHeaders() },
    );
  }

  const client = getConvexClient();

  // Extract auth token from Authorization header or X-DevCents-API-Key
  const authHeader = request.headers.get("authorization");
  const apiKeyHeader = request.headers.get("x-devcents-api-key");
  const passphraseHeader = request.headers.get("x-devcents-passphrase") || undefined;

  let rawToken = "";
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    rawToken = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    rawToken = apiKeyHeader.trim();
  }

  const handleSingleMessage = async (msg: any): Promise<any> => {
    if (!msg || typeof msg !== "object") {
      return {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid Request" },
      };
    }

    const { id, method: rpcMethod, params } = msg;

    // Handle notifications (no id)
    if (id === undefined || id === null) {
      return null;
    }

    // 1. initialize / server/discover
    if (rpcMethod === "initialize" || rpcMethod === "server/discover") {
      const protocolVersion = negotiateProtocolVersion(params?.protocolVersion);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: {
            tools: { listChanged: true },
          },
          serverInfo: {
            name: "DevCents MCP Server",
            version: "2.0.0",
          },
        },
      };
    }

    // 2. ping
    if (rpcMethod === "ping") {
      return {
        jsonrpc: "2.0",
        id,
        result: {},
      };
    }

    // 3. tools/list
    if (rpcMethod === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS,
        },
      };
    }

    // 4. tools/call
    if (rpcMethod === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      // Allow token in tool arguments as fallback if not in headers
      const effectiveToken = rawToken || toolArgs.api_key;
      if (!effectiveToken) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: "Authentication error: Missing API key. Provide Authorization: Bearer <API_KEY> header.",
              },
            ],
          },
        };
      }

      try {
        const tokenHash = await hashToken(effectiveToken);
        const { key, error: keyError } = await resolveEncryptionKey(
          client,
          tokenHash,
          passphraseHeader,
        );

        if (!key) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Decryption error: ${keyError || "No encryption key available."}`,
                },
              ],
            },
          };
        }

        if (toolName === "get_transactions") {
          const limit =
            typeof toolArgs.limit === "number" ? toolArgs.limit : 50;

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
              } catch {
                return { ...t, description: "[Decryption Failed]" };
              }
            }),
          );

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(decrypted, null, 2),
                },
              ],
            },
          };
        }

        if (toolName === "add_transaction") {
          const { amount, type, category, description, currency, date } =
            toolArgs;

          if (
            typeof amount !== "number" ||
            !type ||
            !category ||
            !description
          ) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                isError: true,
                content: [
                  {
                    type: "text",
                    text: "Invalid arguments: amount, type, category, description are required.",
                  },
                ],
              },
            };
          }

          const encryptedAmount = await encrypt(amount.toString(), key);
          const encryptedDescription = await encrypt(description, key);
          const txDate = typeof date === "number" ? date : Date.now();

          const txId = await client.mutation(api.mcp.mcpAddTransaction, {
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
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Transaction encrypted and saved successfully (ID: ${txId})`,
                },
              ],
            },
          };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Unknown tool: ${toolName}`,
              },
            ],
          },
        };
      } catch (e: unknown) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: true,
            content: [
              {
                type: "text",
                text: `Error: ${e instanceof Error ? e.message : String(e)}`,
              },
            ],
          },
        };
      }
    }

    // Method not found
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method '${rpcMethod}' not found`,
      },
    };
  };

  // Support batch JSON-RPC requests
  if (Array.isArray(rawBody)) {
    const responses = (
      await Promise.all(rawBody.map(handleSingleMessage))
    ).filter(Boolean);
    return Response.json(responses, { headers: getCorsHeaders() });
  }

  const response = await handleSingleMessage(rawBody);
  if (!response) {
    return new Response(null, { status: 204, headers: getCorsHeaders() });
  }
  return Response.json(response, { headers: getCorsHeaders() });
}

export async function handleMcpHttpRequest(
  request: Request,
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === "OPTIONS") {
    return handleMcpOptions();
  }
  if (method === "GET") {
    return handleMcpGet();
  }
  if (method === "POST") {
    return handleMcpPost(request);
  }
  return new Response("Method not allowed", {
    status: 405,
    headers: getCorsHeaders(),
  });
}
