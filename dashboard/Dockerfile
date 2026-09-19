# ── Stage 1: build React + Vite app ──────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build/ui

# Install deps with layer caching
COPY ui/package.json ./
RUN npm install --frozen-lockfile

# Copy all UI source files
COPY ui/ ./

# Build — vite.config.js sets outDir: '../public' → output at /build/public
RUN npx vite build

# ── Stage 2: production Node server ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy the API proxy server
COPY server.js ./

# Copy the compiled React app
COPY --from=builder /build/public ./public

EXPOSE 8080

CMD ["node", "server.js"]
