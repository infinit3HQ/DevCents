import { timingSafeEqual } from "@devcents/shared/oauth";

/**
 * Some public functions (OAuth registration, code exchange, refresh) must only
 * be called by the DevCents web server, never directly by a browser against
 * the Convex URL, so that rate limits and request validation can't be skipped.
 * Both sides share DEVCENTS_SERVER_SECRET: set it in the Convex deployment
 * (`convex env set`) and in the web container's environment.
 */
export function assertServerSecret(provided: string): void {
  const expected = process.env.DEVCENTS_SERVER_SECRET;
  if (!expected || expected.length < 32) {
    throw new Error("Server is not configured: DEVCENTS_SERVER_SECRET is missing or too short");
  }
  if (!timingSafeEqual(provided, expected)) {
    throw new Error("Forbidden");
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

export function assertTokenHash(hash: string): void {
  if (!SHA256_HEX.test(hash)) throw new Error("Invalid token hash");
}

export function assertMaxLength(value: string, max: number, field: string): void {
  if (value.length > max) throw new Error(`${field} is too long (max ${max})`);
}
