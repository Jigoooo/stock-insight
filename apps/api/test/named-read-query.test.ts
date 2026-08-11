import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  namedReadQueryIds,
  withNamedReadQuery,
  type ReadQueryMetric,
} from '../src/server/named-read-query.ts';

describe('named read query metrics', () => {
  it('keeps the approved query id registry exact', () => {
    assert.deepEqual(namedReadQueryIds, [
      'workspace.today',
      'workspace.shell',
      'stocks.list',
      'stocks.detail',
      'radar.page',
      'history.page',
      'status.summary',
      'record.detail',
      'relations.graph',
      'impact.brief',
      'assetView.packet',
    ]);
  });

  it('reports only query id, elapsed time, and row count', async () => {
    const metrics: ReadQueryMetric[] = [];
    const executor = withNamedReadQuery(
      { queryRows: async () => [{ id: 1 }, { id: 2 }] },
      'stocks.list',
      (metric) => metrics.push(metric),
      () => 12.5,
    );

    await executor.queryRows('SELECT secret FROM users WHERE user_id = $1', ['private-user']);

    assert.deepEqual(metrics, [{ queryId: 'stocks.list', durationMs: 0, rowCount: 2 }]);
    assert.deepEqual(Object.keys(metrics[0]!).sort(), ['durationMs', 'queryId', 'rowCount']);
    assert.doesNotMatch(JSON.stringify(metrics), /secret|private-user|SELECT|user_id/);
  });

  it('records a null row count on failure without exposing the error or query', async () => {
    const metrics: ReadQueryMetric[] = [];
    const executor = withNamedReadQuery(
      {
        queryRows: async () => {
          throw new Error('password=do-not-log');
        },
      },
      'record.detail',
      (metric) => metrics.push(metric),
      () => 20,
    );

    await assert.rejects(() => executor.queryRows('SELECT password', []), /do-not-log/);
    assert.deepEqual(metrics, [{ queryId: 'record.detail', durationMs: 0, rowCount: null }]);
    assert.doesNotMatch(JSON.stringify(metrics), /password|do-not-log|SELECT/);
  });
});
