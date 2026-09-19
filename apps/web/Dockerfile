# ── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contracts/package.json ./packages/contracts/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages/contracts ./packages/contracts
COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @ecms/web run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
