/**
 * WebAuthn (passkey) helpers for biometric unlock.
 * Uses the platform authenticator (Touch ID, Face ID, Windows Hello).
 *
 * Security model:
 *  - Biometric auth just proves "you're the owner" — on success the app
 *    reloads the AES key from IndexedDB without asking for a passphrase.
 *  - The credential ID (a random public identifier) is stored in localStorage;
 *    no private key material ever touches JS.
 */

const RP_NAME = "DevCents";

function rpId(): string {
  return typeof window !== "undefined" ? window.location.hostname : "localhost";
}

function storageKey(userId: string) {
  return `cs-bio-${userId}`;
}

// ─── Availability ────────────────────────────────────────────────

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ─── Credential ID storage ───────────────────────────────────────

export function getCredentialId(userId: string): string | null {
  return localStorage.getItem(storageKey(userId));
}

function setCredentialId(userId: string, id: string) {
  localStorage.setItem(storageKey(userId), id);
}

export function clearCredentialId(userId: string) {
  localStorage.removeItem(storageKey(userId));
}

// ─── Registration ────────────────────────────────────────────────

/** Register a platform authenticator for this user. Returns the credential ID. */
export async function registerBiometric(
  userId: string,
  displayName: string,
): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId(), name: RP_NAME },
      user: { id: userIdBytes, name: displayName, displayName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("biometric registration cancelled");

  const id = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  setCredentialId(userId, id);
  return id;
}

// ─── Authentication ──────────────────────────────────────────────

/** Prompt the platform authenticator. Returns true on success. */
export async function verifyBiometric(userId: string): Promise<boolean> {
  const stored = getCredentialId(userId);
  if (!stored) return false;

  const credId = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const result = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: rpId(),
        userVerification: "required",
        allowCredentials: [
          { type: "public-key", id: credId, transports: ["internal"] },
        ],
        timeout: 60_000,
      },
    });
    return !!result;
  } catch {
    return false; // user cancelled or not available
  }
}
