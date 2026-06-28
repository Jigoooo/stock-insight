# Futur Insight Claude Guide

## Purpose
Futur Insight is a TanStack Start SPA-first mock for a read-only personal investment research feed. It explains connections between holdings, market issues, themes, and company context. It is not a trading, order, or buy/sell advisory app.

## Boundaries
- Do not add broker API calls, login, database persistence, Hermes workers, or real-time market integrations unless explicitly requested.
- Keep original planning and mockup references in `docs/` intact.
- Use information-providing language. Avoid direct buy/sell, target price, stop-loss, take-profit, or "tomorrow will rise" wording.

## Code Structure
- `pages`: route-facing page composition.
- `widgets`: large screen regions and composed UI.
- `features`: search, navigation, selection, and local interaction behavior.
- `entities`: stock, insight, theme, and portfolio mock data plus schemas.
- `shared`: theme, motion, schema, and UI primitives.

## Tooling
- Runtime validation uses Zod through `shared/schema`.
- Motion uses CSS and GSAP only.
- Lint/format follow Oxlint/Oxfmt, modeled after `hidden-spot`.
- Playwright covers desktop, mobile, reduced-motion, and interaction smoke tests.

## Verification Commands
```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test:e2e
git diff --check
```

## Graphify
graphify project hooks may be installed locally for Claude and Codex. Generated graph files stay in `graphify-out/` and are ignored by git.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
