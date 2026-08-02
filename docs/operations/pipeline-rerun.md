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
