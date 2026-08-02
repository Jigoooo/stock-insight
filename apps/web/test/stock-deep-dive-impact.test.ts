import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildStockDeepDive,
  loadStockDeepDiveData,
} from '../src/pages/research-workspace/model/stock-deep-dive.ts';

import type { ImpactBriefResponse, StockDetailResponse } from '@stock-insight/contracts';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

// The `secondary_exposure` section stayed permanently missing because the only
// impact surface wired to the product read serving.impact_summary_v1, which is
// empty by construction (docs/operations/impact-plane-v1-v2.md). It is now fed by
// impact_brief content packs, whose paths carry a foreign key per traversed edge.

const stockDetail = {
  availability: 'available',
  data: {
    stock: {
      entityKey: 'KR:005930',
      ticker: '005930',
      market: 'KR',
      displayName: '삼성전자',
      isHolding: false,
      primaryThesis: null,
    },
    companyMetrics: [],
  },
  error: null,
  meta: { generatedAt: '2026-08-02T16:00:00.000Z', count: 1 },
} as unknown as StockDetailResponse;

const relation = {
  rootEntityKey: 'KR:005930',
  nodes: [],
  edges: [],
} as unknown as EntityRelationGraph;

function brief(paths: ImpactBriefResponse['data'] extends null ? never : unknown[]) {
  return {
    availability: 'available',
    data: {
      entityKey: 'KR:005930',
      contentPackId: 900,
      packDigest: 'a'.repeat(64),
      graphSnapshotId: 9,
      builtAt: '2026-08-02T13:19:00.000Z',
      freshUntil: '2026-08-04T01:19:00.000Z',
      paths,
    },
    error: null,
    meta: { generatedAt: '2026-08-02T16:00:00.000Z', count: paths.length },
  } as unknown as ImpactBriefResponse;
}

const path = (overrides: Record<string, unknown> = {}) => ({
  impactPathV2Id: 57865,
  triggerEventId: 6873,
  sourceEntityId: 242,
  eventType: 'supply_disruption',
  hopCount: 2,
  pathScore: 0.71,
  note: 'industrial linkage strength; never a price prediction',
  ...overrides,
});

describe('second-order exposure from sealed impact paths', () => {
  it('stays missing when no impact brief is supplied', () => {
    const result = buildStockDeepDive(stockDetail, relation);
    const section = result.sections.find((item) => item.id === 'secondary_exposure');
    assert.equal(section?.availability, 'missing');
    assert.deepEqual(section?.items, []);
  });

  it('becomes available and orders the strongest linkage first', () => {
    const result = buildStockDeepDive(
      stockDetail,
      relation,
      brief([
        path({ impactPathV2Id: 1, pathScore: 0.31, eventType: 'regulation' }),
        path({ impactPathV2Id: 2, pathScore: 0.88, eventType: 'supply_disruption' }),
      ]),
    );
    const section = result.sections.find((item) => item.id === 'secondary_exposure');

    assert.equal(section?.availability, 'available');
    assert.equal(section?.itemCount, 2);
    assert.match(section!.items[0]!, /공급 차질/);
    assert.match(section!.items[0]!, /0\.88/);
    assert.match(section!.items[1]!, /규제/);
  });

  it('describes linkage without implying a price expectation', () => {
    const result = buildStockDeepDive(stockDetail, relation, brief([path()]));
    const section = result.sections.find((item) => item.id === 'secondary_exposure');

    // The read-only product contract applies to rendered wording too.
    assert.match(section!.summary, /가격 전망이 아닙니다/);
    for (const item of section!.items) {
      assert.doesNotMatch(item, /상승|하락|매수|매도|목표가|전망/);
    }
  });

  it('states relation distance without claiming the event is about this holding', () => {
    // hopCount counts relation edges. The event always happened somewhere else, so
    // a one-hop path is "one relation away" — never "this company was named".
    const oneHop = buildStockDeepDive(stockDetail, relation, brief([path({ hopCount: 1 })]));
    const twoHop = buildStockDeepDive(stockDetail, relation, brief([path({ hopCount: 2 })]));

    const first = oneHop.sections.find((item) => item.id === 'secondary_exposure')!.items[0]!;
    assert.match(first, /1단계 떨어진 기업/);
    assert.doesNotMatch(first, /직접/);
    assert.match(
      twoHop.sections.find((item) => item.id === 'secondary_exposure')!.items[0]!,
      /2단계 떨어진 기업/,
    );
  });

  it('a missing impact endpoint degrades the section, not the whole page', async () => {
    const result = await loadStockDeepDiveData('KR:005930', {
      loadDetail: async () => stockDetail,
      loadRelation: async () => relation,
      loadImpactBrief: async () => {
        throw new Error('Impact brief failed with 404');
      },
    });

    assert.equal(
      result.deepDive.sections.find((item) => item.id === 'secondary_exposure')?.availability,
      'missing',
    );
    // The rest of the page still loaded.
    assert.equal(result.deepDive.entityKey, 'KR:005930');
  });

  it('a transport failure still fails closed', async () => {
    await assert.rejects(
      loadStockDeepDiveData('KR:005930', {
        loadDetail: async () => stockDetail,
        loadRelation: async () => relation,
        loadImpactBrief: async () => {
          throw new Error('Impact brief failed with 503');
        },
      }),
      /503/,
    );
  });

  it('refuses a brief that belongs to a different holding', async () => {
    // Rendering another holding's exposure under this one would be a false claim,
    // so this is a correctness failure rather than a degradation.
    await assert.rejects(
      loadStockDeepDiveData('KR:005930', {
        loadDetail: async () => stockDetail,
        loadRelation: async () => relation,
        loadImpactBrief: async () => {
          const other = brief([path()]);
          return {
            ...other,
            data: { ...other.data!, entityKey: 'US:NVDA' },
          } as ImpactBriefResponse;
        },
      }),
      /Impact brief identity mismatch/,
    );
  });
});
