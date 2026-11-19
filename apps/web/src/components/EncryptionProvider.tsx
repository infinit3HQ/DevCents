import { useState, useCallback, useEffect } from "react";
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
} from "@devcents/shared";
import { saveKey, loadKey, clearKey } from "@devcents/shared";
import {
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
  getCredentialId,
  clearCredentialId,
} from "@/lib/webauthn";
import { generatePassphrase, checkStrength } from "@devcents/shared";
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

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ─── Constants ───────────────────────────────────────────────────

const INACTIVITY_MS = 5 * 60 * 1000;
const LOCK_KEY = "devcents:locked";
const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

import { EncryptionContext } from "@/contexts/EncryptionContext";

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

  // Lets other UI (e.g. the "entries are locked" notice) reopen the unlock
  // dialog after the user skipped it.
  useEffect(() => {
    const open = () => setShowUnlock(true);
    document.addEventListener("open-unlock", open);
    return () => document.removeEventListener("open-unlock", open);
  }, []);

  const isEnabled = !!settings;
  const isUnlocked = !!cryptoKey;
  const hasBio = !!user && !!getCredentialId(user.id);

  // ── Restore key from IndexedDB on mount ──────────────────────
  useEffect(() => {
    if (!user?.id || !settings) return;

    // If locked by inactivity, don't restore — require manual unlock
    if (localStorage.getItem(LOCK_KEY) === "true") {
      setShowUnlock(true);
      return;
    }

    // Re-runs whenever the settings change (e.g. the passphrase was changed on
    // another device). A stored key that no longer matches is discarded, so
    // this tab can't keep writing data under the old passphrase.
    let cancelled = false;
    const userId = user.id;
    loadKey(userId)
      .then(async (key) => {
        if (cancelled || !key) return;
        if (await verifyPassphrase(key, settings.verificationHash)) {
          setCryptoKey(key);
          setShowUnlock(false);
        } else {
          await clearKey(userId);
          setCryptoKey(null);
          setShowUnlock(true);
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
    // Only run once on mount — give loadKey time to restore before showing dialog
    if (cryptoKey) return;
    const t = setTimeout(() => {
      setCryptoKey((prev) => {
        if (!prev) setShowUnlock(true);
        return prev;
      });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, user]);

  // ── 5-min inactivity auto-lock ───────────────────────────────
  useEffect(() => {
    if (!isUnlocked || !user?.id) return;

    let timer: ReturnType<typeof setTimeout>;
    const lock = async () => {
      localStorage.setItem(LOCK_KEY, "true");
      setCryptoKey(null);
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
  }, [isUnlocked, user?.id]);

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
        localStorage.removeItem(LOCK_KEY);
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
      if (key && settings && (await verifyPassphrase(key, settings.verificationHash))) {
        localStorage.removeItem(LOCK_KEY);
        setCryptoKey(key);
        setShowUnlock(false);
        return true;
      }
    }
    return false;
  }, [user?.id, settings]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md bg-card border border-border shadow-2xl"
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
        className={cn(
          "w-full bg-transparent font-mono text-sm text-foreground",
          "placeholder:text-muted-foreground/35 outline-none px-3 py-2.5",
          "border border-border focus:border-primary/45",
          rightSlot ? "pr-20" : "pr-3",
        )}
      />
      {rightSlot && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

/** Dialog action: the shared Button, full-width in its row. */
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
  const mapped = { primary: "default", ghost: "outline", danger: "outline-destructive" } as const;
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      variant={mapped[variant]}
      className={cn("flex-1", className)}
    >
      {children}
    </Button>
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
              className={cn(
                "h-0.5 w-8 rounded-sm transition-all duration-300",
                i < s.score ? s.bgClass : "bg-border",
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest transition-colors",
            s.colorClass,
          )}
        >
          {s.label}
        </span>
      </div>
      {s.tips.length > 0 && s.score < 3 && (
        <p className="font-mono text-[10px] text-muted-foreground">
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
      <div className="px-6 py-4 flex items-center gap-3 border-b border-border">
        <Shield className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="font-mono text-sm text-foreground">enable_encryption</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            AES-256-GCM · PBKDF2-SHA256 · client-side only
          </p>
        </div>
      </div>

      {/* Warning */}
      <div className="mx-6 mt-5 px-3 py-2.5 font-mono text-[10px] leading-relaxed flex gap-2 border border-amber-500/20 bg-amber-500/5 text-amber-500">
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
            <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              passphrase
            </label>
            <Button variant="link" size="inline"
              type="button"
              onClick={handleGenerate}
              className="text-primary">
              <RefreshCw className="h-2.5 w-2.5" /> generate
            </Button>
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
          <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            confirm passphrase
          </label>
          <TermInput
            type={show ? "text" : "password"}
            value={confirm}
            onChange={setConfirm}
            placeholder="repeat your passphrase"
          />
          {confirm && pass && confirm !== pass && (
            <p className="text-destructive font-mono text-[10px]">
              ↳ passphrases do not match
            </p>
          )}
        </div>

        {/* Biometric option */}
        {bioAvail && (
          <button
            type="button"
            onClick={() => setRegisterBio(!registerBio)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 font-mono text-[10px] transition-all border",
              registerBio
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-transparent text-muted-foreground",
            )}
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
          <p className="font-mono text-[10px] text-destructive">{error}</p>
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
      <div className="px-6 py-4 flex items-center gap-3 border-b border-border">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <div>
          <p className="font-mono text-sm text-foreground">unlock_session</p>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
            AES-256-GCM · PBKDF2/600k · browser-only
          </p>
        </div>
      </div>

      {/* Cipher spec */}
      <div className="px-6 py-3 flex gap-6 border-b border-border">
        {[
          ["cipher", "AES-256-GCM"],
          ["kdf", "PBKDF2 SHA-256"],
          ["scope", "browser only"],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {k}
            </p>
            <p className="font-mono text-[11px] text-foreground">{v}</p>
          </div>
        ))}
      </div>

      <div className="p-6 space-y-4">
        {/* Biometric button */}
        {hasBiometric && (
          <Button variant="soft" size="lg"
            type="button"
            onClick={handleBiometric}
            disabled={bioLoading}
            className="w-full text-primary">
            {bioLoading ? (
              <span className="animate-spin">◌</span>
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            {bioLoading ? "verifying…" : "unlock with face id / touch id"}
          </Button>
        )}

        {/* Passphrase form */}
        {(!hasBiometric || showPass) && (
          <>
            {hasBiometric && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-center text-muted-foreground">
                — or use passphrase —
              </p>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
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
                <p className="text-destructive font-mono text-[10px]">{error}</p>
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
          <Button variant="ghost" size="sm"
            type="button"
            onClick={() => {
              onLockBiometric();
            }}
            className="w-full text-muted-foreground hover:text-destructive mt-4">
            remove biometric registration
          </Button>
        )}
      </div>
    </Overlay>
  );
}
