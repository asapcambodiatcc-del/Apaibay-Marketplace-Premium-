# ==============================================================================
# Apaibay Marketplace Premium - Cloud Run & Production Container Dockerfile
# Multi-stage production build for Node.js + Express backend & Vite static assets
# ==============================================================================

FROM oven/bun:1.4.4-alpine AS bun

FROM node:20-alpine AS builder

WORKDIR /app

# Provide pinned Bun binary matching bun.lock for reproducible dependency installs
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Install build dependencies from bun.lock
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy application source code
COPY . .

# Build Vite frontend assets and bundle backend server
RUN npm run build

# ==============================================================================
# Production Runtime Stage
# ==============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Provide pinned Bun binary matching bun.lock for reproducible production installs
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

# Install production dependencies only from bun.lock
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production && rm -rf /root/.bun

# Copy compiled build artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Non-root user for security
USER node

# Cloud Run defaults to container port listening on 0.0.0.0:${PORT}
EXPOSE 3000

# Start server entrypoint (node dist/server.cjs)
CMD ["npm", "start"]
