# ==============================================================================
# Apaibay Marketplace Premium - Cloud Run & Production Container Dockerfile
# Multi-stage production build for Node.js + Express backend & Vite static assets
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json bun.lock* package-lock.json* ./
RUN npm install

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

# Install production dependencies only
COPY package.json bun.lock* package-lock.json* ./
RUN npm install --omit=dev

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
