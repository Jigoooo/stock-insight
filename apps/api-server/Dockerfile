# Draft — not yet built/pushed. P6(컷오버) 전 docker-compose 편입 시 검증 예정.
FROM node:24-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api-server/package.json apps/api-server/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db-schema/package.json packages/db-schema/
RUN pnpm install --frozen-lockfile --filter @stock-insight/api-server...
COPY packages/contracts packages/contracts
COPY packages/db-schema packages/db-schema
COPY apps/api-server apps/api-server
RUN pnpm --filter @stock-insight/api-server build \
  && pnpm --filter @stock-insight/api-server --prod deploy /out

FROM node:24-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=6200
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /repo/apps/api-server/dist /app/dist
EXPOSE 6200
USER node
CMD ["node", "dist/main.js"]
