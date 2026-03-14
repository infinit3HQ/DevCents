/**
 * Robustly retrieves environment variables across both client and server environments.
 * 
 * 1. Checks `import.meta.env` (Vite's build-time inlining).
 * 2. Checks `process.env` (Node's runtime environment for SSR).
 */
export function getEnv(key: string): string | undefined {
  /**
   * IMPORTANT: Vite's static analysis for environment variables only works with 
   * explicit 'import.meta.env.VARIABLE_NAME' syntax.
   */
  let value: string | undefined;

  if (key === "VITE_CONVEX_URL") {
    value = import.meta.env.VITE_CONVEX_URL;
    if (value) console.log(`[env] Found ${key} in import.meta.env (length: ${value.length})`);
  } else if (key === "VITE_CLERK_PUBLISHABLE_KEY") {
    value = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
    if (value) console.log(`[env] Found ${key} in import.meta.env (length: ${value.length})`);
  }

  // Fallback for other variables or if static mapping failed
  if (!value) {
    // @ts-ignore
    const viteValue = import.meta.env ? import.meta.env[key] : undefined;
    if (viteValue && typeof viteValue === "string" && !viteValue.includes("__VITE_")) {
      value = viteValue;
      console.log(`[env] Found ${key} via dynamic import.meta.env[key]`);
    }
  }

  // Fallback to process.env (available on the server during SSR)
  if (!value && typeof process !== "undefined" && process.env) {
    const procValue = process.env[key];
    if (procValue) {
      value = procValue;
      console.log(`[env] Found ${key} in process.env (length: ${procValue.length})`);
    }
  }

  if (!value) {
    console.warn(`[env] Variable ${key} NOT FOUND in any context`);
  }

  return value;
}
