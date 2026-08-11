import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { impactBriefPathSchema, impactBriefStepSchema } from '@stock-insight/contracts';

/**
 * An impact path used to reach the product as "2 hops, 0.43" and nothing else.
 *
 * Every step already carried a graph_snapshot_edge foreign key — the reason for
 * the hop was recorded and simply never reached a contract. So the graph work of
 * 2026-08-05 (macro co-movement, topic entities, retraction, basket confidence)
 * could move a score but could not change a single word the user reads.
 */
describe('impact brief steps', () => {
  it('names relations without claiming causation', () => {
    const relations = impactBriefStepSchema.shape.relation.options;

    // MACRO_COMOVEMENT measures that a stock and a macro series moved together
    // over a stated window — nothing about one driving the other. The label has
    // to stop where the measurement stops, which is why the predicate is not
    // called AFFECTS either.
    assert.ok(relations.includes('moves_with'));
    for (const causal of ['affects', 'causes', 'drives', 'impacts', 'exposed_to']) {
      assert.ok(
        !relations.includes(causal as never),
        `'${causal}' claims a direction no relation here measured`,
      );
    }
  });

  it('accepts a path whose pack predates the field', () => {
    // Packs are immutable once sealed, so older ones carry no steps. Null means
    // "this pack is older", which is different from "this path had no steps" —
    // a path always has at least one.
    const older = {
      impactPathV2Id: 1,
      triggerEventId: 2,
      sourceEntityId: 3,
      eventType: 'earnings',
      sourceName: '삼성전자',
      sourceEntityKey: 'KR:005930',
      hopCount: 2,
      pathScore: 0.43,
      note: 'industrial linkage strength; never a price prediction',
      steps: null,
    };
    assert.doesNotThrow(() => impactBriefPathSchema.parse(older));

    assert.throws(
      () => impactBriefPathSchema.parse({ ...older, steps: [] }),
      'an empty step list is not a valid path — it would render as a reason-free hop',
    );
  });

  it('carries where each hop lands, which is what makes a 2-hop path readable', () => {
    const path = impactBriefPathSchema.parse({
      impactPathV2Id: 1,
      triggerEventId: 2,
      sourceEntityId: 3,
      eventType: 'macro_shock',
      sourceName: 'topic:rates',
      sourceEntityKey: null,
      hopCount: 2,
      pathScore: 0.46,
      note: 'industrial linkage strength; never a price prediction',
      steps: [
        { relation: 'indicated_by', toName: 'fred:DGS10', toEntityKey: null },
        {
          relation: 'moves_with',
          toName: 'iShares 20+ Year Treasury Bond ETF',
          toEntityKey: 'US:TLT',
        },
      ],
    });

    // The middle of the chain is the part a hop count cannot express.
    assert.equal(path.steps?.[0]?.toName, 'fred:DGS10');
    assert.equal(path.steps?.length, path.hopCount);
  });

  it('refuses to ship a predicate whose product wording nobody chose', async () => {
    // A new predicate reaching impact paths is a decision about what to CALL it.
    // A generic fallback would ship that decision unmade, so the publisher throws
    // instead — and every predicate that actually walks paths must be mapped.
    const source = await readFile(
      new URL('../src/analytics/run-v2-analytics-publish.ts', import.meta.url),
      'utf8',
    );

    assert.match(source, /has no product wording; add it to STEP_RELATION_BY_PREDICATE/);
    // 2026-08-12 갱신 — 이 목록은 "스냅샷 27 기준 다섯 개" 로 굳어 있었고, 그
    // 낡음이 정확히 사고의 원인이다. SAME_INDUSTRY 빌더(9aebd29)가 스냅샷 40 에
    // 276 간선을 넣었지만 이 핀은 27 을 재고 있었으므로 테스트는 초록이었고,
    // 파이프라인은 프로덕션에서 죽었다.
    //
    // 이제 핀은 **스냅샷에 실제로 들어 있는 술어 전부**다(스냅샷 40 실측:
    // PRODUCT_SIMILARITY 2862 · SAME_ETF_BASKET 2573 · COMMON_OWNER 1391 ·
    // SAME_INDUSTRY 276 · ISSUED_BY 254 · HELD_BY 250 · CLASSIFIED_AS 119 ·
    // MACRO_COMOVEMENT 25 · MEASURED_BY 20 · CUSTOMER_OF 10 · SUPPLIES 10).
    // "경로가 걷는 술어" 가 아니라 "스냅샷에 있는 술어" 로 넓힌 이유: 경로 탐색이
    // 어느 간선을 밟을지는 그날의 그래프가 정하고, 밟는 순간이 곧 publish 중단이다.
    //
    // CUSTOMER_OF · SUPPLIES 는 스냅샷 39·40 에 10 간선씩 있지만 39 의 어떤 경로도
    // 밟지 않았다(실측). 그래서 아직 매핑이 없고, 이 핀에도 넣지 않는다 — 두
    // 술어에는 정직한 기존 단어가 없어서 새 낱말을 골라야 하고, 그것은 제품 경계
    // 결정이지 이 커밋이 지나가며 할 일이 아니다. 밟는 날 publish 가 멈추고,
    // 멈추는 것이 이 throw 가 하려는 일이다.
    for (const predicate of [
      'SAME_ETF_BASKET',
      'PRODUCT_SIMILARITY',
      'CLASSIFIED_AS',
      'MACRO_COMOVEMENT',
      'MEASURED_BY',
      'ISSUED_BY',
      'HELD_BY',
      'COMMON_OWNER',
      'SAME_INDUSTRY',
    ]) {
      assert.match(
        source,
        new RegExp(`${predicate}: '`),
        `${predicate} walks impact paths in production and needs a word`,
      );
    }
  });
});
