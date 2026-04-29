# syntax=docker/dockerfile:1.6
# ---- Build stage ---------------------------------------------------------
FROM node:22-bullseye AS build
WORKDIR /app

# Native module deps (better-sqlite3 prebuilds usually cover linux-x64/arm64,
# but keep build-essential available in case prebuild lookup fails).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Strip dev deps so the final image stays small.
RUN npm prune --omit=dev

# ---- Runtime stage -------------------------------------------------------
FROM node:22-bullseye-slim AS runtime
WORKDIR /app

# Only what the runtime needs.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY scripts/seed-hub.mjs scripts/seed-config.example.json ./scripts/
COPY web ./web

# Expose web UI dir to the hub via env (auto-detected, but explicit is clearer)
ENV RTV_WEB_DIR=/app/web

# Hub data lives in a volume (DB + attachments).
ENV RTV_HUB_DIR=/data \
    RTV_HUB_HOST=0.0.0.0 \
    RTV_HUB_PORT=8731 \
    NODE_ENV=production
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8731

# Healthcheck — hits /healthz which now also performs a SQLite SELECT 1 ping
# (Codex 주의급 #12). Fails the container when the DB is unreachable even if
# the HTTP server itself is up.
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.RTV_HUB_PORT||8731) +'/healthz').then(async r=>{const b=await r.json().catch(()=>({}));process.exit(r.ok && b && b.db && b.db.ready?0:1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["hub", "start", "--http"]
