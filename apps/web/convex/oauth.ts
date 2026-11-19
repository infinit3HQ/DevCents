import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import {
  MAX_CLIENT_NAME_LENGTH,
  isRegisteredRedirectUri,
  isValidCodeChallenge,
  redirectUrisProblem,
  verifyPkceS256,
} from "@devcents/shared/oauth";
import { assertMaxLength, assertServerSecret, assertTokenHash } from "./lib/serverAuth";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = DAY;
const REFRESH_TOKEN_TTL_MS = 30 * DAY;
/** A grant can be refreshed until this long after the user consented. */
const MAX_GRANT_LIFETIME_MS = 90 * DAY;
/** Backstop against registration floods that bypass per-IP limits. */
const MAX_REGISTRATIONS_PER_HOUR = 200;
const MAX_WRAPPED_KEY_LENGTH = 512;

const SCOPE = "mcp";

type ExchangeResult =
  | { ok: true; scope: string; expiresIn: number; refreshExpiresIn: number }
  | { ok: false; error: string };

// ─── Client Registration (RFC 7591) ─────────────────────────────────────

/** Public clients only: no client secret is issued (OAuth 2.1 + PKCE). */
export const registerClient = mutation({
  args: {
    serverSecret: v.string(),
    client_name: v.string(),
    redirect_uris: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret);
    const clientName = args.client_name.trim() || "MCP Client";
    assertMaxLength(clientName, MAX_CLIENT_NAME_LENGTH, "client_name");
    const problem = redirectUrisProblem(args.redirect_uris);
    if (problem) throw new Error(problem);

    const recent = await ctx.db
      .query("oauth_clients")
      .withIndex("by_created", (q) => q.gt("createdAt", Date.now() - HOUR))
      .take(MAX_REGISTRATIONS_PER_HOUR);
    if (recent.length >= MAX_REGISTRATIONS_PER_HOUR) {
      throw new Error("Too many client registrations, try again later");
    }

    const clientId = `dc_client_${crypto.randomUUID().replace(/-/g, "")}`;
    await ctx.db.insert("oauth_clients", {
      clientId,
      clientName,
      redirectUris: args.redirect_uris,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: SCOPE,
      createdAt: Date.now(),
    });

    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: args.redirect_uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPE,
    };
  },
});

/** Read by the consent page to show who is asking and validate redirect_uri. */
export const getClient = query({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("oauth_clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) return null;
    return {
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
      createdAt: client.createdAt,
    };
  },
});

// ─── Authorization Code Grant (RFC 6749 + PKCE RFC 7636) ────────────────

async function deleteExpiredCodes(ctx: MutationCtx) {
  const expired = await ctx.db
    .query("oauth_codes")
    .withIndex("by_expires", (q) => q.lt("expiresAt", Date.now()))
    .take(25);
  await Promise.all(expired.map((c) => ctx.db.delete(c._id)));
}

export const createAuthCode = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeHash: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(),
    scope: v.string(),
    wrappedKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: user must be logged in to grant consent");

    assertTokenHash(args.codeHash);
    if (args.codeChallengeMethod !== "S256") {
      throw new Error("code_challenge_method must be S256");
    }
    if (!isValidCodeChallenge(args.codeChallenge)) {
      throw new Error("code_challenge is missing or malformed");
    }
    if (args.scope !== SCOPE) throw new Error(`Unsupported scope: ${args.scope}`);
    if (args.wrappedKey) assertMaxLength(args.wrappedKey, MAX_WRAPPED_KEY_LENGTH, "wrappedKey");

    const client = await ctx.db
      .query("oauth_clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) throw new Error("Unknown client_id");
    if (!isRegisteredRedirectUri(client.redirectUris, args.redirectUri)) {
      throw new Error("redirect_uri is not registered for this client");
    }

    await deleteExpiredCodes(ctx);
    await ctx.db.insert("oauth_codes", {
      codeHash: args.codeHash,
      clientId: args.clientId,
      userId: identity.subject,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: "S256",
      scope: args.scope,
      wrappedKey: args.wrappedKey,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });
    return { success: true };
  },
});

/**
 * Returns the code's wrapped vault key so the web server can re-wrap it for
 * the new tokens. The key is wrapped with the raw code, which only the client
 * and the web server know, so this reveals nothing usable on its own.
 */
export const peekAuthCodeKey = query({
  args: { serverSecret: v.string(), codeHash: v.string() },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret);
    const code = await ctx.db
      .query("oauth_codes")
      .withIndex("by_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (!code || code.expiresAt < Date.now()) return null;
    return { wrappedKey: code.wrappedKey ?? null };
  },
});

/**
 * Verifies PKCE here, inside the database transaction, and consumes the code
 * whether or not verification succeeds (a failed attempt burns the code).
 * Failures are returned rather than thrown, because a throw would roll the
 * deletion back.
 */
export const exchangeAuthCode = mutation({
  args: {
    serverSecret: v.string(),
    codeHash: v.string(),
    codeVerifier: v.string(),
    clientId: v.string(),
    redirectUri: v.string(),
    tokenHash: v.string(),
    refreshTokenHash: v.string(),
    wrappedKey: v.optional(v.string()),
    refreshWrappedKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ExchangeResult> => {
    assertServerSecret(args.serverSecret);
    assertTokenHash(args.tokenHash);
    assertTokenHash(args.refreshTokenHash);

    const code = await ctx.db
      .query("oauth_codes")
      .withIndex("by_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (!code) return { ok: false, error: "Invalid or expired authorization code" };

    // Single use: consumed on any attempt.
    await ctx.db.delete(code._id);

    if (code.expiresAt < Date.now()) return { ok: false, error: "Authorization code has expired" };
    if (code.clientId !== args.clientId) return { ok: false, error: "client_id does not match" };
    if (code.redirectUri !== args.redirectUri) return { ok: false, error: "redirect_uri does not match" };
    if (code.codeChallengeMethod !== "S256" || !(await verifyPkceS256(args.codeVerifier, code.codeChallenge))) {
      return { ok: false, error: "PKCE verification failed" };
    }
    if (code.wrappedKey && (!args.wrappedKey || !args.refreshWrappedKey)) {
      return { ok: false, error: "Encryption key was not re-wrapped" };
    }

    const now = Date.now();
    await ctx.db.insert("oauth_tokens", {
      tokenHash: args.tokenHash,
      refreshTokenHash: args.refreshTokenHash,
      clientId: code.clientId,
      userId: code.userId,
      scope: code.scope,
      wrappedKey: code.wrappedKey ? args.wrappedKey : undefined,
      refreshWrappedKey: code.wrappedKey ? args.refreshWrappedKey : undefined,
      expiresAt: now + ACCESS_TOKEN_TTL_MS,
      refreshExpiresAt: now + REFRESH_TOKEN_TTL_MS,
      grantedAt: now,
      createdAt: now,
    });

    return {
      ok: true,
      scope: code.scope,
      expiresIn: ACCESS_TOKEN_TTL_MS / 1000,
      refreshExpiresIn: REFRESH_TOKEN_TTL_MS / 1000,
    };
  },
});

/** Old versions issued 30-day access tokens and slid `expiresAt` on refresh. */
const LEGACY_ACCESS_TTL_MS = 30 * DAY;

function grantStart(token: { grantedAt?: number; createdAt: number; expiresAt: number }): number {
  // Legacy rows have no grantedAt; their last refresh (expiresAt - 30d) is
  // the best available start, so active legacy grants get a full window.
  return token.grantedAt ?? Math.max(token.createdAt, token.expiresAt - LEGACY_ACCESS_TTL_MS);
}

function refreshDeadline(token: {
  refreshExpiresAt?: number;
  grantedAt?: number;
  createdAt: number;
  expiresAt: number;
}): number {
  const start = grantStart(token);
  const sliding = token.refreshExpiresAt ?? Math.max(token.expiresAt, start + REFRESH_TOKEN_TTL_MS);
  return Math.min(sliding, start + MAX_GRANT_LIFETIME_MS);
}

/** Wrapped (or legacy plaintext) key for a refresh token, so it can be re-wrapped. */
export const peekRefreshKey = query({
  args: { serverSecret: v.string(), refreshTokenHash: v.string() },
  handler: async (ctx, args) => {
    assertServerSecret(args.serverSecret);
    const token = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_refresh_hash", (q) => q.eq("refreshTokenHash", args.refreshTokenHash))
      .first();
    if (!token || refreshDeadline(token) < Date.now()) return null;
    return {
      refreshWrappedKey: token.refreshWrappedKey ?? null,
      legacyKeyB64: token.keyB64 ?? null,
    };
  },
});

/** Rotates both tokens. The old refresh token stops working immediately. */
export const refreshOAuthToken = mutation({
  args: {
    serverSecret: v.string(),
    refreshTokenHash: v.string(),
    clientId: v.string(),
    newTokenHash: v.string(),
    newRefreshTokenHash: v.string(),
    wrappedKey: v.optional(v.string()),
    refreshWrappedKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<ExchangeResult> => {
    assertServerSecret(args.serverSecret);
    assertTokenHash(args.newTokenHash);
    assertTokenHash(args.newRefreshTokenHash);

    const existing = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_refresh_hash", (q) => q.eq("refreshTokenHash", args.refreshTokenHash))
      .first();
    if (!existing) return { ok: false, error: "Invalid refresh token" };
    if (existing.clientId !== args.clientId) return { ok: false, error: "client_id does not match" };

    const deadline = refreshDeadline(existing);
    if (deadline < Date.now()) {
      await ctx.db.delete(existing._id);
      return { ok: false, error: "Refresh token expired" };
    }
    const hadKey = Boolean(existing.refreshWrappedKey || existing.keyB64);
    if (hadKey && (!args.wrappedKey || !args.refreshWrappedKey)) {
      return { ok: false, error: "Encryption key was not re-wrapped" };
    }

    const now = Date.now();
    const refreshExpiresAt = Math.min(now + REFRESH_TOKEN_TTL_MS, deadline);
    await ctx.db.patch(existing._id, {
      tokenHash: args.newTokenHash,
      refreshTokenHash: args.newRefreshTokenHash,
      wrappedKey: hadKey ? args.wrappedKey : undefined,
      refreshWrappedKey: hadKey ? args.refreshWrappedKey : undefined,
      keyB64: undefined, // drop any legacy plaintext key
      expiresAt: Math.min(now + ACCESS_TOKEN_TTL_MS, refreshExpiresAt),
      refreshExpiresAt,
      grantedAt: grantStart(existing),
    });

    return {
      ok: true,
      scope: existing.scope,
      expiresIn: Math.floor((Math.min(now + ACCESS_TOKEN_TTL_MS, refreshExpiresAt) - now) / 1000),
      refreshExpiresIn: Math.floor((refreshExpiresAt - now) / 1000),
    };
  },
});

// ─── Grant management (Settings) ────────────────────────────────────────

export const listGrants = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const tokens = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
    const now = Date.now();
    const live = tokens.filter((t) => refreshDeadline(t) > now);
    return Promise.all(
      live.map(async (t) => {
        const client = await ctx.db
          .query("oauth_clients")
          .withIndex("by_client_id", (q) => q.eq("clientId", t.clientId))
          .first();
        return {
          _id: t._id,
          clientName: client?.clientName ?? "Unknown client",
          redirectHost: client?.redirectUris[0] ? safeHost(client.redirectUris[0]) : null,
          grantedAt: grantStart(t),
          expiresAt: refreshDeadline(t),
          hasKey: Boolean(t.wrappedKey || t.keyB64),
        };
      }),
    );
  },
});

function safeHost(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.host || url.protocol;
  } catch {
    return null;
  }
}

export const revokeGrant = mutation({
  args: { id: v.id("oauth_tokens") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const token = await ctx.db.get(args.id);
    if (!token || token.userId !== identity.subject) throw new Error("Not found");
    await ctx.db.delete(args.id);
  },
});
