# Impact planes: v1 is internal, v2 serves

Two impact planes exist. Only one reaches the product.

| | v1 | v2 |
| --- | --- | --- |
| producer | `run-graph-inference.ts` | `run-v2-analytics-publish.ts` |
| paths | `analytics.impact_path` | `analytics.impact_path_v2` |
| edges | `path_edges BIGINT[]`, no FK | `analytics.impact_path_step`, FK per step |
| serving | `serving.impact_summary_v1` | `serving.content_pack` kind `impact_brief` |
| status | **internal analysis only** | **servable** |

## Why v1 cannot serve

`serving.impact_summary_v1` requires every edge of a path to resolve through
`serving.relation_current_v1`. Measured on 2026-08-02:

```
serving.relation_current_v1 predicates →  ISSUED_BY 254   (all of them)
analytics.impact_path predicates       →  SAME_THEME 275, SAME_INDUSTRY 101,
                                          PEER_OF 31, SUPPLY_CHAIN 30,
                                          OWNS 10, EXPOSES 7
```

Two narrowings produce that:

1. `relation_current_v1` only exposes revisions whose status is `accepted`, which
   requires either a **verified claim** or **identity_mapping** evidence. All 256
   rows of `knowledge.claim` are `unverified` — nothing in production calls
   `transitionVerification()` — so the verified-claim route is dead.
2. The surviving `identity_mapping` evidence comes from
   `core.security_issuer_identity` ("this security was issued by this company"),
   which attaches to the `ISSUED_BY` predicate alone.

`RELATION_PREDICATES` in `run-graph-inference.ts` does not include `ISSUED_BY`.
The intersection is empty **by construction**, not by data volume: 44,658 paths or
a million, the yield stays 0.

This has been true since `f26f5aa` (migration 023) on 2026-07-19. Migration 018
had introduced an evidence requirement whose id space roughly matched; 023
replaced it the same day with a stricter one and nothing cross-checked the new
requirement against the producer's predicate list.

## Why it went unnoticed for two weeks

Both safety nets were reading the old formula, so both stayed green:

- `graph-evidence-gate.test.ts` regex-matched migration **018's source file**. It
  never learned that 023 replaced the view.
- `backend-db-gates.json`'s `b0-sourceless-impact-exposure-zero` recomputed its
  expected value with 018's formula while the live view used 023's. Both sides
  evaluated to 0, so `abs(diff) == 0` passed.
- The analytics pipeline's own health assertion checks that
  `analytics.impact_path_v2` has sealed rows. It never looks at
  `impact_summary_v1`.

The general lesson: a gate that reconstructs the expected value from a formula
verifies the formula, not the system. Assert against the live surface.

## The gate is not being relaxed

Widening `impact_summary_v1` would expose paths that genuinely have no evidence
backing — sourceless impact claims, against the read-only truth contract. Returning
0 is the truth gate working correctly. What was wrong was leaving it undeclared
while a nightly job filled a table nobody could serve.

Migration 055 records this on the objects themselves (`COMMENT ON VIEW` /
`COMMENT ON TABLE`) so it is visible to anyone inspecting the schema.

## The servable plane

`run-v2-analytics-publish.ts` seals `analytics.impact_path_v2` rows — each with
`analytics.impact_path_step` rows carrying real foreign keys into
`analytics.graph_snapshot_edge` — and then publishes them as content packs of kind
`impact_brief`, one per target holding.

Content packs are digest-sealed and immutable once published (migration 026's
`guard_content_pack_write`), so this publisher cannot append to the relation packs
that `run-v2-graph-publish.ts` produced earlier in the same pipeline. It publishes
its own packs. Both go through `publishContentPacks`
(`apps/api/src/relations/content-pack-publisher.ts`), where `packKind` is a
required parameter — the supersede step retires previously published packs, and a
hardcoded kind would have each publisher retire the other's output.

Measured after the first run that included it (2026-08-02, snapshot 9):

```
sealed impact paths      1,719
impact_brief packs         125
impact_path pack items   1,719   (was 0)
entity_relation_graph      317   (unchanged — supersede stayed in its own lane)
```

## Still open

`serving.market_confirmation_v1` LEFT JOINs `impact_summary_v1`, so it emits 253
rows of which **0** carry an impact link. Repointing the product's impact surface
at the v2 packs is separate work; until then the v2 plane is published and
servable but not yet rendered.
