# DevCents Deployment Guide

This directory contains everything you need to run DevCents (Application + Convex Backend) in a production-ready Docker environment.

We have heavily streamlined the process so you do not need to fight with build-time environment variables or node setups. A single `docker-compose.yml` orchestrates both the frontend server and the persistent Convex backend.

## Prerequisites

1.  **Docker** installed on your machine or server.
2.  **Docker Compose** installed (usually comes bundled with Docker Desktop or Docker Engine).

## Quick Start

### 1. Configure Environment Variables

Create a `.env` file in this `deployment/` directory. You can copy the variables from your local `.env.local` file.

```bash
cd deployment
touch .env
```

Populate the `.env` file with your Clerk and Convex keys. It should look like this:

```env
# Convex connection (Default works for the bundled docker-compose backend)
VITE_CONVEX_URL=http://localhost:3210

# Clerk Authentication Keys (Get these from your Clerk dashboard)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_ISSUER_URL=https://...

# Convex Backend Configuration
# Your secure admin key. Change this for production!
CONVEX_SELF_HOSTED_ADMIN_KEY=your_secure_admin_key_here
INSTANCE_NAME=devcents
```

### 2. Startup the Stack

Run the following command from the `deployment/` directory to build the DevCents frontend and start both containers in the background:

```bash
docker-compose up -d --build
```

### 3. Access the Application

- **DevCents Frontend:** `http://localhost:3000`
- **Convex Backend API:** `http://localhost:3210`
- **Convex Dashboard:** `http://localhost:3211`

---

## Technical Details (How It Works)

### Dynamic Environment Variables

One common challenge with Dockerizing modern Single Page Applications (SPAs) or Vite-built SSR apps is that they often strictly bake environment variables (like `VITE_CONVEX_URL`) into the static JS bundles _during the image build step_. This is frustrating because the same Docker image cannot be reused across different environments (Staging vs Production) without a full rebuild.

To solve this, our setup does two things:

1.  **Builds with Defaults:** The `Dockerfile` injects placeholder values during the Vite build.
2.  **Runtime Injection:** The `start.sh` script runs before the Node server starts. It reads the real environment variables passed by `docker-compose.yml` (which reads from your `.env` file) and dynamically updates the necessary configurations right before serving the app.

### Data Persistence (No Data Loss)

Your Convex backend data is entirely safe between updates. The `docker-compose.yml` mounts a persistent Docker volume (`convex-data: /var/lib/convex/storage`) where your SQLite database lives.

When you pull a new image of the application or the Convex backend, Docker simply stops the old container, attaches the existing volume to the new container, and starts it up. **Your accounts, transactions, and user data will persist seamlessly.**

### Updating

To apply application updates (like pulling new code from GitHub):

```bash
docker-compose up -d --build
```

This forces a rebuild of the `devcents-app` image with your latest source code while leaving the Convex backend (and its data) completely untouched.
