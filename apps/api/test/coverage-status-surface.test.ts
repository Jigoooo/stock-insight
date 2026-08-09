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
const briefingModel = readFileSync(
  new URL('../../web/src/pages/research-workspace/model/reliability-briefing.ts', import.meta.url)
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

test('not-collected coverage becomes a plain user-facing limitation', () => {
  assert.match(briefingModel, /state === 'not_collected' && cells > 0/);
  assert.match(briefingModel, /아직 확인하지 않은 데이터 범위가 있습니다/);
  assert.doesNotMatch(view, /coverage\.map|factFamily|cells/);
});

test('coverage gaps are disclosed without rendering internal reasons or counts', () => {
  assert.match(briefingModel, /status\.coverageGaps\.length > 0/);
  assert.match(briefingModel, /확인하지 못한 데이터 범위가 기록되어 있습니다/);
  assert.doesNotMatch(view, /coverageGaps|reason|cells/);
});
