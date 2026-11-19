<div align="center">

<img src="apps/web/public/logo512.png" width="80" alt="DevCents Logo" />

# DevCents

**Self-hosted, privacy-first personal finance.**
Your money data stays on your server, encrypted by your passphrase, visible only to you.

[![AGPL-3.0 License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![TanStack](https://img.shields.io/badge/built%20with-TanStack-FF4154?logo=react&logoColor=white)](https://tanstack.com/start)
[![Convex](https://img.shields.io/badge/backend-Convex-EE342F)](https://convex.dev)

</div>

---

## ✨ Screenshots

<div align="center">

### Landing Page

<p>
  <img src=".images/LandingPage-1.jpeg" width="32%" />
  <img src=".images/LandingPage-2.jpeg" width="32%" />
  <img src=".images/LandingPage-3.jpeg" width="32%" />
</p>

### Dashboard

<p>
  <img src=".images/Dashbaord-1.jpeg" width="48%" />
  <img src=".images/Dashboard-Catogoires.jpeg" width="48%" />
</p>

<p>
  <img src=".images/Dashbaord-Monthly.jpeg" width="48%" />
  <img src=".images/Biomatic-lock.jpeg" width="48%" />
</p>

### Planning & Forecasting

<p>
  <img src=".images/Dashbaord-Plan-1.jpeg" width="32%" />
  <img src=".images/Dashbaord-Plan-2.jpeg" width="32%" />
  <img src=".images/Dashbaord-Plan-3.jpeg" width="32%" />
</p>

### Add Entries

<p>
  <img src=".images/New-Entry-Ledger.jpeg" width="32%" />
  <img src=".images/New-Entry-Planned.jpeg" width="32%" />
  <img src=".images/New-Entry-Recurring.jpeg" width="32%" />
</p>

### Mobile Experience

<p>
  <img src=".images/Mobile-Dashbaord-Overview.jpeg" width="18%" />
  <img src=".images/Mobile-Dashbaord-Ledger.jpeg" width="18%" />
  <img src=".images/Mobile-Dashbaord-ANALYTICS.jpeg" width="18%" />
  <img src=".images/Mobile-Dashboard-Planing.jpeg" width="18%" />
  <img src=".images/Mobile-New-Entry-Ledger.jpeg" width="18%" />
</p>

<p>
  <img src=".images/Mobile-New-Entry-Planned.jpeg" width="18%" />
  <img src=".images/Mobile-New-Entry-Recurring.jpeg" width="18%" />
</p>

</div>

---

## Why DevCents?

| | DevCents | Mint / YNAB | Spreadsheets |
|---|---|---|---|
| Your data, your server | ✅ | ❌ | ✅ |
| Client-side encryption | ✅ | ❌ | ❌ |
| Biometric unlock | ✅ | ✅ | ❌ |
| No subscription | ✅ | ❌ | ✅ |
| Multi-currency | ✅ | ⚠️ | Manual |
| AI assistant (MCP) | ✅ | ❌ | ❌ |
| Mobile optimized | ✅ | ✅ | ❌ |

---

## Features

- **🔒 Client-side encryption** — Amounts and descriptions are encrypted with AES-256-GCM using a passphrase only you know. The server stores ciphertext. See [SECURITY.md](SECURITY.md) for exactly what is and isn't encrypted.
- **🤳 Biometric unlock** — Face ID / fingerprint via WebAuthn. No password prompts on your own device.
- **🌍 Multi-currency** — Log transactions in any currency, auto-converted to your base.
- **📊 Spending analytics** — Category breakdowns with time filters (today, week, month, custom range).
- **📅 Planning & forecasting** — Schedule one-time and recurring transactions, visualize projected balance.
- **🚫 No Plaid, no scraping** — You enter what you spend. Nothing connects to your bank.
- **🤖 Claude MCP integration** — Ask Claude about your finances over OAuth 2.1 or a scoped, expiring API token.
- **📱 100% mobile optimized** — Feels native on iOS and Android browsers.
- **🏠 Self-hosted** — Published Docker images and one compose file. Your data stays on your server; sign-in uses Clerk.

---

## Quick Start

**Prerequisites:** Node.js 26 (latest), pnpm 11, Docker

```bash
# 1. Clone and install
git clone https://github.com/infinit3HQ/DevCents.git
cd DevCents
pnpm install

# 2. Start everything (Convex backend + Vite dev server)
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) and create your account.

> **Self-hosting in production?** See [Deployment](#deployment) below.

---

## Claude & AI MCP Setup (MCP 2.0)

DevCents ships an [MCP server](apps/mcp/) built on the **Model Context Protocol 2.0** specification, allowing Claude, Cursor, and other AI agents to securely query and add your transactions with end-to-end encryption.

**1.** Generate an API token in **Settings → API & AI Access**

**2.** Add to your Claude / Cursor MCP config (`claude_desktop_config.json` or `.cursor/mcp.json`):

### Option A: Remote Web MCP (HTTP Endpoint)

If you are running DevCents remotely (e.g., `https://money.example.com`), you can connect Claude Desktop, Cursor, or remote agents directly over HTTPS without running local scripts or keeping local passphrases:

```json
{
  "mcpServers": {
    "devcents": {
      "url": "https://money.example.com/mcp",
      "headers": {
        "Authorization": "Bearer dct_live_your_token_here"
      }
    }
  }
}
```
*(Clients that support OAuth, such as Claude, only need the URL: they open DevCents in your browser to approve access. For a static token, choose **generate remote token** in **Settings → API & AI Access**: your key is wrapped with the token, so the database alone can't decrypt it.)*

### Option B: Local Stdio MCP (Node/NPX)

Alternatively, to run the MCP server locally over standard I/O:

```json
{
  "mcpServers": {
    "devcents": {
      "command": "npx",
      "args": ["-y", "@devcents/mcp"],
      "env": {
        "DEVCENTS_API_KEY": "dct_live_your_token_here",
        "DEVCENTS_PASSPHRASE": "your_encryption_passphrase",
        "CONVEX_URL": "https://your-convex-instance.com"
      }
    }
  }
}
```

To run directly from this repository workspace:

```json
{
  "mcpServers": {
    "devcents": {
      "command": "node",
      "args": ["/absolute/path/to/DevCents/apps/mcp/src/index.ts"],
      "env": {
        "DEVCENTS_API_KEY": "dct_live_your_token_here",
        "DEVCENTS_PASSPHRASE": "your_encryption_passphrase",
        "CONVEX_URL": "http://127.0.0.1:3210"
      }
    }
  }
}
```

**3.** Ask Claude: *"What did I spend last week?"* or *"Add a $12 coffee expense."*

---

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:all` | Start local Convex backend + Vite dev server |
| `npm run dev:tmux` | Same as above but in separate tmux panes |
| `npm run dev` | Vite dev server only |
| `npm run dev:mcp` | Start DevCents MCP 2.0 server in watch mode |
| `npm run convex:local` | Sync Convex against local Docker backend |
| `npm run build` | Build the production web app |
| `npm run test` | Run tests with Vitest |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [TanStack Start](https://tanstack.com/start) — React, file-based routing |
| Backend | [Convex](https://convex.dev) — self-hosted via Docker |
| Auth | [Clerk](https://clerk.com) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| Animations | [Framer Motion](https://motion.dev) |
| AI | [MCP SDK](https://modelcontextprotocol.io) |

---

## Project Structure

```
├── apps/
│   ├── mcp/                # MCP server for Claude integration
│   └── web/                # TanStack Start app + Convex functions
├── packages/
│   └── shared/             # Crypto utilities shared across apps
├── deployment/
│   ├── Dockerfile          # web + functions images
│   ├── start.sh            # Checks required settings, starts the server
│   └── deploy-functions.sh # Convex deploy job
├── scripts/
│   └── dev.sh              # Local dev orchestrator
├── docker-compose.yml      # Self-hosted stack
├── docs/self-hosting.md    # Self-hosting guide
└── docker-compose.dev.yml  # Local development stack
```

---

## Deployment

```bash
cp .env.example .env        # fill in Clerk keys and generated secrets
docker compose up -d postgres convex
docker compose exec convex ./generate_admin_key.sh   # add to .env
docker compose up -d
```

The full walkthrough, including HTTPS (bundled Caddy overlay or your own
proxy), upgrades and backups, is in **[docs/self-hosting.md](docs/self-hosting.md)**.

| File | Purpose |
|---|---|
| `docker-compose.yml` | Full stack: Postgres, Convex, functions deployer, web |
| `deployment/compose.caddy.yml` | Optional automatic-HTTPS front end |
| `deployment/compose.traefik.yml` | Web-only deployment behind an existing Traefik |
| `.github/workflows/docker-release.yml` | Tests, scans and publishes multi-arch images to GHCR |

---

## License

[AGPL-3.0](LICENSE) — © 2026 infinit3HQ
