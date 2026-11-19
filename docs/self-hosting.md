# Self-hosting DevCents

DevCents runs as four containers: Postgres, the Convex backend, a one-shot
job that deploys the Convex functions, and the web app. Images are published
to GHCR on every release:

| Image | Purpose |
|---|---|
| `ghcr.io/infinit3hq/devcents` | Web app (port 3000) |
| `ghcr.io/infinit3hq/devcents-functions` | Pushes Convex functions and settings, then exits |
| `ghcr.io/get-convex/convex-backend` | Convex backend (port 3210) |

Both DevCents images are multi-arch (amd64, arm64), carry SBOM and build
provenance attestations, and are configured entirely through environment
variables. Nothing is baked in at build time.

## What you need

- A Linux host with Docker and Docker Compose v2.
- Two hostnames pointing at it, one for the app and one for Convex (for
  example `money.example.com` and `convex.money.example.com`). Browsers talk to
  Convex directly, so it must be reachable over HTTPS.
- A [Clerk](https://clerk.com) application. Sign-in is handled by Clerk's
  hosted service, so DevCents is not fully offline: Clerk sees who signs in,
  but never your financial data.

## 1. Configure

```bash
git clone https://github.com/infinit3HQ/DevCents.git && cd DevCents
cp .env.example .env
```

Fill in `.env`. Generate each secret separately:

```bash
openssl rand -hex 32
```

You need `INSTANCE_SECRET`, `POSTGRES_PASSWORD` and `DEVCENTS_SERVER_SECRET`.
Keep `INSTANCE_NAME` to letters, digits and underscores.
From Clerk, copy the publishable key, the secret key and the Frontend API URL
(`CLERK_ISSUER_URL`). In Clerk, also add your app URL to the allowed origins.

## 2. Start the backend and create the admin key

```bash
docker compose up -d postgres convex
docker compose exec convex ./generate_admin_key.sh
```

Put the printed key in `.env` as `CONVEX_SELF_HOSTED_ADMIN_KEY`. Treat it like
a root password: it can read and change all data.

## 3. Start everything

```bash
docker compose up -d
docker compose logs -f functions web
```

`functions` sets the Convex environment and deploys the functions, then exits;
`web` starts after it succeeds.

## 4. HTTPS

Ports 3000 and 3210 are bound to `127.0.0.1` by default. Put a reverse proxy
in front:

- **No proxy yet?** Use the bundled Caddy overlay, which gets certificates
  automatically. Set `APP_DOMAIN` and `CONVEX_DOMAIN`, then:

  ```bash
  docker compose -f docker-compose.yml -f deployment/compose.caddy.yml up -d
  ```

- **Already running Traefik, nginx or similar?** Route the app hostname to
  `web:3000` and the Convex hostname to `convex:3210`, keep `TRUST_PROXY=true`,
  and set `PUBLIC_URL` to the app's public URL.
  `deployment/compose.traefik.yml` is a working Traefik example (web only,
  with Convex hosted elsewhere).

`TRUST_PROXY=true` is only safe when the app port can't be reached except
through your proxy (the default `127.0.0.1` binding). If you expose port 3000
directly, set `TRUST_PROXY=false`, or clients can fake their IP address to get
around rate limits.

## Upgrading

```bash
# .env: DEVCENTS_VERSION=v2026.11.19-abc1234 (from GitHub Releases)
docker compose pull
docker compose up -d
```

`functions` re-runs on every `up` and deploys any schema or function changes.

## Backups

Your data lives in the `postgres-data` volume. Back it up regularly:

```bash
docker compose exec postgres pg_dumpall -U postgres | gzip > devcents-$(date +%F).sql.gz
```

Each user can also export an account backup from **Settings → Data**.
Encrypted fields stay encrypted in both kinds of backup, so keep your
passphrase safe: without it the data cannot be recovered.

## Security checklist

- Keep `.env` out of version control (`chmod 600 .env`).
- Use a distinct random value for every secret; never reuse values from examples.
- Don't publish ports 3000, 3210 or 5432 directly to the internet.
- Pin `DEVCENTS_VERSION` and `CONVEX_BACKEND_IMAGE`, and watch releases for security fixes.
- Leave `DEVCENTS_PASSPHRASE` empty unless you are the only user.

See [SECURITY.md](../SECURITY.md) for the encryption model and its limits.
