import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { appendShadowExperimentArtifact } from '../src/experimental/shadow-artifact-writer.ts';

const input = {
  run: {
    runKey: '11111111-1111-4111-8111-111111111111',
    experimentKind: 'pathsim',
    executionMode: 'shadow',
    terminalStatus: 'completed',
    graphSnapshotId: 42,
    dataCutoff: '2026-07-23T00:00:00.000Z',
    knownAt: '2026-07-23T01:00:00.000Z',
    modelVersion: 'pathsim-v1',
    baselineVersion: 'eventrag-v1',
    inputDigest: 'a'.repeat(64),
    modelArtifactDigest: null,
    configuration: { maxDepth: 2 },
    completedAt: '2026-07-23T02:00:00.000Z',
  },
  candidates: [
    {
      candidateKind: 'entity',
      candidateKey: 'entity:7',
      methodKind: 'pathsim',
      eventRevisionId: null,
      targetEntityId: 7,
      score: 0.8,
      rank: 1,
      lineage: { graphSnapshotId: 42 },
      explanation: { path: [1, 7] },
      knownAt: '2026-07-23T01:00:00.000Z',
    },
  ],
  metrics: [
    {
      metricKey: 'precision_at_10',
      metricValue: 0.7,
      numeratorCount: 7,
      denominatorCount: 10,
      confidenceLower: 0.5,
      confidenceUpper: 0.9,
      gatePassed: true,
      detail: {},
    },
  ],
};

describe('P5 terminal shadow artifact writer', () => {
  it('appends one run, candidates, and metrics atomically with structural flags', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    const executor = {
      async query(sql: string, params?: readonly unknown[]) {
        calls.push({ sql, params });
        if (sql.includes('INSERT INTO analytics.shadow_experiment_run')) {
          return [{ shadow_experiment_run_id: '99' }];
        }
        return [];
      },
    };
    const result = await appendShadowExperimentArtifact(executor, input);
    assert.deepEqual(result, { shadowExperimentRunId: '99', candidateCount: 1, metricCount: 1 });
    assert.equal(calls[0]?.sql, 'BEGIN');
    assert.equal(calls.at(-1)?.sql, 'COMMIT');
    assert.match(
      calls.find(({ sql }) => sql.includes('INSERT INTO analytics.candidate_score'))?.sql ?? '',
      /TRUE, FALSE, FALSE/,
    );
    assert.doesNotMatch(
      calls.map(({ sql }) => sql).join('\n'),
      /knowledge\.relation_revision|INSERT INTO\s+(?:order|broker)/i,
    );
  });

  it('rolls back when a child append fails', async () => {
    const calls: string[] = [];
    const executor = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.includes('INSERT INTO analytics.shadow_experiment_run')) {
          return [{ shadow_experiment_run_id: '99' }];
        }
        if (sql.includes('candidate_score')) throw new Error('write failed');
        return [];
      },
    };
    await assert.rejects(() => appendShadowExperimentArtifact(executor, input), /write failed/);
    assert.equal(calls.at(-1), 'ROLLBACK');
  });

  it('rejects malformed terminal artifacts before touching the database', async () => {
    let called = false;
    const executor = {
      async query() {
        called = true;
        return [];
      },
    };
    await assert.rejects(
      () =>
        appendShadowExperimentArtifact(executor, {
          ...input,
          run: { ...input.run, executionMode: 'production' },
        }),
      /invalid shadow experiment artifact/i,
    );
    assert.equal(called, false);
  });
});
