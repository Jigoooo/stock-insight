import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  classifyRetrievalIntent,
  compileAtomicStatements,
  retrievalIntentSchema,
  retrievalPlanSchema,
  routeRetrievalQuery,
} from '../src/graphrag-router.ts';

describe('P2-WE1 GraphRAG retrieval router', () => {
  it('exposes the six retrieval intents (§15.1)', () => {
    const intents = retrievalIntentSchema.options;
    assert.deepEqual(
      [...intents].sort(),
      ['contradiction', 'factual', 'global', 'impact', 'numeric', 'relation'].sort(),
    );
  });

  it('classifies each query into exactly one intent', () => {
    assert.equal(classifyRetrievalIntent('삼성전자의 CEO는 누구인가'), 'factual');
    assert.equal(classifyRetrievalIntent('삼성전자 2024년 매출은 얼마인가'), 'numeric');
    assert.equal(classifyRetrievalIntent('삼성전자와 SK하이닉스의 공급 관계는'), 'relation');
    assert.equal(classifyRetrievalIntent('반도체 산업 전반의 큰 그림 요약'), 'global');
    assert.equal(classifyRetrievalIntent('금리 인상이 삼성전자에 미치는 영향'), 'impact');
    assert.equal(classifyRetrievalIntent('이 두 보고서가 서로 모순되는가'), 'contradiction');
  });

  it('routes a query to a plan carrying the intent, graph target, and evidence requirement', () => {
    const plan = routeRetrievalQuery('금리 인상이 삼성전자에 미치는 영향');
    const parsed = retrievalPlanSchema.parse(plan);
    assert.equal(parsed.intent, 'impact');
    // impact routes through the event graph (§15.3 dual graph).
    assert.equal(parsed.graphTarget, 'event');
    // every plan requires evidence to be attached to the answer.
    assert.equal(parsed.requiresEvidence, true);
  });

  it('routes factual/relation to the entity graph and impact/contradiction to the event graph', () => {
    assert.equal(routeRetrievalQuery('삼성전자의 본사는 어디인가').graphTarget, 'entity');
    assert.equal(routeRetrievalQuery('삼성전자와 TSMC의 경쟁 관계').graphTarget, 'entity');
    assert.equal(routeRetrievalQuery('제재가 반도체 공급에 미치는 영향').graphTarget, 'event');
    assert.equal(routeRetrievalQuery('두 뉴스가 모순되는지 확인').graphTarget, 'event');
  });

  it('flags a geo query and a portfolio query for their specialized routes (§15.4)', () => {
    const geo = routeRetrievalQuery('부산항 폐쇄가 어느 지역 기업에 영향을 주는가');
    assert.equal(geo.geoScoped, true);
    const portfolio = routeRetrievalQuery('내 포트폴리오에서 금리 상승 노출이 가장 큰 종목');
    assert.equal(portfolio.portfolioScoped, true);
  });

  it('requires a numeric query to carry an executable program with inputs (§15.2)', () => {
    const plan = routeRetrievalQuery('삼성전자 2024년 영업이익률은 몇 퍼센트인가');
    assert.equal(plan.intent, 'numeric');
    // a numeric plan must demand a replayable program, never a free-text number.
    assert.equal(plan.requiresExecutableProgram, true);
  });

  it('compiles a clean sentence into a single atomic statement labelled fact or inference', () => {
    const result = compileAtomicStatements('삼성전자의 2024년 매출은 300조원이다.');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.statements.length, 1);
      assert.equal(result.statements[0]?.kind, 'fact');
    }
  });

  it('rejects a sentence that mixes a fact and an inference in one statement (§S2)', () => {
    // "매출이 늘었기 때문에 주가가 오를 것이다" — a fact clause fused with an
    // inferential claim in a single sentence must be rejected, not silently merged.
    const result = compileAtomicStatements('삼성전자 매출이 증가했기 때문에 주가가 상승할 것이다.');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, /사실.*추론|fact.*inference|mixed/i);
    }
  });

  it('splits a multi-sentence input into separate atomic statements', () => {
    const result = compileAtomicStatements('삼성전자의 본사는 수원에 있다. TSMC는 대만 기업이다.');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.statements.length, 2);
    }
  });

  it('is a pure deterministic router (same query yields the same plan)', () => {
    const q = '금리 인상이 삼성전자에 미치는 영향';
    assert.deepEqual(routeRetrievalQuery(q), routeRetrievalQuery(q));
  });
});
