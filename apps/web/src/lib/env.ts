/**
 * Public runtime settings shared by server and browser.
 *
 * Published Docker images are built without deployment-specific values. The
 * server reads them from process.env and embeds them in each HTML page as
 * `window.__DEVCENTS_ENV__` (see `publicEnvScript`), which runs before the
 * app's module scripts. Built files are never rewritten after the build:
 * Nitro serves static assets with build-time Content-Length/ETag values, so
 * changing a file's size truncates it in the browser.
 *
 * For local `vite dev` builds the Vite-inlined values are used as a fallback.
 */

export const PUBLIC_ENV_KEYS = ["VITE_CONVEX_URL", "VITE_CLERK_PUBLISHABLE_KEY"] as const;
export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];
export type PublicEnv = Partial<Record<PublicEnvKey, string>>;

declare global {
  interface Window {
    __DEVCENTS_ENV__?: PublicEnv;
  }
}

function usable(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("__VITE_");
}

function buildTimeValue(key: PublicEnvKey): string | undefined {
  // Vite only inlines explicit `import.meta.env.VITE_X` expressions.
  const value =
    key === "VITE_CONVEX_URL"
      ? import.meta.env.VITE_CONVEX_URL
      : import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  return usable(value) ? value : undefined;
}

function runtimeValue(key: PublicEnvKey): string | undefined {
  if (typeof window !== "undefined") {
    const value = window.__DEVCENTS_ENV__?.[key];
    return usable(value) ? value : undefined;
  }
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[key];
    return usable(value) ? value : undefined;
  }
  return undefined;
}

export function getEnv(key: PublicEnvKey): string | undefined {
  const value = runtimeValue(key) ?? buildTimeValue(key);
  if (!value) console.warn(`[env] ${key} is not configured`);
  return value;
}

/** The public settings to hand to the browser. Never add secrets here. */
export function publicEnv(): PublicEnv {
  const env: PublicEnv = {};
  for (const key of PUBLIC_ENV_KEYS) {
    const value = runtimeValue(key) ?? buildTimeValue(key);
    if (value) env[key] = value;
  }
  return env;
}

/**
 * Inline script that publishes the settings to the browser. `<`, `>` and `&`
 * are escaped so a value can never close the <script> element.
 */
export function publicEnvScript(env: PublicEnv = publicEnv()): string {
  const json = JSON.stringify(env)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `window.__DEVCENTS_ENV__=${json};`;
}
