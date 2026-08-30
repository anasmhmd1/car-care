# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM deps AS tools
COPY prisma ./prisma
COPY scripts/bootstrap-system-admin.cjs ./scripts/bootstrap-system-admin.cjs
COPY scripts/check-production-env.cjs ./scripts/check-production-env.cjs
COPY prisma.config.ts ./prisma.config.ts
COPY tsconfig.json ./tsconfig.json
# The tools image generates the client during the image build, before the
# runtime database environment is injected by Compose. These values are only
# used to satisfy Prisma's schema/config validation at build time.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build
RUN npx prisma generate
CMD ["npm", "run", "db:migrate:deploy"]

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DIRECT_URL=postgresql://build:build@127.0.0.1:5432/build
ENV SESSION_SECRET=build-only-secret-not-used-at-runtime

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts/check-production-env.cjs ./scripts/check-production-env.cjs

RUN mkdir -p /app/data/uploads && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["sh", "-c", "node scripts/check-production-env.cjs && node server.js"]
