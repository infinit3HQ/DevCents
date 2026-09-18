import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ─── Client Registration (RFC 7591) ─────────────────────────────────────

export const registerClient = mutation({
  args: {
    client_name: v.string(),
    redirect_uris: v.array(v.string()),
    grant_types: v.optional(v.array(v.string())),
    response_types: v.optional(v.array(v.string())),
    scope: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Generate a unique client ID and client secret
    const clientId = `dc_client_${crypto.randomUUID().replace(/-/g, "")}`;
    const clientSecret = `dc_sec_${crypto.randomUUID().replace(/-/g, "")}`;

    const grantTypes = args.grant_types ?? ["authorization_code", "refresh_token"];
    const responseTypes = args.response_types ?? ["code"];

    await ctx.db.insert("oauth_clients", {
      clientId,
      clientSecret,
      clientName: args.client_name,
      redirectUris: args.redirect_uris,
      grantTypes,
      responseTypes,
      scope: args.scope ?? "mcp",
      createdAt: Date.now(),
    });

    return {
      client_id: clientId,
      client_secret: clientSecret,
      client_name: args.client_name,
      redirect_uris: args.redirect_uris,
      grant_types: grantTypes,
      response_types: responseTypes,
      scope: args.scope ?? "mcp",
    };
  },
});

export const getClient = query({
  args: {
    clientId: v.string(),
  },
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
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      scope: client.scope,
    };
  },
});

// ─── Authorization Code Grant (RFC 6749 + PKCE RFC 7636) ────────────────

export const createAuthCode = mutation({
  args: {
    clientId: v.string(),
    redirectUri: v.string(),
    codeHash: v.string(),
    codeChallenge: v.string(),
    codeChallengeMethod: v.string(), // "S256" | "plain"
    scope: v.string(),
    keyB64: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized: user must be logged in to grant consent");

    const client = await ctx.db
      .query("oauth_clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();

    if (!client) {
      throw new Error(`Invalid client_id: ${args.clientId}`);
    }

    // Verify redirect URI matches
    const matchedUri = client.redirectUris.some(
      (uri) => uri === args.redirectUri || args.redirectUri.startsWith(uri),
    );
    if (!matchedUri) {
      throw new Error(`Redirect URI ${args.redirectUri} is not authorized for client`);
    }

    // Code expires in 10 minutes
    const expiresAt = Date.now() + 10 * 60 * 1000;

    await ctx.db.insert("oauth_codes", {
      codeHash: args.codeHash,
      clientId: args.clientId,
      userId: identity.subject,
      redirectUri: args.redirectUri,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      scope: args.scope,
      keyB64: args.keyB64,
      expiresAt,
    });

    return { success: true };
  },
});

export const getAuthCodeForExchange = query({
  args: {
    codeHash: v.string(),
  },
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query("oauth_codes")
      .withIndex("by_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();

    if (!code) return null;
    return code;
  },
});

export const exchangeAuthCode = mutation({
  args: {
    codeHash: v.string(),
    tokenHash: v.string(),
    refreshTokenHash: v.optional(v.string()),
    clientId: v.string(),
    redirectUri: v.string(),
    codeChallengeVerified: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.codeChallengeVerified) {
      throw new Error("Invalid PKCE code verifier");
    }

    const code = await ctx.db
      .query("oauth_codes")
      .withIndex("by_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();

    if (!code) {
      throw new Error("Invalid or expired authorization code");
    }

    if (code.expiresAt < Date.now()) {
      await ctx.db.delete(code._id);
      throw new Error("Authorization code has expired");
    }

    if (code.clientId !== args.clientId) {
      throw new Error("client_id does not match authorization code");
    }

    if (code.redirectUri !== args.redirectUri) {
      throw new Error("redirect_uri does not match authorization code");
    }

    // Authorization code is single-use; delete immediately
    await ctx.db.delete(code._id);

    // Issue access token valid for 30 days
    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    await ctx.db.insert("oauth_tokens", {
      tokenHash: args.tokenHash,
      refreshTokenHash: args.refreshTokenHash,
      clientId: args.clientId,
      userId: code.userId,
      scope: code.scope,
      keyB64: code.keyB64,
      expiresAt,
      createdAt: Date.now(),
    });

    return {
      userId: code.userId,
      scope: code.scope,
      expiresIn: 30 * 24 * 60 * 60,
    };
  },
});

export const refreshOAuthToken = mutation({
  args: {
    refreshTokenHash: v.string(),
    newTokenHash: v.string(),
    newRefreshTokenHash: v.optional(v.string()),
    clientId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_refresh_hash", (q) => q.eq("refreshTokenHash", args.refreshTokenHash))
      .first();

    if (!existing) {
      throw new Error("Invalid refresh token");
    }

    if (existing.clientId !== args.clientId) {
      throw new Error("client_id does not match refresh token");
    }

    if (existing.expiresAt < Date.now()) {
      await ctx.db.delete(existing._id);
      throw new Error("Refresh token expired");
    }

    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;

    // Update token
    await ctx.db.patch(existing._id, {
      tokenHash: args.newTokenHash,
      refreshTokenHash: args.newRefreshTokenHash ?? existing.refreshTokenHash,
      expiresAt,
    });

    return {
      scope: existing.scope,
      expiresIn: 30 * 24 * 60 * 60,
    };
  },
});

export const authenticateOAuthToken = query({
  args: {
    tokenHash: v.string(),
  },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("oauth_tokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (!token) return null;
    if (token.expiresAt < Date.now()) return null;

    return {
      userId: token.userId,
      keyB64: token.keyB64 ?? null,
      scope: token.scope,
    };
  },
});
