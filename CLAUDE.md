# Stock Insight Claude Guide

## Purpose
Stock Insight is a read-only personal investment research feed. It explains connections between holdings, market issues, themes, and company context. It is not a trading, order, or buy/sell advisory app.

The product surface stays read-only. The system behind it does not: it ingests real sources, derives knowledge and impact paths, and serves them per authenticated user.

## Boundaries
- Read-only product contract: no broker API calls, no order placement, no execution flows.
- Use information-providing language. Avoid direct buy/sell, target price, stop-loss, take-profit, or "tomorrow will rise" wording.
- Keep original planning and mockup references in `docs/` intact (`docs/stock_info_recommendation_app_design.md`, `docs/futur_insight_mockups.html`).
- Credentials, DB URLs and image pins live in gitignored `.env` / `.env.docker`. Never commit them, and never widen `.gitignore` to expose them.

## Architecture
Three deployables, pinned by image digest:

- `apps/web` (`@stock-insight/web`) — TanStack Start BFF. Owns routing, SSR and the session cookie. Holds **no** database credentials; reaches data only through the brain over `STOCK_INSIGHT_BRAIN_URL`, signing a per-request HMAC internal context.
- `apps/api-server` (`@stock-insight/api-server`) — NestJS/Fastify "brain". Owns every SQL path, verifies the internal context, and binds the caller's scope per transaction.
- `apps/api` (`@stock-insight/api`) — the brain's read models, ingestion, backfill and analytics jobs. Run on a timer by `ops/systemd/user/*`, not by the request path.
- `deploy/stock-edge` — nginx ingress for `stock.jigooo.com` and `insight-api.jigooo.com`, behind a Cloudflare tunnel owned by a separate repo.

Shared packages: `@stock-insight/contracts` (API + internal-context contracts), `db-schema` (54 additive migrations), `api-client`, `ui`.

`apps/web/src` follows FSD: `pages` (route-facing composition), `widgets`, `features`, `entities`, `shared`.

## Auth and data
- Local accounts with scrypt password records. The BFF never sees a password record — the brain owns every scrypt primitive.
- Signup is invitation-gated through a SECURITY DEFINER consume-and-create function.
- Reads run as `stock_insight_app_reader` under `BEGIN READ ONLY` with a transaction-local user GUC; pipelines run as the `research_app` owner.
- Session cookie is `__Host-` prefixed and credential-bound: rotating a password invalidates previously issued sessions.

## Tooling
- Runtime validation uses Zod through `shared/schema`.
- Motion uses CSS and the repository-local `motion` component boundary only.
- Lint/format follow Oxlint/Oxfmt, modeled after `hidden-spot`.
- Playwright covers desktop, mobile, reduced-motion, and interaction smoke tests. Authenticated specs need `STOCK_INSIGHT_E2E_DATABASE_URL` (a disposable DB — a safety gate refuses the live one) plus `STOCK_INSIGHT_E2E_USERNAME` / `_PASSWORD`.

## Verification Commands
```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm verify:release` chains the full release gate. It does **not** exercise the real nginx edge or the Cloudflare tunnel — edge changes need manual verification against the deployed URL.

## Performance notes
This deployment is served from a Cloudflare PoP far from both the visitor and the origin, so **every extra origin round trip costs roughly 600 ms**. Two rules follow:

- Do not add redirect hops to entry paths, and prefer client transitions over `window.location.assign`.
- Do not let route styles or the edge strip `Cache-Control` from content-hashed `/assets/`.

See `docs/architecture/operations/edge-and-login-performance.md` for the measurements and the Cloudflare routing checklist.

## Graphify
graphify project hooks may be installed locally for Claude and Codex. Generated graph files stay in `graphify-out/` and are ignored by git.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
