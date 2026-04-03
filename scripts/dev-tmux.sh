#!/usr/bin/env bash
set -euo pipefail

# ─── DevCents Dev Environment (tmux) ──────────────────────────────────────
# Runs Docker, Convex sync, and Vite in separate tmux panes.
# Ctrl+B then D to detach. `tmux attach -t devcents` to reattach.
# Ctrl+C in any pane stops that service. Ctrl+B then : kill-session to stop all.
# ─────────────────────────────────────────────────────────────────────────────

SESSION="devcents"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="docker-compose.dev.yml"

# ─── Pre-flight ──────────────────────────────────────────────────────────────
for cmd in tmux docker node npm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ Required command '$cmd' not found."
    exit 1
  fi
done

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null || true

# ─── Build env vars ─────────────────────────────────────────────────────────
ENV_SCRIPT="cd $ROOT_DIR"
if [ -f "$ROOT_DIR/.env.local" ]; then
  ENV_SCRIPT="$ENV_SCRIPT && set -a && source .env.local && set +a"
fi
ENV_SCRIPT="$ENV_SCRIPT && export INSTANCE_NAME=\${INSTANCE_NAME:-devcents}"
ENV_SCRIPT="$ENV_SCRIPT && export INSTANCE_SECRET=\${INSTANCE_SECRET:-\$(printf '%s' \"\${USER:-devcents}:\${HOSTNAME:-localhost}:devcents\" | shasum -a 256 | awk '{print \$1}')}"
ENV_SCRIPT="$ENV_SCRIPT && export CONVEX_SELF_HOSTED_URL=\${CONVEX_SELF_HOSTED_URL:-http://127.0.0.1:3210}"

# ─── Create tmux session ────────────────────────────────────────────────────

# Pane 0: Docker + Convex backend
tmux new-session -d -s "$SESSION" -n "dev" \
  "$ENV_SCRIPT && \
   echo -e '\033[0;36m[docker]\033[0m Starting Convex backend...' && \
   docker compose -f $COMPOSE_FILE up -d && \
   echo -e '\033[0;36m[docker]\033[0m Waiting for backend...' && \
   until curl -sf http://127.0.0.1:3210 > /dev/null 2>&1; do sleep 1; done && \
   sleep 3 && \
   echo -e '\033[0;32m[docker]\033[0m Backend ready!' && \
   export CONVEX_SELF_HOSTED_ADMIN_KEY=\$(docker exec devcents-convex-1 ./generate_admin_key.sh 2>/dev/null | grep -v 'Admin key:' | tr -d '[:space:]') && \
   echo -e '\033[0;32m[docker]\033[0m Admin key generated' && \
   docker compose -f $COMPOSE_FILE logs -f; \
   exec bash"

# Pane 1: Convex sync (split horizontal)
tmux split-window -h -t "$SESSION" \
  "$ENV_SCRIPT && \
   echo -e '\033[1;33m[convex]\033[0m Waiting for backend before starting sync...' && \
   until curl -sf http://127.0.0.1:3210 > /dev/null 2>&1; do sleep 1; done && \
   sleep 5 && \
   export CONVEX_SELF_HOSTED_ADMIN_KEY=\$(docker exec devcents-convex-1 ./generate_admin_key.sh 2>/dev/null | grep -v 'Admin key:' | tr -d '[:space:]') && \
   echo -e '\033[0;32m[convex]\033[0m Starting Convex sync...' && \
   npm run convex:local; \
   exec bash"

# Pane 2: Vite dev server (split pane 1 vertically)
tmux split-window -v -t "$SESSION" \
  "$ENV_SCRIPT && \
   echo -e '\033[1;33m[vite]\033[0m Waiting for backend before starting dev server...' && \
   until curl -sf http://127.0.0.1:3210 > /dev/null 2>&1; do sleep 1; done && \
   sleep 7 && \
   echo -e '\033[0;32m[vite]\033[0m Starting Vite dev server...' && \
   npm run dev; \
   exec bash"

# Layout: docker logs on left, convex sync top-right, vite bottom-right
tmux select-layout -t "$SESSION" main-vertical

# Focus the vite pane
tmux select-pane -t "$SESSION:0.2"

# ─── Attach ──────────────────────────────────────────────────────────────────
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║  DevCents dev environment starting...        ║"
echo "  ║                                              ║"
echo "  ║  Pane 0 (left)         → Docker logs         ║"
echo "  ║  Pane 1 (top-right)    → Convex sync         ║"
echo "  ║  Pane 2 (bottom-right) → Vite dev server     ║"
echo "  ║                                              ║"
echo "  ║  Ctrl+B D  → detach                          ║"
echo "  ║  Ctrl+B ←→ → switch panes                    ║"
echo "  ║  tmux attach -t devcents → reattach           ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

tmux attach -t "$SESSION"
