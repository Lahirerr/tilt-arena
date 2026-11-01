# Build from the repo root:  docker build -f apps/server/Dockerfile .
FROM oven/bun:1.4-slim
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
# the web manifest keeps bun.lock in sync; its deps are skipped by --filter
COPY apps/web/package.json ./apps/web/package.json

RUN bun install --production --frozen-lockfile --filter '@tilt/server'

ENV PORT=3001
EXPOSE 3001
CMD ["bun", "apps/server/src/index.ts"]
