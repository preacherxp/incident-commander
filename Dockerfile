# syntax=docker/dockerfile:1

FROM oven/bun:1.4.0 AS builder
WORKDIR /app

COPY package.json bun.lock tsconfig.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile
RUN bun run --filter @incident-commander/web build
RUN bun build apps/api/src/index.ts --target bun --outdir apps/api/dist
RUN bun build packages/db/src/migrate.ts --target bun --outdir packages/db/dist

FROM oven/bun:1.4.0 AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=builder /app/apps/web/dist ./apps/web/dist

USER bun
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/api/dist/index.js"]
