import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decisionHistoryPageSchema,
  decisionSupportPacketSchema,
  decisionSupportSummarySchema,
  entityRelationGraphSchema,
  myResearchOverviewSchema,
  radarSignalPageSchema,
  researchFeedPageSchema,
  researchRecordDetailSchema,
  systemStatusSchema,
  themeResearchListSchema,
  workspaceTodaySchema,
} from '../src/research-workspace.ts';

const generatedAt = '2026-07-16T15:55:00.000Z';
const cutoffAt = '2026-07-16T13:05:26.678Z';

const snapshotMeta = {
  schemaVersion: 'v3',
  visibility: 'internal',
  generatedAt,
  freshness: 'available',
  contentSnapshot: {
    analysisRunId: 'stock:2026-07-16:us_premarket',
    analysisRevision: 1,
    analysisCutoffAt: cutoffAt,
    sourceWatermarkAt: '2026-07-16T12:47:35.000Z',
    freshUntil: '2026-07-17T07:05:26.678Z',
  },
  graphSnapshot: {
    requestedAsOf: cutoffAt,
    knownThroughAt: cutoffAt,
    edgeRevisionPolicy: 'latest_known_at_or_before_cutoff',
  },
  marketSnapshot: { marketDataAsOf: '2026-07-16T12:40:00.000Z' },
  sourceCoverage: { linked: 1, clickable: 0, total: 1 },
  qualityFlags: ['source_url_partial'],
} as const;

const feedItem = {
  recordKey: 'stock:briefing:nvda:2026-07-16',
  recordType: 'briefing',
  market: 'US',
  title: '공급망 관련 공시가 갱신됨',
  summary: '공식 자료의 정성적 변화가 확인됨',
  publishedAt: '2026-07-16T12:30:00.000Z',
  affectedEntityKeys: ['US:NVDA'],
  whySurfaced: '관심 종목과 직접 관련된 최신 브리핑',
  relevance: { kind: 'direct', hops: 0 },
  confidence: 'high',
  sourceCoverage: { linked: 1, clickable: 0, total: 1 },
  qualityFlags: ['attribution_only'],
} as const;

describe('research workspace v3 contracts', () => {
  it('parses snapshot-bound workspace lanes with stable pagination metadata', () => {
    const parsed = workspaceTodaySchema.parse({
      meta: snapshotMeta,
      summary: {
        laneItemCount: 1,
        relationCount: 4,
        watchlistCount: 1,
        sourceCount: 1,
      },
      lanes: [
        {
          lane: 'must_know',
          scopeTotal: 1,
          items: [feedItem],
          nextCursor: null,
        },
        { lane: 'for_you', scopeTotal: 0, items: [], nextCursor: null },
        { lane: 'explore', scopeTotal: 0, items: [], nextCursor: null },
      ],
      defaultRecordKey: feedItem.recordKey,
    });

    assert.equal(parsed.meta.contentSnapshot.analysisRevision, 1);
    assert.equal(parsed.lanes[0]?.items[0]?.relevance.kind, 'direct');
    assert.equal(parsed.lanes[0]?.scopeTotal, 1);

    const feedPage = researchFeedPageSchema.parse({
      meta: snapshotMeta,
      lane: 'must_know',
      scopeTotal: 2,
      items: [feedItem],
      nextCursor: 'opaque-server-cursor',
    });
    assert.equal(feedPage.nextCursor, 'opaque-server-cursor');
  });

  it('rejects duplicate records across lanes and a default key outside the result', () => {
    assert.equal(
      workspaceTodaySchema.safeParse({
        meta: snapshotMeta,
        summary: { laneItemCount: 2, relationCount: 0, watchlistCount: 1, sourceCount: 1 },
        lanes: [
          { lane: 'must_know', scopeTotal: 1, items: [feedItem], nextCursor: null },
          { lane: 'for_you', scopeTotal: 1, items: [feedItem], nextCursor: null },
          { lane: 'explore', scopeTotal: 0, items: [], nextCursor: null },
        ],
        defaultRecordKey: 'missing-record',
      }).success,
      false,
    );
  });

  it('parses run-bound record evidence with attribution-only sources', () => {
    const parsed = researchRecordDetailSchema.parse({
      meta: snapshotMeta,
      ...feedItem,
      body: '원문 근거를 요약한 상세 리서치 내용',
      category: 'supply_chain',
      limitations: ['원문 URL이 없어 attribution만 제공'],
      evidence: [
        {
          evidenceId: 'evidence-1',
          claim: '공식 자료의 변화가 확인됨',
          sourceKeys: ['source-1'],
          quality: 'high',
        },
      ],
      sources: [
        {
          sourceKey: 'source-1',
          attributionText: '공식 거래소 공개자료',
          url: null,
          publishedAt: '2026-07-16T12:20:00.000Z',
          sourceContentHash: 'a'.repeat(64),
          bindingState: 'verified',
        },
      ],
    });

    assert.equal(parsed.sources[0]?.url, null);
    assert.equal(parsed.sources[0]?.bindingState, 'verified');

    const missing = researchRecordDetailSchema.parse({
      ...parsed,
      evidence: [],
      sources: [
        {
          ...parsed.sources[0],
          sourceContentHash: null,
          bindingState: 'missing',
        },
      ],
    });
    assert.equal(missing.sources[0]?.sourceContentHash, null);
    assert.equal(
      researchRecordDetailSchema.safeParse({
        ...parsed,
        sources: [{ ...parsed.sources[0], sourceContentHash: null, bindingState: 'missing' }],
      }).success,
      false,
    );
    assert.equal(
      researchRecordDetailSchema.safeParse({
        ...parsed,
        sources: [{ ...parsed.sources[0], sourceContentHash: null, bindingState: 'verified' }],
      }).success,
      false,
    );
  });

  it('accepts only approved non-inferred relation edges within the public node bound', () => {
    const parsed = entityRelationGraphSchema.parse({
      meta: snapshotMeta,
      rootEntityKey: 'US:NVDA',
      depth: 1,
      nodes: [
        { entityKey: 'US:NVDA', label: 'NVIDIA', market: 'US', watched: true, holding: false },
        { entityKey: 'KR:005930', label: '삼성전자', market: 'KR', watched: false, holding: false },
      ],
      edges: [
        {
          edgeId: 'relation-1:7',
          from: 'US:NVDA',
          to: 'KR:005930',
          relationType: 'peer',
          direction: 'directed',
          weight: 0.6,
          approved: true,
          inferred: false,
          evidenceQuality: 'medium',
          evidenceCount: 2,
          clickableSourceCount: 0,
        },
      ],
      evidenceSummary: {
        evidenceCount: 2,
        clickableSourceCount: 0,
        limitation: '관계 원문 연결 준비중',
      },
    });

    assert.equal(parsed.nodes.length, 2);
    assert.equal(parsed.edges[0]?.inferred, false);
    assert.equal(
      entityRelationGraphSchema.safeParse({
        ...parsed,
        edges: [{ ...parsed.edges[0], inferred: true }],
      }).success,
      false,
    );
  });

  it('parses projection status without collapsing independent dataset clocks', () => {
    const parsed = systemStatusSchema.parse({
      generatedAt,
      overall: 'available',
      datasets: [
        {
          domain: 'stock',
          datasetName: 'publication_records',
          availability: 'available',
          watermarkAt: cutoffAt,
          rowCount: 194,
          analysisRunId: 'stock:2026-07-16:us_premarket',
          analysisRevision: 1,
        },
        {
          domain: 'stock',
          datasetName: 'market_snapshots',
          availability: 'stale',
          watermarkAt: '2026-07-15T12:00:00.000Z',
          rowCount: 26363,
          analysisRunId: null,
          analysisRevision: null,
        },
      ],
      sourceCoverage: { linked: 194, clickable: 67, total: 194 },
      graphSourceCoverage: { linked: 0, clickable: 0, total: 3416 },
    });

    assert.deepEqual(
      parsed.datasets.map(({ availability }) => availability),
      ['available', 'stale'],
    );
  });

  it('parses UUID decision history without exposing the server-owned user id', () => {
    const parsed = decisionHistoryPageSchema.parse({
      generatedAt,
      availability: 'available',
      scopeTotal: 3,
      items: [
        {
          historyId: 'd6c89bbc-553f-4037-bd17-7397f25e5a84',
          userId: '11111111-1111-4111-8111-111111111111',
          entityKey: 'KR:005930',
          market: 'KR',
          entryType: 'alert_review',
          title: '포트폴리오 경보 검토',
          thesis: '변화 원인과 판단 조건을 다시 확인',
          evidenceCount: 2,
          sourceKind: 'user_alert_events',
          sourceRef: 'portfolio-alert:feed:580',
          occurredAt: cutoffAt,
          reviewDueAt: null,
          status: 'open',
          adviceProhibited: true,
          createdAt: generatedAt,
        },
      ],
      nextCursor: 'opaque-history-cursor',
    });

    assert.equal(parsed.items[0]?.historyId, 'd6c89bbc-553f-4037-bd17-7397f25e5a84');
    assert.equal('userId' in (parsed.items[0] ?? {}), false);
    assert.equal(
      decisionHistoryPageSchema.safeParse({
        ...parsed,
        items: [{ ...parsed.items[0], adviceProhibited: false }],
      }).success,
      false,
    );
  });

  it('parses personalized radar signals with bounded strength and stable pagination', () => {
    const componentWatermarks = {
      event_radar: { availability: 'available', watermarkAt: cutoffAt, rowCount: 1 },
      factor_map: { availability: 'partial', watermarkAt: cutoffAt, rowCount: 1 },
      propagation_map: { availability: 'partial', watermarkAt: cutoffAt, rowCount: 1 },
      theme_community: { availability: 'missing', watermarkAt: null, rowCount: 0 },
      heatmap_matrix: { availability: 'available', watermarkAt: cutoffAt, rowCount: 1 },
      timeline: { availability: 'available', watermarkAt: cutoffAt, rowCount: 1 },
      map_globe: { availability: 'missing', watermarkAt: null, rowCount: 0 },
      value_chain: { availability: 'missing', watermarkAt: null, rowCount: 0 },
    } as const;
    const parsed = radarSignalPageSchema.parse({
      generatedAt,
      signalAsOf: cutoffAt,
      scopeTotal: 1,
      componentWatermarks,
      items: [
        {
          signalKey: 'market-signal:nvda:price-mover',
          entityKey: 'US:NVDA',
          market: 'US',
          symbol: 'NVDA',
          name: 'NVIDIA',
          signalType: 'price_mover',
          polarity: 'positive',
          strength: 0.83,
          summary: '거래량을 동반한 가격 변화',
          occurredAt: cutoffAt,
          sourceName: 'market_signals',
          watched: true,
          holding: false,
        },
      ],
      nextCursor: 'opaque-radar-cursor',
    });
    assert.equal(parsed.items[0]?.strength, 0.83);
    assert.deepEqual(parsed.componentWatermarks, componentWatermarks);
    assert.equal(
      radarSignalPageSchema.safeParse({ ...parsed, componentWatermarks: undefined }).success,
      false,
    );
    assert.equal(
      radarSignalPageSchema.safeParse({
        ...parsed,
        componentWatermarks: {
          ...componentWatermarks,
          event_radar: { availability: 'available', watermarkAt: null, rowCount: 1 },
        },
      }).success,
      false,
    );
    assert.equal(
      radarSignalPageSchema.safeParse({
        ...parsed,
        items: [{ ...parsed.items[0], strength: 1.01 }],
      }).success,
      false,
    );
  });

  it('parses theme research summaries with separate graph and signal clocks', () => {
    const parsed = themeResearchListSchema.parse({
      generatedAt,
      graphKnownThroughAt: cutoffAt,
      signalAsOf: '2026-07-16T12:00:00.000Z',
      availability: 'available',
      items: [
        {
          themeKey: 'THEME:ai_semi',
          title: 'AI 반도체',
          description: 'AI 연산 수요와 반도체 공급망 연결',
          memberCount: 12,
          watchedCount: 2,
          holdingCount: 1,
          recentSignalCount: 18,
          topEntityKeys: ['US:NVDA', 'US:AMD'],
        },
      ],
    });
    assert.equal(parsed.items[0]?.memberCount, 12);
    assert.equal(
      themeResearchListSchema.safeParse({
        ...parsed,
        items: [{ ...parsed.items[0], watchedCount: 13 }],
      }).success,
      false,
    );
  });

  it('parses a bounded My Research overview without user identity fields', () => {
    const parsed = myResearchOverviewSchema.parse({
      generatedAt,
      availability: 'available',
      watchlistCount: 4,
      holdingCount: 2,
      openHistoryCount: 3,
      reviewDueCount: 1,
      recentHistory: [
        {
          historyId: '5010c1ac-e77c-8986-a31e-5cca7c402bf2',
          entityKey: 'KR:005930',
          market: 'KR',
          entryType: 'alert_review',
          title: '삼성전자 경보 검토',
          thesis: '판단 조건 확인',
          evidenceCount: 1,
          sourceKind: null,
          sourceRef: null,
          occurredAt: cutoffAt,
          reviewDueAt: null,
          status: 'open',
          adviceProhibited: true,
          createdAt: generatedAt,
        },
      ],
      decisionSupport: {
        availability: 'missing',
        sourceState: 'migration_missing',
        packetCount: 0,
        latestPacket: null,
      },
    });
    assert.equal(parsed.recentHistory.length, 1);
    assert.equal('userId' in parsed, false);
  });

  it('rejects temporally inconsistent or contradictory decision-support packets', () => {
    const packet = {
      decisionPacketId: '50000000-0000-4000-8000-000000000005',
      entityKey: 'KR:005930',
      entityName: '삼성전자',
      action: 'HOLD',
      actionReason: '현재 상태 유지',
      abstentionReason: null,
      commonViewAsOf: '2026-07-16T13:00:00.000Z',
      generatedAt: '2026-07-16T14:00:00.000Z',
      expiresAt: '2026-07-17T14:00:00.000Z',
      legalReviewStatus: 'approved_read_only',
      restrictionReason: null,
      adviceProhibited: true,
      orderExecutable: false,
    } as const;
    assert.equal(decisionSupportPacketSchema.safeParse(packet).success, true);
    for (const invalid of [
      { ...packet, abstentionReason: '모순된 abstention' },
      { ...packet, commonViewAsOf: '2026-07-16T15:00:00.000Z' },
      { ...packet, expiresAt: '2026-07-16T14:00:00.000Z' },
    ]) {
      assert.equal(decisionSupportPacketSchema.safeParse(invalid).success, false);
    }
  });

  it('rejects decision-support summaries whose count, source, and latest packet disagree', () => {
    const packet = decisionSupportPacketSchema.parse({
      decisionPacketId: '50000000-0000-4000-8000-000000000005',
      entityKey: 'KR:005930',
      entityName: '삼성전자',
      action: 'HOLD',
      actionReason: '현재 상태 유지',
      abstentionReason: null,
      commonViewAsOf: '2026-07-16T13:00:00.000Z',
      generatedAt: '2026-07-16T14:00:00.000Z',
      expiresAt: '2026-07-17T14:00:00.000Z',
      legalReviewStatus: 'approved_read_only',
      restrictionReason: null,
      adviceProhibited: true,
      orderExecutable: false,
    });
    assert.equal(
      decisionSupportSummarySchema.safeParse({
        availability: 'available',
        sourceState: 'ready',
        packetCount: 1,
        latestPacket: packet,
      }).success,
      true,
    );
    for (const invalid of [
      { availability: 'available', sourceState: 'ready', packetCount: 0, latestPacket: packet },
      { availability: 'missing', sourceState: 'ready', packetCount: 1, latestPacket: null },
      {
        availability: 'available',
        sourceState: 'migration_missing',
        packetCount: 1,
        latestPacket: packet,
      },
    ]) {
      assert.equal(decisionSupportSummarySchema.safeParse(invalid).success, false);
    }
  });
});
