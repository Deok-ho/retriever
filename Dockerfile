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

# Hub data lives in a volume (DB + attachments).
ENV RTV_HUB_DIR=/data \
    RTV_HUB_HOST=0.0.0.0 \
    RTV_HUB_PORT=8731 \
    NODE_ENV=production
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8731

# Lightweight healthcheck — hits /healthz on the hub HTTP endpoint.
HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.RTV_HUB_PORT||8731) +'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["hub", "start", "--http"]
