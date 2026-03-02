# DevCents

Smart, self-hosted money management built with **TanStack Start**, **Convex**, and **Clerk**.

## Prerequisites

- **Node.js** ≥ 18
- **Docker** (for the self-hosted Convex backend)

## Quick Start

```bash
# Install dependencies
npm install

# Start everything (Docker + Convex + Vite)
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

Press `Ctrl+C` to tear down all services.

## Scripts

| Script                 | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `npm run dev:all`      | Start full dev environment (Docker → Convex → Vite) |
| `npm run dev`          | Start Vite dev server only (port 3000)              |
| `npm run convex:local` | Start Convex local sync only                        |
| `npm run build`        | Production build                                    |
| `npm run test`         | Run tests with Vitest                               |

## Tech Stack

- **Framework** — [TanStack Start](https://tanstack.com/start) (React, file-based routing)
- **Backend** — [Convex](https://convex.dev) (self-hosted via Docker)
- **Auth** — [Clerk](https://clerk.com)
- **Styling** — [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- **Animations** — [Framer Motion](https://motion.dev)

## Project Structure

```
├── convex/             # Convex schema, functions, and auth config
├── public/             # Static assets (favicon, manifest)
├── scripts/            # Dev tooling scripts
│   └── dev.sh          # Full dev environment orchestrator
├── src/
│   ├── components/     # React components
│   │   └── ui/         # shadcn/ui primitives
│   ├── lib/            # Utility functions
│   ├── routes/         # TanStack file-based routes
│   ├── app.css         # Global styles & design tokens
│   ├── router.tsx      # Router configuration
│   └── start.ts        # TanStack Start entry point
├── docker-compose.yml  # Convex backend container
├── package.json
└── vite.config.ts
```
