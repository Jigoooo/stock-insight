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
    const packet = { entityKey: 'US:NVDA', assetViewId: '1@2026-08-11' };
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
        commonAssetView: async (received) => {
          await received.queryRows('asset view query');
          calls.push({ name: 'assetView' });
          return { packet, availability: 'available' } as never;
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.equal(result.stockDetail, stockDetail);
    assert.equal(result.relation, relation);
    assert.equal(result.impactBrief, impactBrief);
    assert.equal(result.commonAssetView, packet);
    assert.deepEqual(result.partialFailures, {});
    assert.deepEqual(calls, [
      { name: 'stock' },
      { name: 'relation', depth: 2 },
      { name: 'impact' },
      { name: 'assetView' },
    ]);
    assert.deepEqual(queryCalls, [
      'stock query',
      'relation query',
      'impact query',
      'asset view query',
    ]);
  });

  // 공통 자산 패킷은 사용자별로 달라지지 않는다(`REQ-REC-001`). 그 게이트는 주석이
  // 아니라 시그니처가 지므로, 여기서 재는 것은 "userScope 를 안 쓴다"가 아니라
  // **받을 자리 자체가 없다**는 것이다. 개인화를 하려면 먼저 타입을 바꿔야 한다.
  it('hands the asset view dependency an entity key and nothing else', async () => {
    let received: Record<string, unknown> | null = null;
    await getEntityBriefingV2(executor, {
      entityKey: 'US:NVDA',
      surface: 'stocks',
      userScope,
      dependencies: {
        stockDetail: async () => null as never,
        relation: async () => null as never,
        impact: async () => ({ availability: 'available', data: null }) as never,
        commonAssetView: async (_executor, options) => {
          received = options;
          return { packet: null, availability: 'missing' } as never;
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.deepEqual(Object.keys(received ?? {}), ['entityKey']);
  });

  // 297 빌드 대상 밖의 종목에는 패킷이 아예 없는 것이 정상이다. 그 정상을 부분
  // 실패로 승격시키면 화면이 매번 사고를 보고하게 되고, 그때부터 진짜 사고가
  // 배경 소음에 묻힌다.
  it('reports an absent packet as null without calling it a partial failure', async () => {
    const result = await getEntityBriefingV2(executor, {
      entityKey: 'US:NOSUCH',
      surface: 'stocks',
      userScope,
      dependencies: {
        stockDetail: async () => null as never,
        relation: async () => null as never,
        impact: async () => ({ availability: 'available', data: null }) as never,
        commonAssetView: async () => ({ packet: null, availability: 'missing' }) as never,
      },
      reportQueryMetric: () => undefined,
    });

    assert.equal(result.commonAssetView, null);
    assert.deepEqual(result.partialFailures, {});
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
        commonAssetView: async () => {
          throw new Error('asset view unavailable');
        },
      },
      reportQueryMetric: () => undefined,
    });

    assert.equal(result.stockDetail, null);
    assert.equal(result.relation, null);
    assert.equal(result.impactBrief, null);
    assert.equal(result.commonAssetView, null);
    assert.deepEqual(result.partialFailures, {
      relation: '관계 데이터를 확인하지 못했습니다.',
      impact: '영향 경로 데이터를 확인하지 못했습니다.',
      commonAssetView: '공통 자산 패킷을 확인하지 못했습니다.',
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
