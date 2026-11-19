# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub security advisories](https://github.com/infinit3HQ/DevCents/security/advisories/new)
rather than in public issues. We aim to respond within a week.

## Encryption model

When encryption is on, the browser derives an AES-256-GCM key from your
passphrase (PBKDF2-SHA256, 600,000 iterations, per-user salt) and encrypts
data before it is sent to the server.

**Encrypted:** transaction, planned and recurring amounts and descriptions,
category budget limits, learned category rules.

**Not encrypted** (the server needs them for indexing and currency maths):
dates, income/expense type, category, currency code, locked exchange rate,
recurrence cadence, and the number of entries. Anyone with database access can
see *when* and *in which category* you spent, but not *how much* or *on what*.

Your passphrase is never sent to the server. A verification value (a known
string encrypted with your key) lets the app check the passphrase locally.

### Remote MCP and OAuth

Remote AI clients need the server to decrypt on their behalf. When you create
a remote token or approve an OAuth client, the browser wraps your key with a
key derived (HKDF-SHA256) from the bearer token itself. The database stores
only the token's SHA-256 hash and the wrapped key, so a database dump alone
cannot decrypt anything, and a stored token hash is not accepted as a
credential (Convex hashes the presented token itself). While a request is being handled, the web server
holds the unwrapped key in memory, so a compromised web server can read data
for tokens that are used during the compromise.

Tokens created by earlier versions stored the key in plaintext. They are
re-wrapped automatically the first time they are used. An administrator can
remove all remaining plaintext keys with:

```bash
npx convex run mcp:purgeLegacyPlaintextKeys
```

Changing your passphrase re-encrypts all data in one transaction and revokes
every token, OAuth grant and pending authorization code that carried the old
key. Other devices discard their stored key when they notice the change, and
the MCP server checks every key against your current passphrase before using
it, so nothing is written under the old key.

### OAuth

- Authorization code flow with PKCE (S256 only), public clients only.
- Redirect URIs must match a registered URI exactly (except the port of
  loopback `http` URIs, per RFC 8252); only `https`, loopback `http` and
  native-app schemes are accepted.
- The consent page shows the address that will receive access, because client
  names are chosen by the client and are not verified.
- Access tokens last 24 hours; refresh tokens rotate on use and a grant ends
  90 days after consent. Users can disconnect apps in Settings.

### Biometric unlock

Biometric unlock (WebAuthn) gates the app's UI. The key it unlocks is stored
in the browser's IndexedDB as a non-extractable `CryptoKey`, so scripts can't
read the key bytes, but anyone with access to the unlocked OS account and
browser profile could use it. Lock your device, and use the passphrase (not
biometrics) on shared machines.

## Server hardening

- Rate limits on OAuth registration, token and MCP endpoints (per client IP).
- OAuth registration, code exchange and refresh can only be called by the web
  server (shared `DEVCENTS_SERVER_SECRET`), not directly against Convex.
- Security headers on every response: anti-framing CSP, HSTS over HTTPS,
  `nosniff`, a strict referrer policy.
- The container runs as a non-root user on a read-only filesystem and ships
  without `node_modules`.
