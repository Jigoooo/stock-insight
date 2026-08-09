import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getEntityBriefingV2, getRecordBriefingV2 } from '../src/workspace/briefing-v2.ts';

const queryCalls: string[] = [];
const executor = {
  queryRows: async (sql: string) => {
    queryCalls.push(sql);
    return [];
  },
};
const userScope = { userId: '11111111-1111-4111-8111-111111111111' };

describe('workspace detail briefing V2', () => {
  it('uses one executor for stock detail, depth-2 relation, and impact data', async () => {
    queryCalls.length = 0;
    const calls: Array<{ name: string; depth?: number }> = [];
    const stockDetail = { availability: 'available', data: { stock: { entityKey: 'US:NVDA' } } };
    const relation = { rootEntityKey: 'US:NVDA' };
    const impactBrief = { availability: 'available', data: { entityKey: 'US:NVDA' } };
    const result = await getEntityBriefingV2(executor, {
      entityKey: 'US:NVDA',
      surface: 'stocks',
      userScope,
      dependencies: {
        stockDetail: async (received) => {
          await received.queryRows('stock query');
          calls.push({ name: 'stock' });
          return stockDetail as never;
        },
        relation: async (received, options) => {
          await received.queryRows('relation query');
          calls.push({ name: 'relation', depth: options.depth });
          return relation as never;
        },
        impact: async (received) => {
          await received.queryRows('impact query');
          calls.push({ name: 'impact' });
          return impactBrief as never;
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.equal(result.stockDetail, stockDetail);
    assert.equal(result.relation, relation);
    assert.equal(result.impactBrief, impactBrief);
    assert.deepEqual(result.partialFailures, {});
    assert.deepEqual(calls, [
      { name: 'stock' },
      { name: 'relation', depth: 2 },
      { name: 'impact' },
    ]);
    assert.deepEqual(queryCalls, ['stock query', 'relation query', 'impact query']);
  });

  it('keeps relation and impact failures partial for market connections', async () => {
    const result = await getEntityBriefingV2(executor, {
      entityKey: 'US:NVDA',
      surface: 'market_connections',
      userScope,
      dependencies: {
        relation: async () => {
          throw new Error('relation unavailable');
        },
        impact: async () => {
          throw new Error('impact unavailable');
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.equal(result.stockDetail, null);
    assert.equal(result.relation, null);
    assert.equal(result.impactBrief, null);
    assert.deepEqual(result.partialFailures, {
      relation: '관계 데이터를 확인하지 못했습니다.',
      impact: '영향 경로 데이터를 확인하지 못했습니다.',
    });
  });

  it('loads a record and its first affected relation through the same executor', async () => {
    const record = { recordKey: 'record:1', affectedEntityKeys: ['US:NVDA'] };
    const relation = { rootEntityKey: 'US:NVDA' };
    queryCalls.length = 0;
    const seen: string[] = [];
    const result = await getRecordBriefingV2(executor, {
      recordKey: 'record:1',
      userScope,
      dependencies: {
        record: async (received) => {
          await received.queryRows('record query');
          seen.push('record');
          return record as never;
        },
        relation: async (received) => {
          await received.queryRows('relation query');
          seen.push('relation');
          return relation as never;
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.equal(result?.record, record);
    assert.equal(result?.relation, relation);
    assert.deepEqual(seen, ['record', 'relation']);
    assert.deepEqual(queryCalls, ['record query', 'relation query']);
  });
});
