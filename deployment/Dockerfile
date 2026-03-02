# -------------------------
# Build Stage
# -------------------------
FROM node:latest AS builder

WORKDIR /app

# Enable corepack for pnpm if needed, or just use npm
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# Copy application source code
COPY . .

# Build the application
# We need to provide dummy env variables during build if Vite requires them
ARG VITE_CONVEX_URL="http://127.0.0.1:3210"
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build

# -------------------------
# Production Stage 
# -------------------------
FROM node:latest AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built assets and dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.output ./.output

# Copy the startup script
COPY deployment/start.sh ./start.sh
RUN chmod +x ./start.sh

# Expose the port the app runs on (Nitro defaults to 3000)
EXPOSE 3000

# Start the application using our wrapper script to inject env vars
CMD ["./start.sh"]
