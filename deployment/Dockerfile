# -------------------------
# Build Stage
# -------------------------
FROM node:24-alpine AS builder

WORKDIR /app

# Copy workspace manifests first so npm can install workspace dependencies.
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

# Copy application source code
COPY . .

# Build the application with placeholders that get replaced at container start.
ARG VITE_CONVEX_URL="__VITE_CONVEX_URL__"
ARG VITE_CLERK_PUBLISHABLE_KEY="__VITE_CLERK_PUBLISHABLE_KEY__"
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build:web

# -------------------------
# Production Stage 
# -------------------------
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built assets and dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.output ./.output

# Copy the startup script
COPY deployment/start.sh ./start.sh
RUN chmod +x ./start.sh

# Expose the port the app runs on (Nitro defaults to 3000)
EXPOSE 3000

# Start the application using our wrapper script to inject env vars
CMD ["./start.sh"]
