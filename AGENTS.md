# Stock Insight Agent Guide

## Product Intent
- Stock Insight is a read-only personal investment research feed.
- It connects portfolio holdings, market news, themes, company summaries, and trade timing retrospectives.
- It must never present itself as an order/execution product or a buy/sell advisory engine.

## Current Scope
The product surface is read-only. The system behind it is not a mock: it ingests real sources on a timer, derives knowledge and impact paths, and serves them per authenticated user.

- Live: source ingestion (RSS news, OHLCV, DART/SEC filings), knowledge extraction, `analytics.impact_path_v2`, graph communities, content packs, outbox delivery.
- Live: local-account auth (scrypt), invitation-gated signup, per-user RLS scope, admin invitation console.
- Out of scope: broker APIs, order placement, execution flows, buy/sell advice.
- Schema-only (built but not populated): the crypto plane (`crypto_identity`, `crypto_truth`, `crypto_analytics`, `cross_domain`), most of `geo`, the P2 impact/scenario taxonomy, and the P5 shadow-experiment tables. Their UI tabs render empty. Do not assume a table has rows because it exists — check.
- Preserve `docs/stock_info_recommendation_app_design.md` and `docs/futur_insight_mockups.html` as source references.

## Required Language Boundaries
- Safe wording: `관심 후보`, `확인할 리스크`, `매수 당시 조건 복기`, `영향을 줄 수 있는 뉴스`, `테마와 연결된 기업`.
- Avoid wording: `지금 사세요`, `매도하세요`, `목표가`, `손절가`, `익절가`, `내일 오를 종목`, personalized buy/sell instruction.
- When unsure, choose information-providing phrasing over advice phrasing.

## Architecture
Three deployables, pinned by image digest in `.env.docker` and mirrored in `ops/release/production-image-manifest.json`:

- `apps/web` — TanStack Start BFF. Routing, SSR, session cookie. **No database credentials**; reaches data only through the brain, signing a per-request HMAC internal context bound to method and path.
- `apps/api-server` — NestJS/Fastify brain. Owns every SQL path and verifies that context.
- `apps/api` — the brain's read models plus ingestion/backfill/analytics jobs, scheduled by `ops/systemd/user/*`.

`apps/web/src` FSD layers:
- `pages`: route-facing page composition.
- `widgets`: larger UI regions.
- `features`: user interactions and local behavior.
- `entities`: typed domain data and schemas.
- `shared`: UI primitives, motion, schema, theme.

Runtime schema validation lives under `shared/schema` and entity-level schema files. Zod is the default schema library.

`pages/ui-lab` is a dev-only control catalog behind `VITE_ENABLE_UI_LAB`; the route 404s in a release build. It prototypes raw controls before they graduate to `shared/ui`, so some route-style governance rules deliberately skip it.

## Data access rules
- Reads run as `stock_insight_app_reader` inside `BEGIN READ ONLY` with a transaction-local `stock_insight.user_id` GUC. Pipelines run as the `research_app` owner — do not reach for the app roles in a job.
- **Filter by user inside the aggregate, not on the join.** Joining a per-user aggregate view and filtering `user_id` on the join condition lets the planner re-aggregate the whole view once per outer row. That cost 7 s on `/v1/workspace` until `FEED_SQL` was fixed; keep new read models on the same side of that line.
- There is no schema-migration runner or ledger yet. `additiveAppMigrations` is a list; `public.migration_runs` is a pipeline job log despite the name. Answer "is this applied?" against the live database, not the files.
- **"Upstream data has not arrived" is not a conflict.** New tickers reach `public.entities` as soon as ingestion sees them, while their reference data (SEC CIK, company profile) arrives on a slower schedule — and some never resolve. Identity sync defers those rows and reports them; only genuine contradictions fail. A pipeline that hard-fails on a not-yet-resolvable row will eventually stop forever on one bad ticker: `docs/operations/analytics-pipeline-outage-2026-08.md`.

## UI Rules
- Preserve the HTML mockup's information architecture, not its duplicated desktop/mobile implementation.
- Use responsive grid/flex/container query behavior before viewport breakpoint branching.
- Motion must use CSS and the local `motion` boundary only. Do not add provider-based UI or animation runtimes.
- Always support `prefers-reduced-motion`.
- Keep text contained with wrapping, stable dimensions, and explicit scroll areas.

## Performance constraints
The deployment is served from a Cloudflare PoP far from both visitor and origin, so **each extra origin round trip costs roughly 600 ms** — far more than most server work. Consequences:

- Do not add redirect hops to entry paths. Anonymous `/` resolves the session once and goes straight to the final URL.
- Prefer client transitions to `window.location.assign`; a document reload re-fetches and re-hydrates the whole bundle.
- Never strip `Cache-Control` from content-hashed `/assets/` at the edge — the origin already emits the correct `immutable` header.

Measurements and the Cloudflare routing checklist: `docs/operations/edge-and-login-performance.md`.

## Verification
Run the narrowest useful checks first, then the full gate before completion:
- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

`pnpm verify:release` chains the full release gate. It never exercises the real nginx edge or the Cloudflare tunnel, so edge changes need manual verification against the deployed URL.

Playwright is the primary behavior surface for desktop, mobile, reduced-motion, and accessibility smoke coverage. Authenticated specs need `STOCK_INSIGHT_E2E_DATABASE_URL` (a disposable database — a safety gate refuses the live one) plus `STOCK_INSIGHT_E2E_USERNAME` / `_PASSWORD`.

## Graphify
- graphify is installed per developer and writes local outputs under `graphify-out/`.
- Keep `graphify-out/` ignored unless the team explicitly decides to version graph data.
- If graphify hooks are missing, rerun the local graphify setup workflow.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
