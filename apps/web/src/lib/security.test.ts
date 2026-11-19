import { describe, it, expect, afterEach, vi } from "vitest";
import {
  decrypt,
  encrypt,
  deriveKey,
  exportKeyToBase64,
  generateSalt,
  generateSecretToken,
  unwrapKeyForToken,
  wrapKeyForToken,
  hashToken,
} from "@devcents/shared";
import {
  isRegisteredRedirectUri,
  redirectUriProblem,
  redirectUrisProblem,
  timingSafeEqual,
} from "@devcents/shared/oauth";
import { createRateLimiter } from "./rateLimit";
import { buildRotationPayload, UndecryptableRowsError } from "./reencrypt";
import { clientIp, getOrigin } from "./serverConfig";
import {
  buildRedirect,
  fatalAuthorizeProblem,
  readAuthorizeParams,
  redirectableAuthorizeProblem,
} from "./oauthConsent";

describe("token key wrapping", () => {
  it("round-trips a vault key with the right token only", async () => {
    const key = await deriveKey("correct horse battery staple", await generateSalt(), true);
    const keyB64 = await exportKeyToBase64(key);
    const token = generateSecretToken("dct_live_");

    const wrapped = await wrapKeyForToken(keyB64, token);
    expect(wrapped).not.toContain(keyB64);
    expect(await unwrapKeyForToken(wrapped, token)).toBe(keyB64);
    await expect(unwrapKeyForToken(wrapped, generateSecretToken("dct_live_"))).rejects.toThrow();
  });

  it("cannot be unwrapped with the stored token hash", async () => {
    const token = generateSecretToken("dco_acc_");
    const wrapped = await wrapKeyForToken("a2V5", token);
    await expect(unwrapKeyForToken(wrapped, await hashToken(token))).rejects.toThrow();
  });

  it("generates 256-bit tokens", () => {
    const token = generateSecretToken("x_");
    expect(token).toMatch(/^x_[0-9a-f]{64}$/);
    expect(generateSecretToken("x_")).not.toBe(token);
  });
});

describe("redirect URI validation", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback",
    "http://localhost:8765/callback",
    "http://127.0.0.1:33418/",
    "cursor://anysphere.cursor-retrieval/oauth/callback",
  ])("accepts %s", (uri) => {
    expect(redirectUriProblem(uri)).toBeNull();
  });

  it.each([
    "javascript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "http://evil.example/callback",
    "https://example.com/cb#frag",
    "not a url",
    "",
  ])("rejects %s", (uri) => {
    expect(redirectUriProblem(uri)).not.toBeNull();
  });

  it("limits the list size", () => {
    expect(redirectUrisProblem([])).not.toBeNull();
    expect(redirectUrisProblem(Array(11).fill("https://a.example/cb"))).not.toBeNull();
  });

  it("matches exactly, never by prefix", () => {
    const registered = ["https://good.example/cb"];
    expect(isRegisteredRedirectUri(registered, "https://good.example/cb")).toBe(true);
    expect(isRegisteredRedirectUri(registered, "https://good.example/cb.evil.example")).toBe(false);
    expect(isRegisteredRedirectUri(registered, "https://good.example/cb/../x")).toBe(false);
  });

  it("ignores only the port for loopback redirects", () => {
    const registered = ["http://127.0.0.1:33418/callback", "https://good.example:8443/cb"];
    expect(isRegisteredRedirectUri(registered, "http://127.0.0.1:50123/callback")).toBe(true);
    expect(isRegisteredRedirectUri(registered, "http://127.0.0.1:50123/other")).toBe(false);
    expect(isRegisteredRedirectUri(registered, "http://localhost:50123/callback")).toBe(false);
    expect(isRegisteredRedirectUri(registered, "https://good.example:9999/cb")).toBe(false);
  });

  it("compares secrets in constant time semantics", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("consent request validation", () => {
  const client = { clientName: "Claude", redirectUris: ["https://claude.ai/cb"] };
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  const params = (extra: Record<string, string> = {}) =>
    readAuthorizeParams(
      new URLSearchParams({
        client_id: "dc_client_1",
        redirect_uri: "https://claude.ai/cb",
        response_type: "code",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...extra,
      }),
    );

  it("accepts a well-formed request", () => {
    expect(fatalAuthorizeProblem(params(), client)).toBeNull();
    expect(redirectableAuthorizeProblem(params())).toBeNull();
  });

  it("never redirects to an unregistered URI", () => {
    expect(fatalAuthorizeProblem(params({ redirect_uri: "https://evil.example/cb" }), client)).not.toBeNull();
    expect(fatalAuthorizeProblem(params(), null)).not.toBeNull();
  });

  it("requires S256 PKCE", () => {
    expect(redirectableAuthorizeProblem(params({ code_challenge_method: "plain" }))).toBe("invalid_request");
    expect(redirectableAuthorizeProblem(params({ code_challenge: "" }))).toBe("invalid_request");
  });

  it("builds redirects with encoded parameters", () => {
    expect(buildRedirect("https://claude.ai/cb?x=1", { code: "a&b", state: "" })).toBe(
      "https://claude.ai/cb?x=1&code=a%26b",
    );
  });
});

describe("rate limiter", () => {
  it("blocks after the limit and resets after the window", () => {
    let now = 0;
    const check = createRateLimiter(() => now);
    const rule = { limit: 2, windowMs: 1000 };
    expect(check("k", rule).ok).toBe(true);
    expect(check("k", rule).ok).toBe(true);
    const blocked = check("k", rule);
    expect(blocked.ok).toBe(false);
    expect(check("other", rule).ok).toBe(true);
    now = 1001;
    expect(check("k", rule).ok).toBe(true);
  });
});

describe("proxy trust", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const req = () =>
    new Request("http://internal:3000/x", {
      headers: {
        "x-forwarded-for": "1.1.1.1, 203.0.113.9",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.example",
      },
    });

  it("ignores forwarded headers by default", () => {
    vi.stubEnv("TRUST_PROXY", "");
    vi.stubEnv("PUBLIC_URL", "");
    expect(getOrigin(req())).toBe("http://internal:3000");
    expect(clientIp(req())).toBe("unknown");
  });

  it("uses the proxy-appended address when TRUST_PROXY=true", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    vi.stubEnv("PUBLIC_URL", "");
    expect(getOrigin(req())).toBe("https://app.example");
    expect(clientIp(req())).toBe("203.0.113.9");
  });

  it("prefers PUBLIC_URL over any header", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    vi.stubEnv("PUBLIC_URL", "https://money.example/");
    expect(getOrigin(req())).toBe("https://money.example");
  });
});

describe("passphrase rotation payload", () => {
  async function keyFor(passphrase: string) {
    return deriveKey(passphrase, await generateSalt());
  }

  it("re-encrypts every encrypted field and keeps the previous ciphertext", async () => {
    const oldKey = await keyFor("old passphrase");
    const newKey = await keyFor("new passphrase");
    const amount = await encrypt("12.50", oldKey);
    const description = await encrypt("coffee", oldKey);
    const limit = await encrypt("300", oldKey);
    const rules = await encrypt("{}", oldKey);

    const payload = await buildRotationPayload(
      {
        transactions: [
          { _id: "t1" as never, amount, description, encrypted: true },
          { _id: "t2" as never, amount: 5, description: "plain", encrypted: false },
        ],
        planned: [],
        recurring: [],
        categoryBudgets: [{ _id: "b1" as never, limit, encrypted: true }],
        categoryRules: { data: rules, encrypted: true },
      },
      oldKey,
      newKey,
    );

    expect(payload.transactions).toHaveLength(1);
    const row = payload.transactions[0];
    expect(row.prevAmount).toBe(amount);
    expect(await decrypt(row.amount, newKey)).toBe("12.50");
    expect(await decrypt(row.description, newKey)).toBe("coffee");
    expect(await decrypt(payload.categoryBudgets[0].limit, newKey)).toBe("300");
    expect(payload.prevCategoryRulesData).toBe(rules);
    expect(await decrypt(payload.categoryRulesData!, newKey)).toBe("{}");
  });

  it("lists every row that can't be decrypted instead of sending anything", async () => {
    const oldKey = await keyFor("old");
    const otherKey = await keyFor("other");
    const good = await encrypt("1", oldKey);
    const bad = await encrypt("2", otherKey);
    const data = {
      transactions: [
        { _id: "ok" as never, amount: good, description: good, encrypted: true },
        { _id: "bad1" as never, amount: bad, description: good, encrypted: true },
      ],
      planned: [{ _id: "bad2" as never, amount: good, description: bad, encrypted: true }],
      recurring: [],
      categoryBudgets: [],
      categoryRules: null,
    };
    const err = await buildRotationPayload(data, oldKey, await keyFor("new")).catch((e) => e);
    expect(err).toBeInstanceOf(UndecryptableRowsError);
    expect((err as UndecryptableRowsError).ids.sort()).toEqual(["bad1", "bad2"]);
  });
});

