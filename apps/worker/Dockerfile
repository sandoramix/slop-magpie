# syntax=docker/dockerfile:1
# Build context: repo root. Runs TypeScript directly (Node strips types), so there is no build step.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@magpie/worker..."

FROM base
ENV NODE_ENV=production PATH=/opt/tools/bin:$PATH
# yt-dlp / gallery-dl are external CLIs (Python lives only here); rebuild the image to update them
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && python3 -m venv /opt/tools \
 && /opt/tools/bin/pip install --no-cache-dir --upgrade yt-dlp gallery-dl
COPY --from=deps /app ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/storage packages/storage
COPY apps/worker apps/worker
USER node
CMD ["node", "apps/worker/src/index.ts"]
