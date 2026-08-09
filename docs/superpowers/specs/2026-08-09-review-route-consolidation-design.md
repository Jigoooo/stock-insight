# Review Route Consolidation Design

## Product decision

- `복기` has one canonical user surface: `/workspace/history` with the page title `판단 복기`.
- `/workspace/research` remains only as a bookmark-compatible route and redirects to the canonical surface before loading workspace data.
- The former `내 리서치` screen is retired instead of being merged into judgment review.
- Portfolio valuation, projected return ranges, concentration deltas, and technical personalization packets are not relocated to another user screen.

## Information ownership

- Judgment records, review schedules, evidence changes, and checkpoints belong to `판단 복기`.
- Holding thesis and stock-specific impact paths remain in the `내 종목` inspector.
- Availability and limitation explanations remain in `데이터 신뢰도`.
- Backend personalization data and public API contracts remain available for later backend work, but no duplicate workspace surface renders them.

## Navigation and compatibility

- The primary workspace journey is `오늘 → 내 종목 → 시장 연결 → 복기` followed by the `데이터 신뢰도` utility item.
- The navigation item uses section id `history`, label `복기`, icon `BookOpen`, and href `/workspace/history`.
- `research` is removed from workspace section, view, cache, search, prefetch, and lazy-render identifiers.
- Direct entry to `/workspace/research` performs a replace redirect to `/workspace/history` in `beforeLoad`, so no research or personalization loader runs.

## Removal boundary

- Remove the legacy `MyResearchView`, its personalization panels and presentation helpers, and UI-only styling/tests that have no remaining consumer.
- Remove the web-only research payload/orchestration branch and BFF loader composition used exclusively by that retired screen.
- Do not remove or change database objects, API-server endpoints, `@stock-insight/contracts`, or API-client personalization methods.

## Verification contract

- Test the canonical primary navigation, pre-loader redirect, absence of the internal research view, and absence of research/personalization requests.
- Replace legacy UI source-contract tests with behavior contracts for the canonical History surface rather than deleting coverage without replacement.
- Regress History inspector behavior and the Today, Stocks, Market Connections, and Status surfaces.
- Verify desktop/mobile browser behavior, full repository gates, release-environment boundaries, and the graph update before completion.
