import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import pg from 'pg';

import { getCommonAssetView } from '../src/serving/common-asset-view-read-model.ts';

// The K7 read path had no executable coverage when it landed.
//
// Measured 2026-08-11: `getCommonAssetView` was referenced in exactly three places —
// its own definition, the `apps/api/src/index.ts` export, and the `briefing-v2.ts`
// wiring. No test imported it. `workspace-briefing-v2.test.ts` swaps the dependency for
// a stub, so not one line of the read model ran in any gate, and
// `test:read-surface:db` — the gate whose name says common asset view — runs
// `live-common-asset-view-privacy.test.ts`, which EXPLAINs `loadAssetSourceFacts`, the
// BUILDER store. The two files describe different halves of the same table and only the
// builder half was watched.
//
// What went unexercised matters more than the count. `COMMON_ASSET_VIEW_SQL` picks the
// packet with a per-subject `ORDER BY as_of_date DESC, revision_no DESC LIMIT 1`, and
// that clause is the only thing standing between the caller and a 24-block response:
// `serving.common_asset_view_current_v1` is `DISTINCT ON (subject_entity_id,
// as_of_date)`, so a subject rebuilt on two days survives twice. Delete the clause and
// `blocks.length(12)` throws — at request time, in production, with nothing red in CI.
//
// So this file runs the real function against the real database. Three assertions, each
// covering a failure that a stub cannot see.
const databaseUrl = process.env.STOCK_INSIGHT_LIVE_READ_DB_URL ?? process.env.DATABASE_URL;
const skipReason = databaseUrl
  ? false
  : 'STOCK_INSIGHT_LIVE_READ_DB_URL or DATABASE_URL is required';

/** The narrow half of ReadSnapshotConnection the read model actually uses. */
function executorFor(client: pg.PoolClient) {
  return {
    queryRows: async <Row>(text: string, values?: readonly unknown[]): Promise<Row[]> => {
      const result = await client.query(text, values ? [...values] : undefined);
      return result.rows as Row[];
    },
  };
}

async function withExecutor<T>(
  url: string,
  work: (executor: ReturnType<typeof executorFor>) => Promise<T>,
): Promise<T> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const client = await pool.connect();
    try {
      // Read-only and rolled back: this test never changes what it measures.
      await client.query('BEGIN READ ONLY');
      const result = await work(executorFor(client));
      await client.query('ROLLBACK');
      return result;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

describe('the common asset view read path answers from the live database', () => {
  it('returns exactly twelve blocks for a covered subject', { skip: skipReason }, async () => {
    assert.ok(databaseUrl);
    const response = await withExecutor(databaseUrl, (executor) =>
      // 005930 is the best-covered subject in the universe, so a thin packet here means
      // the query is wrong rather than the data being sparse.
      getCommonAssetView(executor, { entityKey: 'KR:005930' }),
    );

    assert.equal(response.availability, 'available');
    assert.ok(response.packet);
    // Twelve is canonical/06 §2's block count, not a magic number. The contract pins it
    // with `.length(12)`, so a duplicate packet surfaces here as a parse failure.
    assert.equal(response.packet.blocks.length, 12);
    assert.deepEqual(
      response.packet.blocks.map((block) => block.blockNo),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  });

  it(
    'picks the newest packet for the subject, not the highest revision',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      // The two orderings disagree in live data and that is the whole point: 005930 has a
      // 2026-08-10 packet at revision 7 and a 2026-08-11 packet at revision 2. Ordering by
      // revision alone returns yesterday's answer with today's confidence.
      const { response, newest } = await withExecutor(databaseUrl, async (executor) => {
        const rows = await executor.queryRows<{ as_of_date: string }>(
          `SELECT max(view.as_of_date)::text AS as_of_date
             FROM serving.common_asset_view_current_v1 view
             JOIN core.entity_identifier identifier
               ON identifier.entity_id = view.subject_entity_id
              AND identifier.identifier_type = 'INTERNAL_KEY'
              AND identifier.identifier_value = $1`,
          ['KR:005930'],
        );
        return {
          response: await getCommonAssetView(executor, { entityKey: 'KR:005930' }),
          newest: rows[0]?.as_of_date,
        };
      });

      assert.ok(newest, 'expected at least one packet for KR:005930');
      assert.ok(response.packet);
      assert.equal(response.packet.asOfDate, newest);
    },
  );

  it(
    'reports a subject with no packet as missing rather than failing',
    { skip: skipReason },
    async () => {
      assert.ok(databaseUrl);
      // Measured 2026-08-11: 77 entities pass the controller's key format and carry no
      // packet, because the builder covers 297 of a larger universe. Absence there is the
      // normal state, and `briefing-v2` deliberately leaves `partialFailures` empty for it
      // — promoting that normality to a fault would make the screen report a partial
      // failure on every uncovered asset. This asserts the shape that behaviour rests on.
      const response = await withExecutor(databaseUrl, (executor) =>
        getCommonAssetView(executor, { entityKey: 'KR:__no_such_entity__' }),
      );

      assert.equal(response.availability, 'missing');
      assert.equal(response.packet, null);
    },
  );
});
