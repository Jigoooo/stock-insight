# api-server production image (SET A cutover).
FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api-server/package.json apps/api-server/
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db-schema/package.json packages/db-schema/
RUN pnpm install --frozen-lockfile --filter @stock-insight/api-server...
COPY packages/contracts packages/contracts
COPY packages/db-schema packages/db-schema
COPY apps/api apps/api
COPY apps/api-server apps/api-server
RUN pnpm --filter @stock-insight/api-server build \
  && pnpm --filter @stock-insight/api-server --prod deploy --legacy /out

FROM node:24-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=6200
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /repo/apps/api-server/dist /app/dist
EXPOSE 6200
USER node
CMD ["node", "dist/main.js"]
