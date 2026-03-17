/**
 * Client-side AES-256-GCM encryption for financial data.
 * Uses Web Crypto API — the encryption key never leaves the browser.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const KEY_USAGE: KeyUsage[] = ["encrypt", "decrypt"];

// ─── Key Derivation ─────────────────────────────────────────────

export async function generateSalt(): Promise<Uint8Array> {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    KEY_USAGE,
  );
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────

export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  // Combine IV + ciphertext, encode as base64
  const combined = new Uint8Array(
    iv.length + new Uint8Array(ciphertext).length,
  );
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(
  encoded: string,
  key: CryptoKey,
): Promise<string> {
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

// ─── Verification Hash ──────────────────────────────────────────
// Used to check if passphrase is correct without storing the key.

const VERIFICATION_PLAINTEXT = "devcents-verify";

export async function createVerificationHash(key: CryptoKey): Promise<string> {
  return encrypt(VERIFICATION_PLAINTEXT, key);
}

export async function verifyPassphrase(
  key: CryptoKey,
  storedHash: string,
): Promise<boolean> {
  try {
    const result = await decrypt(storedHash, key);
    return result === VERIFICATION_PLAINTEXT;
  } catch {
    return false;
  }
}

// ─── Token Hashing ──────────────────────────────────────────────

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Helpers ────────────────────────────────────────────────────

export function saltToBase64(salt: Uint8Array): string {
  return btoa(String.fromCharCode(...salt));
}

export function base64ToSalt(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function isEncryptedValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Encrypted values are base64 and typically longer than 20 chars (IV + ciphertext)
  try {
    const decoded = atob(value);
    return decoded.length > IV_LENGTH + 4;
  } catch {
    return false;
  }
}
