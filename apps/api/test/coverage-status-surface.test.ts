import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getSystemStatus, type SystemStatusQueryExecutor } from '../src/status/read-model.ts';

// governance.coverage_ledger held 3,640 cells with no reader outside the ops
// collector. Its whole purpose is the distinction nothing else in the system can
// express: "there is nothing here" versus "we never looked".

const view = readFileSync(
  new URL('../../web/src/pages/research-workspace/ui/views/status-view.tsx', import.meta.url)
    .pathname,
  'utf8',
);

function executorWith(coverage: unknown[], gaps: unknown[]): SystemStatusQueryExecutor {
  return {
    async queryRows(sql) {
      if (sql.includes('governance.coverage_ledger') && sql.includes('gap_reason'))
        return gaps as never;
      if (sql.includes('governance.coverage_ledger')) return coverage as never;
      if (sql.includes('migration_runs')) return [];
      if (sql.includes('dataset_watermark')) return [];
      return [{ total: 0, linked: 0, clickable: 0 }] as never;
    },
  };
}

test('coverage states reach the contract', async () => {
  const status = await getSystemStatus(
    executorWith(
      [
        { fact_family: 'market.financial_fact', state: 'not_collected', cells: '1862' },
        { fact_family: 'market.financial_fact', state: 'complete', cells: '1397' },
      ],
      [],
    ),
  );
  assert.equal(status.coverage.length, 2);
  assert.equal(status.coverage[0]?.cells, 1862);
});

test('an unknown coverage state fails instead of rendering as something else', async () => {
  // The table CHECKs the set, so an unknown value means the ledger schema moved.
  await assert.rejects(
    () => getSystemStatus(executorWith([{ fact_family: 'x', state: 'weird', cells: '1' }], [])),
    /unknown coverage state/,
  );
});

test('gap reasons travel with the counts', async () => {
  // "the collector has not got there yet" and "the source says there is no filing"
  // are the same number and completely different problems.
  const status = await getSystemStatus(
    executorWith(
      [],
      [
        {
          fact_family: 'market.financial_fact',
          reason: 'The collector cursor has not reached this issuer yet.',
          cells: '1857',
        },
      ],
    ),
  );
  assert.equal(status.coverageGaps[0]?.cells, 1857);
  assert.match(status.coverageGaps[0]?.reason ?? '', /cursor has not reached/);
});

test('the screen says not-collected means ignorance, not absence', () => {
  // A bare count under a "coverage" heading reads as "there is nothing there",
  // which is the opposite of what the ledger records.
  assert.match(view, /아직 보지 않은 칸/);
  assert.match(view, /자료가 없다는 뜻이 아니라 아직 확인하지 못했다는 뜻입니다/);
  assert.match(view, /not_collected: '아직 보지 않음'/);
});

test('the reason table is rendered, not just the totals', () => {
  assert.match(view, /확인하지 못한 이유/);
  assert.match(view, /data\.coverageGaps\.map/);
});
