/**
 * Robustly retrieves environment variables across both client and server environments.
 * 
 * 1. Checks `import.meta.env` (Vite's build-time inlining).
 * 2. Checks `process.env` (Node's runtime environment for SSR).
 */
export function getEnv(key: string): string | undefined {
  // Check Vite-specific environment variables
  // @ts-ignore - handling potential missing import.meta.env in some contexts
  const viteValue = import.meta.env ? import.meta.env[key] : undefined;
  if (viteValue && !viteValue.includes("__VITE_")) {
    return viteValue as string;
  }

  // Fallback to process.env (available on the server during SSR)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }

  return undefined;
}
