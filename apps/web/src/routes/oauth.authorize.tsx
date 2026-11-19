import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { Show, RedirectToSignIn, useUser } from "@clerk/tanstack-react-start";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { motion } from "framer-motion";
import { Lock, ShieldCheck, AlertTriangle, Key, ChevronRight, Check } from "lucide-react";
import {
  base64ToSalt,
  deriveKey,
  verifyPassphrase,
  exportKeyToBase64,
  hashToken,
  loadKey,
  generateSecretToken,
  wrapKeyForToken,
} from "@devcents/shared";
import {
  isBiometricAvailable,
  verifyBiometric,
  getCredentialId,
} from "@/lib/webauthn";
import {
  type AuthorizeParams,
  buildRedirect,
  describeRedirect,
  fatalAuthorizeProblem,
  readAuthorizeParams,
  redirectableAuthorizeProblem,
} from "@/lib/oauthConsent";


export const Route = createFileRoute("/oauth/authorize")({
  component: OAuthAuthorizePage,
});

function OAuthAuthorizePage() {
  return (
    <>
      <Show when="signed-out">
        <RedirectToSignIn />
      </Show>
      <Show when="signed-in">
        <ConsentScreen />
      </Show>
    </>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex-1 min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full border border-destructive/40 bg-card p-6 font-mono text-center space-y-4">
        <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
        <h1 className="text-base text-foreground font-semibold">Invalid Authorization Request</h1>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function ConsentScreen() {
  const { user } = useUser();
  const [params, setParams] = useState<AuthorizeParams | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setParams(readAuthorizeParams(new URLSearchParams(window.location.search)));
    }
  }, []);

  const clientId = params?.client_id ?? "";
  const redirectUri = params?.redirect_uri ?? "";
  const clientInfo = useQuery(api.oauth.getClient, clientId ? { clientId } : "skip");
  const encSettings = useQuery(api.encryptionSettings.get);
  const createAuthCode = useMutation(api.oauth.createAuthCode);

  const [passphrase, setPassphrase] = useState("");
  const [passphraseError, setPassphraseError] = useState("");
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEncrypted = Boolean(encSettings?.salt && encSettings?.verificationHash);

  useEffect(() => {
    isBiometricAvailable().then((avail) => {
      if (avail && user?.id && getCredentialId(user.id)) {
        setBioAvailable(true);
      }
    });
  }, [user?.id]);

  const [unlockedKeyB64, setUnlockedKeyB64] = useState<string | null>(null);

  const handleBiometricUnlock = useCallback(async () => {
    if (!user?.id) return;
    setBioLoading(true);
    setPassphraseError("");
    try {
      const ok = await verifyBiometric(user.id);
      if (ok) {
        const storedKey = await loadKey(user.id);
        const current =
          storedKey && encSettings && (await verifyPassphrase(storedKey, encSettings.verificationHash));
        if (storedKey && current) {
          try {
            const b64 = await exportKeyToBase64(storedKey);
            setUnlockedKeyB64(b64);
            setPassphrase("••••••••••••");
          } catch {
            setPassphraseError("Biometric verified, but stored key cannot be exported. Please enter your passphrase.");
          }
        } else {
          setPassphraseError("No current key is stored on this device. Please enter your passphrase.");
        }
      }
    } catch {
      setPassphraseError("Biometric authentication cancelled or failed");
    } finally {
      setBioLoading(false);
    }
  }, [user?.id, encSettings]);

  if (!params) return null;
  // Wait for encryption settings too: deciding too early would hide the
  // passphrase box and create a grant with no key.
  if (encSettings === undefined) return null;

  const fatal = fatalAuthorizeProblem(params, clientInfo);
  if (fatal) return <ErrorCard message={fatal} />;
  if (clientInfo === undefined) return null; // loading
  // From here the redirect URI is verified against the registered client.

  const redirectError = redirectableAuthorizeProblem(params);
  if (redirectError) {
    window.location.replace(buildRedirect(redirectUri, { error: redirectError, state: params.state }));
    return null;
  }

  const handleAuthorize = async () => {
    setLoading(true);
    setError("");
    setPassphraseError("");

    try {
      let keyB64: string | undefined = undefined;

      if (isEncrypted) {
        if (unlockedKeyB64) {
          keyB64 = unlockedKeyB64;
        } else {
          if (!passphrase.trim()) {
            setPassphraseError("Passphrase required so the MCP server can decrypt your data");
            setLoading(false);
            return;
          }

          const salt = base64ToSalt(encSettings!.salt);
          const key = await deriveKey(passphrase, salt, true);
          const valid = await verifyPassphrase(key, encSettings!.verificationHash);

          if (!valid) {
            setPassphraseError("Incorrect passphrase");
            setLoading(false);
            return;
          }

          keyB64 = await exportKeyToBase64(key);
        }
      }

      // The vault key is wrapped with the one-time code, so the stored code
      // row is useless without the code itself.
      const code = generateSecretToken("dco_code_");
      const codeHash = await hashToken(code);
      const wrappedKey = keyB64 ? await wrapKeyForToken(keyB64, code) : undefined;

      await createAuthCode({
        clientId,
        redirectUri,
        codeHash,
        codeChallenge: params.code_challenge,
        codeChallengeMethod: params.code_challenge_method,
        scope: params.scope,
        wrappedKey,
      });

      window.location.assign(buildRedirect(redirectUri, { code, state: params.state }));
    } catch {
      setError("Authorization failed. Please try again.");
      setLoading(false);
    }
  };

  const handleDeny = () => {
    window.location.assign(buildRedirect(redirectUri, { error: "access_denied", state: params.state }));
  };

  const clientName = clientInfo?.clientName || "AI Assistant / MCP Client";

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center p-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-md w-full border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary font-medium">
              OAuth 2.1 MCP Authorization
            </span>
          </div>
          <h1 className="font-mono text-lg text-foreground font-medium">
            Connect <span className="text-primary">{clientName}</span>
          </h1>
          <p className="font-mono text-[11px] text-muted-foreground mt-1">
            Authorize this client to interact with your DevCents ledger via the Model Context Protocol.
          </p>
          <div className="mt-3 border border-border bg-background p-2.5 space-y-1">
            <p className="font-mono text-[10px] text-muted-foreground">
              Access will be sent to:
            </p>
            <p className="font-mono text-[12px] text-foreground break-all font-medium">
              {describeRedirect(redirectUri)}
            </p>
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
              The name above is chosen by the application and is not verified. Only continue
              if you started this connection and recognise this address.
            </p>
          </div>
        </div>

        {/* Permissions list */}
        <div className="p-6 border-b border-border space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Requested Permissions
          </p>
          <div className="space-y-2 font-mono text-[11px]">
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/90">View and search transactions, analytics, and spending history</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/90">Add new transactions with encrypted amounts and descriptions</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/90">Read and create planned & recurring scheduled items</span>
            </div>
            <div className="flex items-start gap-2">
              <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/90">Access wallet balances, monthly budgets, and exchange rates</span>
            </div>
          </div>
        </div>

        {/* Vault key sharing for remote MCP */}
        {isEncrypted && (
          <div className="p-6 border-b border-border bg-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] text-foreground font-medium">
                  Share Vault Key
                </span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary border border-primary/40 px-2 py-0.5">
                Encrypted
              </span>
            </div>
            <p className="font-mono text-[10px] text-muted-foreground leading-relaxed">
              Your data is encrypted with your passphrase. To let this client read and add entries, the DevCents server needs your decryption key while it handles the client's requests. The key is stored only in a form that needs the client's token to unlock; your passphrase itself is never sent.
            </p>

            <div className="space-y-2 pt-1">
              <input
                type="password"
                value={passphrase}
                onChange={(e) => {
                  setPassphrase(e.target.value);
                  setPassphraseError("");
                }}
                placeholder="Enter encryption passphrase"
                className="w-full font-mono text-[11px] bg-background border border-border p-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
              />

              {passphraseError && (
                <p className="font-mono text-[10px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {passphraseError}
                </p>
              )}

              {bioAvailable && (
                <Button variant="outline" size="sm"
                  type="button"
                  onClick={handleBiometricUnlock}
                  disabled={bioLoading}
                  className="w-full mt-1 text-primary">
                  <Key className="h-3.5 w-3.5" />
                  {bioLoading ? "Verifying biometric..." : "Use Biometric / Touch ID"}
                </Button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border-b border-destructive/30 font-mono text-[10px] text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="p-6 flex items-center gap-3">
          <Button variant="outline" size="default"
            type="button"
            onClick={handleDeny}
            disabled={loading}
            className="flex-1">
            Deny
          </Button>
          <Button variant="default" size="default"
            type="button"
            onClick={handleAuthorize}
            disabled={loading}
            className="flex-1">
            {loading ? "Authorizing..." : "Authorize"}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/10 font-mono text-[10px] text-muted-foreground flex items-center justify-between">
          <span>Logged in as {user?.primaryEmailAddress?.emailAddress ?? user?.fullName ?? "User"}</span>
          <span>DevCents v2.0</span>
        </div>
      </motion.div>
    </div>
  );
}
