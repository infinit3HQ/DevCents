import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";
import { api } from "../../convex/_generated/api";
import {
  deriveKey,
  generateSalt,
  saltToBase64,
  base64ToSalt,
  createVerificationHash,
  verifyPassphrase,
  encrypt,
  decrypt,
} from "@/lib/encryption";
import { saveKey, loadKey, clearKey } from "@/lib/keyStorage";
import {
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
  getCredentialId,
  clearCredentialId,
} from "@/lib/webauthn";
import { generatePassphrase, checkStrength } from "@/lib/passphrase";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  Lock,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldCheck,
  Fingerprint,
  RefreshCw,
  Copy,
  Check,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────

const INACTIVITY_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

// ─── Context ─────────────────────────────────────────────────────

interface EncryptionContextType {
  isEnabled: boolean;
  isUnlocked: boolean;
  encryptValue: (plaintext: string) => Promise<string>;
  decryptValue: (ciphertext: string) => Promise<string>;
  setupEncryption: () => void;
}

const EncryptionContext = createContext<EncryptionContextType>({
  isEnabled: false,
  isUnlocked: false,
  encryptValue: async (v) => v,
  decryptValue: async (v) => v,
  setupEncryption: () => {},
});

export const useEncryption = () => useContext(EncryptionContext);

// ─── Provider ────────────────────────────────────────────────────

export function EncryptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const settings = useQuery(api.encryptionSettings.get, user ? {} : "skip");
  const setupMutation = useMutation(api.encryptionSettings.setup);

  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);

  const isEnabled = !!settings;
  const isUnlocked = !!cryptoKey;
  const hasBio = !!user && !!getCredentialId(user.id);

  // ── Restore key from IndexedDB on mount ──────────────────────
  useEffect(() => {
    if (!user?.id || !settings) return;
    let cancelled = false;
    loadKey(user.id)
      .then((key) => {
        if (!cancelled && key) {
          setCryptoKey(key);
          setShowUnlock(false);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, settings]);

  // ── Show unlock dialog when no key found ─────────────────────
  useEffect(() => {
    if (!settings || !user) return;
    const t = setTimeout(() => {
      setCryptoKey((prev) => {
        if (!prev) setShowUnlock(true);
        return prev;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [settings, cryptoKey, user]);

  // ── 5-min inactivity auto-lock ───────────────────────────────
  useEffect(() => {
    if (!isUnlocked || !user?.id) return;

    let timer: ReturnType<typeof setTimeout>;
    const lock = async () => {
      setCryptoKey(null);
      // Always clear the key from IndexedDB on inactivity
      // so a page refresh doesn't auto-unlock.
      // The user must manually click biometric unlock to load it again.
      await clearKey(user.id);
      setShowUnlock(true);
    };
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(lock, INACTIVITY_MS);
    };

    reset();
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true }),
    );
    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [isUnlocked, user?.id, hasBio]);

  // ── Crypto helpers ───────────────────────────────────────────
  const encryptValue = useCallback(
    async (plaintext: string): Promise<string> => {
      if (!cryptoKey) return plaintext;
      return encrypt(plaintext, cryptoKey);
    },
    [cryptoKey],
  );

  const decryptValue = useCallback(
    async (ciphertext: string): Promise<string> => {
      if (!cryptoKey) return ciphertext;
      try {
        return await decrypt(ciphertext, cryptoKey);
      } catch {
        return ciphertext;
      }
    },
    [cryptoKey],
  );

  // ── Handlers ─────────────────────────────────────────────────
  const handleSetup = useCallback(
    async (passphrase: string, registerBio: boolean) => {
      const salt = await generateSalt();
      const key = await deriveKey(passphrase, salt);
      const verificationHash = await createVerificationHash(key);
      await setupMutation({ salt: saltToBase64(salt), verificationHash });
      setCryptoKey(key);
      if (user?.id) {
        await saveKey(user.id, key);
        if (registerBio) {
          try {
            await registerBiometric(user.id, user.fullName ?? user.id);
          } catch {
            /* biometric registration optional, non-fatal */
          }
        }
      }
      setShowSetup(false);
    },
    [setupMutation, user],
  );

  const handleUnlock = useCallback(
    async (passphrase: string): Promise<boolean> => {
      if (!settings || !user?.id) return false;
      const salt = base64ToSalt(settings.salt);
      const key = await deriveKey(passphrase, salt);
      const valid = await verifyPassphrase(key, settings.verificationHash);
      if (valid) {
        setCryptoKey(key);
        await saveKey(user.id, key);
        setShowUnlock(false);
        return true;
      }
      return false;
    },
    [settings, user?.id],
  );

  const handleBiometricUnlock = useCallback(async (): Promise<boolean> => {
    if (!user?.id) return false;
    const ok = await verifyBiometric(user.id);
    if (ok) {
      const key = await loadKey(user.id);
      if (key) {
        setCryptoKey(key);
        setShowUnlock(false);
        return true;
      }
    }
    return false;
  }, [user?.id]);

  const handleLockBiometric = useCallback(() => {
    if (user?.id) clearCredentialId(user.id);
  }, [user?.id]);

  return (
    <EncryptionContext.Provider
      value={{
        isEnabled,
        isUnlocked,
        encryptValue,
        decryptValue,
        setupEncryption: () => setShowSetup(true),
      }}
    >
      {children}

      <AnimatePresence>
        {showSetup && (
          <SetupDialog
            onSetup={handleSetup}
            onCancel={() => setShowSetup(false)}
          />
        )}
        {showUnlock && isEnabled && (
          <UnlockDialog
            hasBiometric={hasBio}
            onBiometricUnlock={handleBiometricUnlock}
            onUnlock={handleUnlock}
            onSkip={() => setShowUnlock(false)}
            onLockBiometric={handleLockBiometric}
          />
        )}
      </AnimatePresence>
    </EncryptionContext.Provider>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "hsl(0 0% 0% / 0.78)", backdropFilter: "blur(6px)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md"
        style={{
          background: "hsl(0 0% 7%)",
          border: "1px solid hsl(0 0% 16%)",
          boxShadow:
            "0 0 0 1px hsl(142 60% 52% / 0.08), 0 32px 64px hsl(0 0% 0% / 0.7)",
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function TermInput({
  type,
  value,
  onChange,
  placeholder,
  autoFocus,
  rightSlot,
}: {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent font-mono text-sm text-foreground
                   placeholder:text-muted-foreground/35 outline-none px-3 py-2.5"
        style={{
          border: "1px solid hsl(0 0% 16%)",
          borderRadius: 0,
          paddingRight: rightSlot ? "5rem" : "0.75rem",
        }}
        onFocus={(e) =>
          (e.currentTarget.style.borderColor = "hsl(142 60% 52% / 0.45)")
        }
        onBlur={(e) => (e.currentTarget.style.borderColor = "hsl(0 0% 16%)")}
      />
      {rightSlot && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

function TermBtn({
  children,
  onClick,
  type = "button",
  disabled,
  variant = "ghost",
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: {
      background: "hsl(142 60% 52%)",
      color: "hsl(0 0% 5%)",
      border: "none",
    },
    ghost: {
      background: "transparent",
      color: "hsl(0 0% 42%)",
      border: "1px solid hsl(0 0% 18%)",
    },
    danger: {
      background: "transparent",
      color: "hsl(3 85% 60%)",
      border: "1px solid hsl(3 85% 60% / 0.3)",
    },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 h-9 font-mono text-[11px] uppercase tracking-widest transition-opacity
                  disabled:opacity-40 flex items-center justify-center gap-1.5 ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

/** Passphrase strength bar */
function StrengthBar({ passphrase }: { passphrase: string }) {
  if (!passphrase) return null;
  const s = checkStrength(passphrase);
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-0.5 w-8 transition-all duration-300"
              style={{ background: i < s.score ? s.color : "hsl(0 0% 18%)" }}
            />
          ))}
        </div>
        <span
          className="font-mono text-[9px] uppercase tracking-widest transition-colors"
          style={{ color: s.color }}
        >
          {s.label}
        </span>
      </div>
      {s.tips.length > 0 && s.score < 3 && (
        <p className="font-mono text-[9px]" style={{ color: "hsl(0 0% 35%)" }}>
          → {s.tips[0]}
        </p>
      )}
    </div>
  );
}

// ─── Setup Dialog ─────────────────────────────────────────────────

function SetupDialog({
  onSetup,
  onCancel,
}: {
  onSetup: (passphrase: string, registerBio: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bioAvail, setBioAvail] = useState(false);
  const [registerBio, setRegisterBio] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvail);
  }, []);

  const handleGenerate = () => {
    const p = generatePassphrase();
    setPass(p);
    setConfirm(p);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pass);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pass.length < 8) {
      setError("err: passphrase must be ≥ 8 chars");
      return;
    }
    if (pass !== confirm) {
      setError("err: passphrases do not match");
      return;
    }
    setLoading(true);
    try {
      await onSetup(pass, registerBio && bioAvail);
    } catch {
      setError("err: failed to initialise encryption");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay>
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: "1px solid hsl(0 0% 13%)" }}
      >
        <Shield className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="font-mono text-sm text-foreground">enable_encryption</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
            AES-256-GCM · PBKDF2-SHA256 · client-side only
          </p>
        </div>
      </div>

      {/* Warning */}
      <div
        className="mx-6 mt-5 px-3 py-2.5 font-mono text-[10px] leading-relaxed flex gap-2"
        style={{
          border: "1px solid hsl(40 80% 50% / 0.2)",
          background: "hsl(40 80% 50% / 0.06)",
          color: "hsl(40 75% 60%)",
        }}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          <strong>no recovery path.</strong> Your key is derived from this
          passphrase only, and never stored. If lost, encrypted records cannot
          be recovered.
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Passphrase */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              passphrase
            </label>
            <button
              type="button"
              onClick={handleGenerate}
              className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest transition-colors"
              style={{ color: "hsl(142 55% 52%)" }}
            >
              <RefreshCw className="h-2.5 w-2.5" /> generate
            </button>
          </div>
          <TermInput
            type={show ? "text" : "password"}
            value={pass}
            onChange={setPass}
            placeholder="enter or generate a passphrase"
            autoFocus
            rightSlot={
              <>
                {pass && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-primary" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                >
                  {show ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </button>
              </>
            }
          />
          <StrengthBar passphrase={pass} />
        </div>

        {/* Confirm */}
        <div className="space-y-1.5">
          <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            confirm_passphrase
          </label>
          <TermInput
            type={show ? "text" : "password"}
            value={confirm}
            onChange={setConfirm}
            placeholder="repeat your passphrase"
          />
          {confirm && pass && confirm !== pass && (
            <p
              className="font-mono text-[9px]"
              style={{ color: "hsl(3 85% 60%)" }}
            >
              ↳ passphrases do not match
            </p>
          )}
        </div>

        {/* Biometric option */}
        {bioAvail && (
          <button
            type="button"
            onClick={() => setRegisterBio(!registerBio)}
            className="w-full flex items-center gap-3 px-3 py-2.5 font-mono text-[10px] transition-all"
            style={{
              border: registerBio
                ? "1px solid hsl(142 60% 52% / 0.4)"
                : "1px solid hsl(0 0% 16%)",
              background: registerBio
                ? "hsl(142 60% 52% / 0.07)"
                : "transparent",
              color: registerBio ? "hsl(142 55% 55%)" : "hsl(0 0% 42%)",
            }}
          >
            <Fingerprint className="h-4 w-4 shrink-0" />
            <span className="text-left uppercase tracking-widest">
              {registerBio
                ? "✓ biometric unlock enabled"
                : "also enable biometric unlock (face id / touch id)"}
            </span>
          </button>
        )}

        {error && (
          <p
            className="font-mono text-[10px]"
            style={{ color: "hsl(3 85% 60%)" }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <TermBtn onClick={onCancel} variant="ghost">
            cancel
          </TermBtn>
          <TermBtn
            type="submit"
            disabled={loading || !pass || !confirm}
            variant="primary"
          >
            {loading ? (
              <span className="animate-spin inline-block">◌</span>
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            enable
          </TermBtn>
        </div>
      </form>
    </Overlay>
  );
}

// ─── Unlock Dialog ────────────────────────────────────────────────

function UnlockDialog({
  hasBiometric,
  onBiometricUnlock,
  onUnlock,
  onSkip,
  onLockBiometric,
}: {
  hasBiometric: boolean;
  onBiometricUnlock: () => Promise<boolean>;
  onUnlock: (p: string) => Promise<boolean>;
  onSkip: () => void;
  onLockBiometric: () => void;
}) {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(true);

  const handleBiometric = async () => {
    setBioLoading(true);
    setError("");
    try {
      const ok = await onBiometricUnlock();
      if (!ok) setError("err: biometric failed — use passphrase below");
      setShowPass(true);
    } catch {
      setError("err: biometric unavailable");
      setShowPass(true);
    } finally {
      setBioLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const valid = await onUnlock(pass);
      if (!valid) setError("err: incorrect passphrase");
    } catch {
      setError("err: decryption failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Overlay>
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center gap-3"
        style={{ borderBottom: "1px solid hsl(0 0% 13%)" }}
      >
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="font-mono text-sm text-foreground">unlock_session</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
            AES-256-GCM · PBKDF2/600k · browser-only
          </p>
        </div>
      </div>

      {/* Cipher spec */}
      <div
        className="px-6 py-3 flex gap-6"
        style={{ borderBottom: "1px solid hsl(0 0% 11%)" }}
      >
        {[
          ["cipher", "AES-256-GCM"],
          ["kdf", "PBKDF2 SHA-256"],
          ["scope", "browser only"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
              {k}
            </p>
            <p className="font-mono text-[11px] text-foreground">{v}</p>
          </div>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {/* Biometric button */}
        {hasBiometric && (
          <button
            type="button"
            onClick={handleBiometric}
            disabled={bioLoading}
            className="w-full flex items-center justify-center gap-2.5 py-3 font-mono text-[11px]
                       uppercase tracking-widest transition-all disabled:opacity-50"
            style={{
              border: "1px solid hsl(142 60% 52% / 0.3)",
              background: "hsl(142 60% 52% / 0.07)",
              color: "hsl(142 55% 55%)",
            }}
          >
            {bioLoading ? (
              <span className="animate-spin">◌</span>
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            {bioLoading ? "verifying…" : "unlock with face id / touch id"}
          </button>
        )}

        {/* Passphrase form */}
        {(!hasBiometric || showPass) && (
          <>
            {hasBiometric && (
              <p
                className="font-mono text-[9px] uppercase tracking-widest text-center"
                style={{ color: "hsl(0 0% 32%)" }}
              >
                — or use passphrase —
              </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  passphrase
                </label>
                <TermInput
                  type={show ? "text" : "password"}
                  value={pass}
                  onChange={setPass}
                  placeholder="enter your passphrase"
                  autoFocus={!hasBiometric}
                  rightSlot={
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      {show ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                    </button>
                  }
                />
              </div>
              {error && (
                <p
                  className="font-mono text-[10px]"
                  style={{ color: "hsl(3 85% 60%)" }}
                >
                  {error}
                </p>
              )}
              <div className="flex gap-3">
                <TermBtn onClick={onSkip} variant="ghost">
                  skip
                </TermBtn>
                <TermBtn
                  type="submit"
                  disabled={loading || !pass}
                  variant="primary"
                >
                  {loading ? (
                    <span className="animate-spin inline-block">◌</span>
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  unlock
                </TermBtn>
              </div>
            </form>
          </>
        )}

        {/* Remove biometric */}
        {hasBiometric && showPass && (
          <button
            type="button"
            onClick={() => {
              onLockBiometric();
            }}
            className="w-full font-mono text-[9px] uppercase tracking-widest transition-colors"
            style={{ color: "hsl(0 0% 28%)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "hsl(3 85% 60%)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "hsl(0 0% 28%)")
            }
          >
            remove biometric registration
          </button>
        )}
      </div>
    </Overlay>
  );
}
