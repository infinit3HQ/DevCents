# syntax=docker/dockerfile:1.7
#
# Targets:
#   web        (default) the DevCents web app. Configured entirely at runtime,
#              so one published image works for every deployment.
#   functions  one-shot job that pushes the Convex functions and env vars to
#              your Convex backend, then exits.

# -------------------------
# Dependencies + source
# -------------------------
# Build on glibc (Debian slim). On Alpine/musl the small default thread stack
# makes Rollup's native parser fail with "Code is nested too deeply" on
# react-dom 19.3. The runtime image below stays on Alpine: the Nitro output
# has no native modules.
FROM node:26-slim AS deps

WORKDIR /app
RUN npm install -g pnpm@11

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN rm -f .env .env.* apps/web/.env apps/web/.env.* && rm -rf apps/web/.output

# -------------------------
# Build
# -------------------------
FROM deps AS builder

# Public settings are baked in as placeholders and replaced when the container
# starts (deployment/start.sh). Passing real values here still works for
# private single-purpose builds.
ARG VITE_CONVEX_URL=__VITE_CONVEX_URL__
ARG VITE_CLERK_PUBLISHABLE_KEY=__VITE_CLERK_PUBLISHABLE_KEY__
RUN printf 'VITE_CONVEX_URL=%s\nVITE_CLERK_PUBLISHABLE_KEY=%s\n' \
      "$VITE_CONVEX_URL" "$VITE_CLERK_PUBLISHABLE_KEY" > apps/web/.env.production \
 && pnpm --filter devcents build

# -------------------------
# Convex functions deployer
# -------------------------
FROM deps AS functions

COPY deployment/deploy-functions.sh /usr/local/bin/deploy-functions
# The job only runs the project's own convex CLI; drop the global package
# managers so their bundled dependencies don't ship (or show up in scans).
RUN chmod 0755 /usr/local/bin/deploy-functions \
 && chown -R node:node /app/apps/web \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/lib/node_modules/pnpm /root/.npm /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
          /usr/local/bin/pnpm /usr/local/bin/pnpx
USER node
WORKDIR /app/apps/web
ENTRYPOINT ["/usr/local/bin/deploy-functions"]

# -------------------------
# Web runtime
# -------------------------
FROM node:26-alpine AS web

LABEL org.opencontainers.image.title="DevCents" \
      org.opencontainers.image.description="Self-hosted, privacy-first personal finance" \
      org.opencontainers.image.source="https://github.com/infinit3HQ/DevCents" \
      org.opencontainers.image.licenses="AGPL-3.0-only"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# Nitro's .output is self-contained (server dependencies are bundled), so no
# node_modules are shipped. The pristine build is kept read-only as a template;
# start.sh copies it and fills in the runtime settings.
COPY --from=builder --chown=root:root /app/apps/web/.output /app/.output-template
COPY deployment/start.sh deployment/inject_env.js /app/
# Only `node` is needed at runtime. The npm/npx/corepack bundled with the
# base image carry their own dependency CVEs, so remove them.
RUN chmod 0755 /app/start.sh \
 && mkdir -p /app/.output \
 && chown node:node /app/.output \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
          /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/.well-known/oauth-protected-resource || exit 1

CMD ["/app/start.sh"]
