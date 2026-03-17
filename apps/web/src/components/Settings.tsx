import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/tanstack-react-start";
import { motion } from "framer-motion";
import {
  Lock,
  RefreshCw,
  Eye,
  AlertTriangle,
  ChevronRight,
  Check,
  Copy,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useEncryption } from "@/contexts/EncryptionContext";
import { useCurrency } from "@/contexts/CurrencyContext";
import { CurrencyCombobox } from "@/components/ui/CurrencyCombobox";
import { hashToken } from "@devcents/shared";
import {
  isBiometricAvailable,
  registerBiometric,
  getCredentialId,
  clearCredentialId,
} from "@/lib/webauthn";
import { generatePassphrase, checkStrength } from "@devcents/shared";
import {
  deriveKey,
  base64ToSalt,
  verifyPassphrase,
  createVerificationHash,
  generateSalt,
  saltToBase64,
} from "@devcents/shared";
import { saveKey, clearKey } from "@devcents/shared";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

// ─── Section wrapper ──────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="px-6 py-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-0.5">
          {title}
        </p>
        {subtitle && (
          <p className="font-mono text-[11px] text-muted-foreground/60 mb-4">
            {subtitle}
          </p>
        )}
        <div className="mt-4 space-y-3">{children}</div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────

function Row({
  label,
  value,
  action,
  danger = false,
  onClick,
}: {
  label: string;
  value?: React.ReactNode;
  action?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-4 transition-colors border border-border bg-card">
      <div>
        <p className="font-mono text-[12px] text-foreground/90">{label}</p>
        {value && (
          <p className="font-mono text-[10px] mt-0.5 text-muted-foreground">
            {value}
          </p>
        )}
      </div>
      {action && onClick && (
        <button
          onClick={onClick}
          className={cn(
            "flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
            danger ? "text-destructive" : "text-primary",
          )}
        >
          {action} <ChevronRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────

function StatusBadge({
  on,
  labels,
}: {
  on: boolean;
  labels: [string, string];
}) {
  return (
    <span
      className={cn(
        "font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border",
        on
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-transparent text-muted-foreground",
      )}
    >
      {on ? labels[0] : labels[1]}
    </span>
  );
}

// ─── Change Passphrase modal ──────────────────────────────────────

function ChangePassphraseModal({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const settings = useQuery(api.encryptionSettings.get, user ? {} : "skip");
  const setupMutation = useMutation(api.encryptionSettings.setup);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const strength = checkStrength(next);

  const handleGenerate = () => {
    const p = generatePassphrase();
    setNext(p);
    setConfirm(p);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(next);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !user?.id) return;
    setError("");
    if (next.length < 8) {
      setError("err: new passphrase must be ≥ 8 chars");
      return;
    }
    if (next !== confirm) {
      setError("err: passphrases do not match");
      return;
    }
    setLoading(true);
    try {
      // Verify current passphrase
      const oldSalt = base64ToSalt(settings.salt);
      const oldKey = await deriveKey(current, oldSalt);
      const valid = await verifyPassphrase(oldKey, settings.verificationHash);
      if (!valid) {
        setError("err: current passphrase incorrect");
        setLoading(false);
        return;
      }

      // Derive new key and save
      const newSalt = await generateSalt();
      const newKey = await deriveKey(next, newSalt);
      const hash = await createVerificationHash(newKey);
      await setupMutation({
        salt: saltToBase64(newSalt),
        verificationHash: hash,
      });
      await saveKey(user.id, newKey);
      onClose();
    } catch {
      setError("err: failed to update passphrase");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md bg-card border border-border shadow-2xl"
      >
        <div className="px-6 py-4 flex items-center gap-3 border-b border-border">
          <Lock className="h-4 w-4 text-primary" />
          <p className="font-mono text-sm text-foreground">change_passphrase</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Current */}
          <div className="space-y-1.5">
            <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              current passphrase
            </label>
            <input
              type={show ? "text" : "password"}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              className="w-full bg-transparent font-mono text-sm outline-none px-3 py-2.5 text-foreground placeholder:text-muted-foreground/35 border border-border focus:border-primary/45"
              placeholder="your current passphrase"
            />
          </div>

          {/* New */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                new passphrase
              </label>
              <button
                type="button"
                onClick={handleGenerate}
                className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-primary"
              >
                <RefreshCw className="h-2.5 w-2.5" /> generate
              </button>
            </div>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                className="w-full bg-transparent font-mono text-sm outline-none px-3 py-2.5 pr-16 text-foreground placeholder:text-muted-foreground/35 border border-border focus:border-primary/45"
                placeholder="new passphrase"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 items-center">
                {next && (
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
              </div>
            </div>
            {/* Strength bar */}
            {next && (
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "h-0.5 w-8 rounded-sm transition-all duration-300",
                          i < strength.score ? strength.bgClass : "bg-border",
                        )}
                      />
                    ))}
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[9px] uppercase tracking-widest transition-colors",
                      strength.colorClass,
                    )}
                  >
                    {strength.label}
                  </span>
                </div>
                {strength.tips[0] && strength.score < 3 && (
                  <p className="font-mono text-[9px] text-muted-foreground">
                    → {strength.tips[0]}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Confirm */}
          <div className="space-y-1.5">
            <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              confirm new passphrase
            </label>
            <input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-transparent font-mono text-sm outline-none px-3 py-2.5 text-foreground placeholder:text-muted-foreground/35 border border-border focus:border-primary/45"
              placeholder="repeat new passphrase"
            />
          </div>

          {error && (
            <p className="font-mono text-[10px] text-destructive">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 font-mono text-[11px] uppercase tracking-widest border border-border text-muted-foreground bg-transparent"
            >
              cancel
            </button>
            <button
              type="submit"
              disabled={loading || !current || !next || !confirm}
              className="flex-1 h-9 font-mono text-[11px] uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-40 bg-primary text-primary-foreground border-none"
            >
              {loading ? (
                <span className="animate-spin">◌</span>
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              update
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── API Token Helpers ────────────────────────────────────────────

function generateRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `dct_live_${hex}`;
}

// ─── API & AI Access Section ──────────────────────────────────────

function ApiAccessSection() {
  const tokens = useQuery(api.mcp.listTokens) || [];
  const generateTokenMutation = useMutation(api.mcp.generateToken);
  const revokeTokenMutation = useMutation(api.mcp.revokeToken);

  const [newToken, setNewToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateToken = async () => {
    setLoading(true);
    try {
      const raw = generateRawToken();
      const hash = await hashToken(raw);
      await generateTokenMutation({
        name: `Token ${tokens.length + 1}`,
        tokenHash: hash,
      });
      setNewToken(raw);
    } catch {
      // token generation failed silently — user can retry
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(newToken);
    } catch {
      // clipboard unavailable — user can manually copy from the displayed token
    }
  };

  const clearNewToken = () => setNewToken("");

  return (
    <Section
      title="api & ai access"
      subtitle="Manage MCP Server access tokens."
    >
      {newToken ? (
        <div className="border border-primary bg-primary/5 p-4 space-y-3">
          <p className="font-mono text-[11px] text-primary">
            New token created. Copy it now, you won't be able to see it again.
          </p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 font-mono text-[10px] bg-background border border-border p-2">
              {newToken}
            </code>
            <button
              onClick={handleCopy}
              className="p-2 border border-border hover:bg-muted transition-colors text-primary"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={clearNewToken}
            className="w-full font-mono text-[10px] uppercase tracking-widest text-muted-foreground pt-2 border-t border-border mt-2"
          >
            done
          </button>
        </div>
      ) : (
        <Row
          label="generate token"
          value="create a new token for local MCP and AI Agents"
          action={loading ? "generating..." : "generate"}
          onClick={loading ? undefined : handleCreateToken}
        />
      )}

      {tokens.length > 0 && (
        <div className="mt-4 border border-border">
          {tokens.map((t, idx) => (
            <div
              key={t._id}
              className={cn(
                "flex items-center justify-between p-3 bg-card",
                idx < tokens.length - 1 && "border-b border-border",
              )}
            >
              <div>
                <p className="font-mono text-[11px] text-foreground">
                  {t.name}
                </p>
                <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                  created {new Date(t.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => revokeTokenMutation({ id: t._id })}
                className="font-mono text-[9px] uppercase tracking-widest text-destructive hover:opacity-70 transition-opacity"
              >
                revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Main Settings component ──────────────────────────────────────

export function Settings() {
  const { user } = useUser();
  const { isEnabled, isUnlocked, setupEncryption } = useEncryption();
  const { baseCurrency, setBaseCurrency } = useCurrency();
  const [bioAvail, setBioAvail] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [showChange, setShowChange] = useState(false);

  useEffect(() => {
    isBiometricAvailable().then(setBioAvail);
    if (user?.id) setBioEnabled(!!getCredentialId(user.id));
  }, [user?.id]);

  const handleEnableBio = useCallback(async () => {
    if (!user?.id || !user.fullName) return;
    setBioLoading(true);
    try {
      await registerBiometric(user.id, user.fullName ?? user.id);
      setBioEnabled(true);
    } catch {
      // user cancelled
    } finally {
      setBioLoading(false);
    }
  }, [user?.id, user?.fullName]);

  const handleDisableBio = useCallback(() => {
    if (!user?.id) return;
    clearCredentialId(user.id);
    setBioEnabled(false);
  }, [user?.id]);

  const handleDisableEncryption = useCallback(async () => {
    if (!user?.id) return;
    await clearKey(user.id);
    if (user.id) clearCredentialId(user.id);
    // Note: we can't delete the Convex settings here without a mutation —
    // this just clears local state; user would need to contact support to reset.
  }, [user?.id]);

  return (
    <>
      <div className="min-h-dvh bg-background">
        {/* Page header */}
        <div className="sticky z-20 border-b border-border bg-background top-12">
          <div className="max-w-2xl mx-auto px-6 py-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
              config
            </p>
            <h1 className="font-mono text-xl text-foreground">settings</h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto py-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="border border-border"
          >
            {/* ── Encryption ──────────────────────────────────── */}
            <Section
              title="encryption"
              subtitle="AES-256-GCM client-side encryption. Your key never leaves your browser."
            >
              <Row
                label="status"
                value={
                  isEnabled
                    ? isUnlocked
                      ? "active and unlocked"
                      : "enabled but locked"
                    : "encryption is off — data stored as plaintext"
                }
                action={isEnabled ? undefined : "enable"}
                onClick={isEnabled ? undefined : setupEncryption}
              />

              {isEnabled && (
                <>
                  <Row
                    label="cipher"
                    value="AES-256-GCM with PBKDF2-SHA256 key derivation (600,000 iterations)"
                  />
                  <Row
                    label="key scope"
                    value="browser-only — never transmitted or stored on server"
                  />
                  <Row
                    label="passphrase"
                    value="change your encryption passphrase"
                    action={isUnlocked ? "change" : undefined}
                    onClick={() => setShowChange(true)}
                  />
                </>
              )}
            </Section>

            {/* ── Biometric ──────────────────────────────────── */}
            <Section
              title="biometric unlock"
              subtitle={
                bioAvail
                  ? "Touch ID · Face ID · Windows Hello"
                  : "not supported on this device or browser"
              }
            >
              {!bioAvail ? (
                <div className="font-mono text-[11px] px-4 py-3 border border-border text-muted-foreground">
                  platform authenticator not detected
                </div>
              ) : !isEnabled ? (
                <div className="font-mono text-[11px] px-4 py-3 border border-border text-muted-foreground">
                  enable encryption first to use biometric unlock
                </div>
              ) : (
                <>
                  <Row
                    label="biometric unlock"
                    value={
                      <StatusBadge
                        on={bioEnabled}
                        labels={["registered", "not registered"]}
                      />
                    }
                    action={bioEnabled ? "remove" : "register"}
                    danger={bioEnabled}
                    onClick={bioEnabled ? handleDisableBio : handleEnableBio}
                  />
                  {bioLoading && (
                    <p className="font-mono text-[9px] uppercase tracking-widest text-primary">
                      ◌ waiting for biometric…
                    </p>
                  )}
                </>
              )}
            </Section>

            {/* ── Session ─────────────────────────────────────── */}
            <Section title="session">
              <Row
                label="inactivity lock"
                value="session key cleared after 5 minutes of no activity"
              />
              <Row
                label="key storage"
                value="IndexedDB (browser-local, cleared on inactivity lock)"
              />
            </Section>

            {/* ── Preferences ─────────────────────────────────── */}
            <Section title="preferences">
              <div className="flex items-center justify-between py-3 px-4 transition-colors border border-border bg-card">
                <div>
                  <p className="font-mono text-[12px] text-foreground/90">
                    base currency
                  </p>
                  <p className="font-mono text-[10px] mt-0.5 text-muted-foreground">
                    values converted to this globally
                  </p>
                </div>
                <CurrencyCombobox
                  value={baseCurrency}
                  onChange={setBaseCurrency}
                  className="w-[160px]"
                />
              </div>
            </Section>

            {/* ── Account ─────────────────────────────────────── */}
            <Section title="account">
              <Row
                label="signed in as"
                value={user?.emailAddresses?.[0]?.emailAddress ?? user?.id}
              />
              <Row label="user id" value={user?.id} />
            </Section>

            {/* ── API Access ──────────────────────────────────── */}
            <ApiAccessSection />

            {/* ── Danger zone ─────────────────────────────────── */}
            {isEnabled && (
              <Section title="danger zone">
                <div className="flex items-start gap-2 px-3 py-2.5 font-mono text-[10px] border border-amber-500/20 bg-amber-500/5 text-amber-500">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Clearing the local key only locks this device. Encrypted
                    records remain in your database — re-unlock with your
                    passphrase to regain access.
                  </span>
                </div>
                <Row
                  label="clear local key"
                  value="removes cached key from this browser (you can re-unlock with passphrase)"
                  action="clear"
                  danger
                  onClick={handleDisableEncryption}
                />
              </Section>
            )}
          </motion.div>
        </div>
      </div>

      {/* Change passphrase modal */}
      {showChange && (
        <ChangePassphraseModal onClose={() => setShowChange(false)} />
      )}
    </>
  );
}
