# DevCents

Smart, self-hosted money management built with **TanStack Start**, **Convex**, and **Clerk**.

## Prerequisites

- **Node.js** ≥ 18
- **Docker** (for the self-hosted Convex backend)

## Quick Start

```bash
# Install dependencies
npm install

# Start everything for local development (Convex + Vite)
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

Press `Ctrl+C` to tear down all services.

## Scripts

| Script                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `npm run dev:all`      | Start local Convex and the Vite dev server         |
| `npm run dev`          | Start the Vite dev server only                     |
| `npm run convex:local` | Start Convex sync against the local Docker backend |
| `npm run build`        | Build the production web app                       |
| `npm run test`         | Run tests with Vitest                              |

## Tech Stack

- **Framework** — [TanStack Start](https://tanstack.com/start) (React, file-based routing)
- **Backend** — [Convex](https://convex.dev) (self-hosted via Docker)
- **Auth** — [Clerk](https://clerk.com)
- **Styling** — [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **Animations** — [Framer Motion](https://motion.dev)

## Project Structure

```
├── apps/
│   ├── mcp/            # MCP service
│   └── web/            # TanStack Start app and Convex functions
├── packages/
│   └── shared/         # Shared utilities
├── deployment/
│   ├── Dockerfile      # Canonical production image build
│   └── start.sh        # Runtime env injection for the web image
├── scripts/
│   └── dev.sh          # Local Convex + Vite orchestrator
├── docker-compose.dev.yml
├── docker-compose.yml  # Production stack for the self-hosted server
└── package.json
```

## Deployment

- `docker-compose.yml` is the production stack consumed by the self-hosted deploy workflow.
- `docker-compose.dev.yml` is only for local development.
- `.github/workflows/docker-release.yml` publishes the production web image to GHCR.
- `.github/workflows/deploy.yml` runs after a successful release and pulls that published image onto the server.
