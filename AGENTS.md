# Futur Insight Agent Guide

## Product Intent
- Futur Insight is a mock, read-only personal investment research feed.
- It connects portfolio holdings, market news, themes, company summaries, and trade timing retrospectives.
- It must never present itself as an order/execution product or a buy/sell advisory engine.

## Current Scope
- This repository currently ships a TanStack Start SPA-first mock shell.
- Data is static mock data parsed through Zod schemas.
- Broker APIs, authentication, real Hermes jobs, database persistence, and trading/order flows are out of scope.
- Preserve `docs/stock_info_recommendation_app_design.md` and `docs/futur_insight_mockups.html` as source references.

## Required Language Boundaries
- Safe wording: `관심 후보`, `확인할 리스크`, `매수 당시 조건 복기`, `영향을 줄 수 있는 뉴스`, `테마와 연결된 기업`.
- Avoid wording: `지금 사세요`, `매도하세요`, `목표가`, `손절가`, `익절가`, `내일 오를 종목`, personalized buy/sell instruction.
- When unsure, choose information-providing phrasing over advice phrasing.

## Architecture
- Framework: TanStack Start with SPA-first usage.
- FSD layers:
  - `pages`: route-facing page composition.
  - `widgets`: larger UI regions.
  - `features`: user interactions and local behavior.
  - `entities`: typed domain data and schemas.
  - `shared`: UI primitives, motion, schema, theme.
- Runtime schema validation lives under `shared/schema` and entity-level schema files.
- Zod is the default schema library. Keep schema usage behind local module boundaries where practical.

## UI Rules
- Preserve the HTML mockup's information architecture, not its duplicated desktop/mobile implementation.
- Use responsive grid/flex/container query behavior before viewport breakpoint branching.
- Motion must use CSS and GSAP only. Do not add animation/UI libraries for motion.
- Always support `prefers-reduced-motion`.
- Keep text contained with wrapping, stable dimensions, and explicit scroll areas.

## Verification
- Run the narrowest useful checks first, then the full gate before completion:
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm test:e2e`
  - `git diff --check`
- Playwright is the primary behavior surface for desktop, mobile, reduced-motion, and accessibility smoke coverage.

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
