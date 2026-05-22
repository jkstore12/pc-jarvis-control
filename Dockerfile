FROM node:22-alpine AS app

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/agent/package.json apps/agent/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

ENV NODE_ENV=production
ENV PORT=4000
ENV STATIC_WEB_DIR=/app/apps/web/dist

EXPOSE 4000

CMD ["node", "apps/server/dist/index.js"]
