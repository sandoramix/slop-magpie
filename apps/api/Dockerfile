# syntax=docker/dockerfile:1
# Build context: repo root. Runs TypeScript directly (Node strips types), so there is no build step.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@magpie/api..."

FROM base
ENV NODE_ENV=production
COPY --from=deps /app ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/storage packages/storage
COPY apps/api apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# applies pending migrations, then serves
CMD ["node", "apps/api/src/index.ts"]
