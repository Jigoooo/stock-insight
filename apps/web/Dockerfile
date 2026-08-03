# web production image.
#
# Shaped after apps/api-server/Dockerfile, which already did this correctly. The
# previous three-line build stage was:
#
#   COPY . .
#   RUN pnpm install --frozen-lockfile
#   RUN pnpm build
#
# and cost about 20 minutes on every deploy for three reasons:
#
#   1. COPY . . sits before the install, so editing any file in the repo — a
#      script, a doc — invalidated the install and build layers. The install layer
#      never survived a commit.
#   2. No --filter, so all 8 workspace packages' dependencies were installed,
#      including the root devDependency @playwright/test, whose postinstall
#      downloads Chromium, Firefox and WebKit binaries.
#   3. `pnpm build` is `turbo run build`, which builds all 7 build targets. The web
#      image was building api, api-server, db-schema and ui as well.
#
# web depends on @stock-insight/api-client and @stock-insight/contracts, so
# `--filter @stock-insight/web...` resolves to three packages. packages/ui is a
# fourth input that no dependency graph shows: apps/web/tsconfig.app.json lists it
# under "references", so `tsc -b` needs its sources even though package.json never
# declares it. Leaving it out fails the build with TS6053, not a missing import.
#
# apps/web/tsconfig.base.json also maps @stock-insight/api to ../api/src/index.ts,
# but nothing resolves through it — that mapping is stale and needs no copy.

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /repo

FROM base AS build
# Manifests only, so the install layer is reused whenever the lockfile is
# unchanged — which is every deploy that does not add a dependency.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/
# The filter should already exclude the root devDependencies that pull Playwright
# in; this makes a browser download impossible rather than merely unlikely.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile \
      --filter @stock-insight/web... --filter @stock-insight/ui

COPY packages/contracts packages/contracts
COPY packages/api-client packages/api-client
COPY packages/ui packages/ui
COPY apps/web apps/web
# pnpm runs recursive scripts in topological order, so contracts and api-client
# build before web's `tsc -b && vite build` needs their output.
RUN pnpm --filter @stock-insight/web... run build

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app

COPY --chown=node:node --from=build /repo/apps/web/.output ./.output

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
