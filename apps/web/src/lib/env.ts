/**
 * Reads a public (VITE_*) setting on both client and server.
 *
 * 1. `import.meta.env` — inlined by Vite at build time. Published Docker
 *    images are built with `__VITE_*__` placeholders that the container
 *    replaces at start-up (deployment/start.sh), so one image serves any
 *    deployment.
 * 2. `process.env` — available on the server during SSR.
 *
 * Vite only inlines explicit `import.meta.env.VITE_X` expressions, hence the
 * per-key branches.
 */
function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith("__VITE_");
}

export function getEnv(key: string): string | undefined {
  let value: string | undefined;

  if (key === "VITE_CONVEX_URL") {
    value = import.meta.env.VITE_CONVEX_URL;
  } else if (key === "VITE_CLERK_PUBLISHABLE_KEY") {
    value = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  } else {
    const dynamic = (import.meta.env as Record<string, unknown>)[key];
    value = typeof dynamic === "string" ? dynamic : undefined;
  }

  if (isPlaceholder(value) && typeof process !== "undefined" && process.env) {
    value = process.env[key];
  }

  if (isPlaceholder(value)) {
    console.warn(`[env] ${key} is not configured`);
    return undefined;
  }
  return value;
}
