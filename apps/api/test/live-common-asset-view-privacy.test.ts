import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import { loadAssetSourceFacts, type QueryClient } from '../src/serving/common-asset-view-store.ts';

// REQ-REC-001 / canonical/10 §2, checked against the planner rather than the source text.
//
// Grepping the builder for "personalization" is not a gate: a query can reach private
// data through a view, a function, or a synonym, and the word never appears. PostgreSQL
// already knows the answer — EXPLAIN expands views down to their base relations — so
// this test asks the database which relations each of the builder's queries actually
// touches, and fails if any of them lives in personalization.
//
// Requires a live read connection. Skipped without one, because a check that silently
// passes when it cannot run is worse than no check.
const databaseUrl = process.env.STOCK_INSIGHT_LIVE_READ_DB_URL ?? process.env.DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : 'STOCK_INSIGHT_LIVE_READ_DB_URL or DATABASE_URL is required';

/** Runs the loader for its SQL, not its rows. Every query comes back empty on purpose. */
function recordingClient(recorded: { text: string; values: unknown[] }[]): QueryClient {
  return {
    query: async (text: string, values?: unknown[]) => {
      recorded.push({ text, values: values ?? [] });
      return { rows: [] };
    },
  } as QueryClient;
}

function relationsIn(plan: unknown, found: Set<string>): void {
  if (Array.isArray(plan)) {
    for (const item of plan) relationsIn(item, found);
    return;
  }
  if (plan && typeof plan === 'object') {
    for (const [key, value] of Object.entries(plan as Record<string, unknown>)) {
      if (key === 'Schema' && typeof value === 'string') found.add(value);
      if (key === 'Relation Name' && typeof value === 'string') found.add(value);
      relationsIn(value, found);
    }
  }
}

describe('common asset view reads no private data', () => {
  it(
    'touches no relation in the personalization schema, view indirection included',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      const recorded: { text: string; values: unknown[] }[] = [];
      await loadAssetSourceFacts(recordingClient(recorded), {
        entityIds: [1],
        asOfDate: '2026-08-10',
        releaseId: 'test',
        semanticSnapshotId: 'test',
      });
      assert.ok(
        recorded.length >= 15,
        `expected the loader to issue its full query set, saw ${recorded.length}`,
      );

      const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
      const client = await pool.connect();
      try {
        // Read-only for the whole check: a planner bug that turned one of these into
        // a write must not be able to write while proving it does not read.
        await client.query('BEGIN READ ONLY');
        const schemas = new Set<string>();
        for (const { text, values } of recorded) {
          const { rows } = await client.query<{ ['QUERY PLAN']: unknown }>(
            `EXPLAIN (FORMAT JSON, VERBOSE, COSTS OFF) ${text}`,
            values,
          );
          relationsIn(rows[0]?.['QUERY PLAN'], schemas);
        }
        await client.query('ROLLBACK');

        const leaked = [...schemas].filter((name) => name.includes('personalization'));
        assert.deepEqual(
          leaked,
          [],
          `common asset view reached private data through ${leaked.join(', ')}`,
        );
        // Proves the check had something to look at. An empty relation set would make
        // the assertion above pass for the wrong reason.
        assert.ok(
          schemas.size > 5,
          `expected the plans to name real relations, saw ${[...schemas].join(', ')}`,
        );
      } finally {
        client.release();
        await pool.end();
      }
    },
  );
});
