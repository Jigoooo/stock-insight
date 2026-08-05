# Re-running the analytics pipeline on the same day

`run-v2-graph-publish.ts` claims one slot per KST date:

```
natural_run_key = v2-graph-publish:2026-08-03
```

A second run on the same day finds the claim completed and exits with
`outcome: already_completed`, having done nothing. The wrapper still reports
success — because skipping *is* success for an idempotent job.

That is correct for an accidental double-run. It is wrong when you deliberately
want to re-run after a code fix, and it has a sharp edge: **a manual run consumes
the scheduled run's slot.** If you run the pipeline by hand at 00:08 KST, the
07:47 KST timer fires, finds the slot taken, and no-ops. The next run that does
real work is the following day.

## Use a slot suffix

```bash
cd /home/jigoo/.hermes/workspace/stock-insight
DATABASE_URL=… node apps/api/src/analytics/run-v2-graph-publish.ts --apply --slot-suffix rerun-1
```

Or re-run the whole wrapper — the env form is inherited, so no script forwards it:

```bash
STOCK_INSIGHT_SLOT_SUFFIX=rerun-1 bash apps/api/scripts/run_analytics_pipeline.sh
```

The re-run publishes under `v2-graph-publish:2026-08-03#rerun-1` — its own slot.

- The concurrency guard is untouched. Each key is still claimed exactly once, so
  two runs still cannot double-publish.
- The forced run leaves its own claim row, so "why are there two snapshots today"
  is answerable from the data.
- Suffix format: lowercase alphanumeric plus dashes, ≤32 chars. Validated before
  any connection opens, so a typo fails immediately rather than mid-publish.

`run_analytics_pipeline.sh` matches the claim key by prefix for exactly this
reason; exact equality would make a suffixed run fail its own output readback.

## Do not delete the claim row

Deleting from `ops.pipeline_run_claim` also works, and it is the wrong tool:

- it removes the row that prevents concurrent double-publishing,
- it leaves no record that a re-run was forced or by whom,
- and it frees the *scheduled* slot, so the next timer run does real work you did
  not plan for.

This was done once by hand on 2026-08-03 before the suffix existed. That is the
origin of the third snapshot that day.

## Do not edit the working tree while a run is in flight

`pipeline_resolve_provenance` hashes every git-tracked file at start and again at
finish. If they differ, the completion UPDATE matches no row and the run is
recorded `failed` even though every stage succeeded and the data landed.

The 2026-08-02 15:09 run failed exactly this way: nine stages completed, the
output assertion passed, and the audit row said `wrapper_failed:
wrapper-finish:completed`. The guard was doing its job — a file was edited while
the pipeline ran.

Commit (or stash) before starting a run.

## 2026-08-05: ten snapshots in one day

The contract is one scheduled slot per day, and that day produced **ten**
snapshots (`graph_snapshot_id` 19–28). None of them was a violation: nine were
deliberate `--slot-suffix` re-runs while five changes were measured into the
graph, and the tenth was the scheduled 00:55 KST run.

```
v2-graph-publish:2026-08-05                00:55   scheduled slot
v2-graph-publish:2026-08-05#energy         03:11
v2-graph-publish:2026-08-05#diversity      03:21
v2-graph-publish:2026-08-05#beta           11:11
v2-graph-publish:2026-08-05#retract-1      15:13   retraction shipped
v2-graph-publish:2026-08-05#topic-1        16:49   topic entities (migration 068)
v2-graph-publish:2026-08-05#product-retract-1  18:39
v2-graph-publish:2026-08-05#product-retract-2  18:43
v2-graph-publish:2026-08-05#etf-conf-1     19:30   measured basket confidence
v2-graph-publish:2026-08-05#steps-3        21:09   path steps
```

### Where the suffix is recorded — not on the snapshot

This matters when you are reading back what happened: the snapshot row does not
carry the suffix.

- `analytics.graph_snapshot.builder_version` was `v2-publish:f2ec673:2026-08-05:f1`
  for all ten. It carries the commit and the slot date, not the suffix.
- `metadata` holds only `release_commit` and `writer`.
- The suffix lives in **`ops.pipeline_run_claim.natural_run_key`**, appended as
  `#suffix` (`run-v2-graph-publish.ts` builds `v2-graph-publish:${slot}${SLOT_SUFFIX}`
  and hands it to `ops.claim_pipeline_run`).

So "which change produced snapshot 27" is answered by joining on time against
`pipeline_run_claim`, not by reading the snapshot. That is worth knowing before
you conclude a re-run left no trace.

### Counting them: use KST, not UTC

`as_of` and `created_at` are `timestamptz`, and filtering `as_of >= '2026-08-05'`
compares in UTC — which drops the KST early-morning runs and undercounts the day.
The day's real count came from grouping on
`created_at AT TIME ZONE 'Asia/Seoul'`, and it agrees exactly with the ten claim
rows. An undercount here reads as "the slot contract held" when it did not.
