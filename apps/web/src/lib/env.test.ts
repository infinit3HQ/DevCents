import { describe, it, expect, afterEach, vi } from "vitest";
import { getEnv, publicEnv, publicEnvScript } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public runtime env", () => {
  it("reads server values from process.env", () => {
    vi.stubEnv("VITE_CONVEX_URL", "https://convex.example.test");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_abc");
    expect(getEnv("VITE_CONVEX_URL")).toBe("https://convex.example.test");
    expect(publicEnv()).toEqual({
      VITE_CONVEX_URL: "https://convex.example.test",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    });
  });

  it("reads browser values from window.__DEVCENTS_ENV__", () => {
    vi.stubGlobal("window", { __DEVCENTS_ENV__: { VITE_CONVEX_URL: "https://from-page.test" } });
    expect(getEnv("VITE_CONVEX_URL")).toBe("https://from-page.test");
  });

  it("treats leftover build placeholders as missing", () => {
    vi.stubEnv("VITE_CONVEX_URL", "__VITE_CONVEX_URL__");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    expect(publicEnv().VITE_CONVEX_URL).not.toBe("__VITE_CONVEX_URL__");
  });

  it("only publishes the two public keys", () => {
    vi.stubEnv("VITE_CONVEX_URL", "https://convex.example.test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_secret");
    vi.stubEnv("DEVCENTS_SERVER_SECRET", "x".repeat(64));
    const script = publicEnvScript();
    expect(script).not.toContain("sk_live_secret");
    expect(script).not.toContain("x".repeat(64));
  });

  it("cannot be broken out of the <script> element", () => {
    const script = publicEnvScript({ VITE_CONVEX_URL: "</script><script>alert(1)</script>&" });
    expect(script).not.toContain("</script>");
    expect(script).not.toContain("<");
    expect(script).not.toContain("&");
    // Still evaluates to the original value.
    const sandbox: { window: { __DEVCENTS_ENV__?: { VITE_CONVEX_URL?: string } } } = { window: {} };
    new Function("window", script)(sandbox.window);
    expect(sandbox.window.__DEVCENTS_ENV__?.VITE_CONVEX_URL).toBe("</script><script>alert(1)</script>&");
  });
});
