# ── Stage 1: Install dependencies (includes native module compilation) ──────
FROM node:20-alpine AS deps

# Build tools needed to compile better-sqlite3 native addon
RUN apk add --no-cache python3 make g++ linux-headers

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# ── Stage 2: Build Next.js ───────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
# Copy installed node_modules (including compiled native addons)
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Production runtime ──────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user to run the app
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy Next.js build output
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/next.config.js ./next.config.js
COPY --from=builder --chown=nextjs:nodejs /app/package.json  ./package.json

# Copy node_modules (needed for better-sqlite3 native addon and next start)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules ./node_modules

# Create data directory (SQLite DB lives here, mounted as a volume)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node_modules/.bin/next", "start"]
