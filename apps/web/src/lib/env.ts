/**
 * Robustly retrieves environment variables across both client and server environments.
 * 
 * 1. Checks `import.meta.env` (Vite's build-time inlining).
 * 2. Checks `process.env` (Node's runtime environment for SSR).
 */
export function getEnv(key: string): string | undefined {
  /**
   * IMPORTANT: Vite's static analysis for environment variables only works with 
   * explicit 'import.meta.env.VARIABLE_NAME' syntax. Dynamic access like
   * 'import.meta.env[key]' will NOT be replaced during build.
   */
  if (key === "VITE_CONVEX_URL") return import.meta.env.VITE_CONVEX_URL;
  if (key === "VITE_CLERK_PUBLISHABLE_KEY") return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

  // Fallback for other variables or dynamic lookup (less reliable in production)
  // @ts-ignore
  const viteValue = import.meta.env ? import.meta.env[key] : undefined;
  if (viteValue && typeof viteValue === "string" && !viteValue.includes("__VITE_")) {
    return viteValue;
  }

  // Fallback to process.env (available on the server during SSR)
  if (typeof process !== "undefined" && process.env) {
    return process.env[key];
  }

  return undefined;
}
