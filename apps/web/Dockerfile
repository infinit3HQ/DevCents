FROM node:20-alpine AS builder

WORKDIR /app

# Copy the entire monorepo
COPY . .

# Clean install dependencies
RUN npm ci

ARG VITE_CONVEX_URL
ARG VITE_CLERK_PUBLISHABLE_KEY

ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Build the web application
RUN npm run build:web

# Runner Stage
FROM node:20-alpine AS runner
WORKDIR /app

# Copy the built nitro output from the web workspace
COPY --from=builder /app/apps/web/.output ./.output

ENV PORT=3000
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
