/**
 * Helpers for bearer tokens that carry an encryption key.
 *
 * Remote MCP needs the vault key on the server, but the database must never
 * hold it in a usable form. The key is wrapped (AES-GCM) with a key derived
 * from the raw bearer token via HKDF. The database stores only the token's
 * SHA-256 hash and the wrapped key, so a database dump cannot unwrap it; the
 * raw token, which only the client holds, is required.
 */

import { decrypt, encrypt } from "./encryption.js";

const WRAP_SALT = new TextEncoder().encode("devcents-token-key-wrap-v1");
const WRAP_INFO = new TextEncoder().encode("aes-256-gcm vault key wrap");
const TOKEN_BYTES = 32;

async function deriveWrapKey(token: string): Promise<CryptoKey> {
  if (!token) throw new Error("Token is required to wrap a key");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: WRAP_SALT, info: WRAP_INFO },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Wraps a base64 raw AES key so only the holder of `token` can unwrap it. */
export async function wrapKeyForToken(keyB64: string, token: string): Promise<string> {
  return encrypt(keyB64, await deriveWrapKey(token));
}

/** Reverses {@link wrapKeyForToken}. Throws if the token is wrong. */
export async function unwrapKeyForToken(wrapped: string, token: string): Promise<string> {
  return decrypt(wrapped, await deriveWrapKey(token));
}

/** A 256-bit random token, hex encoded, with a readable prefix. */
export function generateSecretToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${hex}`;
}
