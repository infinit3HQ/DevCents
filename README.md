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

- **🔒 Client-side encryption** — AES-GCM encryption with a passphrase only you know. The server stores ciphertext.
- **🤳 Biometric unlock** — Face ID / fingerprint via WebAuthn. No password prompts on your own device.
- **🌍 Multi-currency** — Log transactions in any currency, auto-converted to your base.
- **📊 Spending analytics** — Category breakdowns with time filters (today, week, month, custom range).
- **📅 Planning & forecasting** — Schedule one-time and recurring transactions, visualize projected balance.
- **🚫 No Plaid, no scraping** — You enter what you spend. Nothing connects to your bank.
- **🤖 Claude MCP integration** — Ask Claude about your finances. Transactions are decrypted locally before being sent.
- **📱 100% mobile optimized** — Feels native on iOS and Android browsers.
- **🏠 Fully self-hosted** — One `docker compose up` and it's yours, on your server.

---

## Quick Start

**Prerequisites:** Node.js ≥ 22, Docker

```bash
# 1. Clone and install
git clone https://github.com/infinit3HQ/DevCents.git
cd DevCents
npm install

# 2. Start everything (Convex backend + Vite dev server)
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000) and create your account.

> **Self-hosting in production?** See [Deployment](#deployment) below.

---

## Claude MCP Setup

DevCents ships an [MCP server](apps/mcp/) so Claude can read and add your transactions.

**1.** Generate an API token in **Settings → API & AI Access**

**2.** Add to your Claude / Cursor MCP config:

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

**3.** Ask Claude: *"What did I spend last week?"* or *"Add a $12 coffee expense."*

---

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:all` | Start local Convex backend + Vite dev server |
| `npm run dev:tmux` | Same as above but in separate tmux panes |
| `npm run dev` | Vite dev server only |
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
│   ├── Dockerfile          # Production image
│   └── start.sh            # Runtime env injection
├── scripts/
│   └── dev.sh              # Local dev orchestrator
├── docker-compose.yml      # Production self-hosted stack
└── docker-compose.dev.yml  # Local development stack
```

---

## Deployment

DevCents is designed to run on your own server with a single compose file.

```bash
# Pull and start the production stack
docker compose up -d
```

- `docker-compose.yml` — production stack (web app + Convex backend)
- `.github/workflows/docker-release.yml` — publishes image to GHCR on release
- `.github/workflows/deploy.yml` — pulls the new image to your server after release

---

## License

[AGPL-3.0](LICENSE) — © 2026 infinit3HQ
