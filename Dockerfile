# SecondBrain: один процесс — API + собранный фронт.
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

WORKDIR /app

# сначала только манифесты — слой зависимостей кешируется
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @sb/web build && pnpm --filter @sb/api build

ENV NODE_ENV=production \
    SERVE_WEB=1 \
    API_HOST=0.0.0.0 \
    API_PORT=4010
EXPOSE 4010

# миграции идемпотентны — можно перезапускать сколько угодно
CMD ["sh", "-c", "node apps/api/dist/migrate.js && node apps/api/dist/index.js"]
