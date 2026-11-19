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
#
# `deps` installs for the image's target architecture (the functions image
# ships these node_modules, which include native binaries).
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
# The web app is built once, on the build machine's own architecture, and the
# architecture-independent .output is copied into every image. Building under
# QEMU emulation (arm64 on an amd64 runner) corrupts the output of Nitro's
# native parser and fails the build.
FROM --platform=$BUILDPLATFORM node:26-slim AS builder

WORKDIR /app
RUN npm install -g pnpm@11

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN rm -f .env .env.* apps/web/.env apps/web/.env.* && rm -rf apps/web/.output

# No deployment values are baked in: the server reads them from the
# environment at runtime and embeds them in each page (src/lib/env.ts).
# Built files are never modified afterwards, because Nitro serves them with
# build-time Content-Length/ETag headers.
RUN pnpm --filter devcents build

# -------------------------
# Convex functions deployer
# -------------------------
FROM deps AS functions

COPY deployment/deploy-functions.sh /usr/local/bin/deploy-functions
# The job only runs the project's own convex CLI; drop the global package
# managers so their bundled dependencies don't ship (or show up in scans).
# Apply Debian security updates published after the base image was built.
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/* \
 && chmod 0755 /usr/local/bin/deploy-functions \
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
# node_modules are shipped. It is owned by root and never modified.
COPY --from=builder --chown=root:root /app/apps/web/.output /app/.output
COPY deployment/start.sh /app/
# Only `node` is needed at runtime. The npm/npx/corepack bundled with the
# base image carry their own dependency CVEs, so remove them. Alpine security
# updates published after the base image was built are applied too.
RUN apk upgrade --no-cache \
 && chmod 0755 /app/start.sh \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
          /usr/local/bin/yarn /usr/local/bin/yarnpkg

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/.well-known/oauth-protected-resource || exit 1

CMD ["/app/start.sh"]
