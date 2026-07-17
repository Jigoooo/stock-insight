import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analysisStatusSchema,
  canonicalMetaSchema,
  entityDetailSchema,
  feedListItemSchema,
  relationGraphSchema,
  workspaceSummarySchema,
  workspaceV3Limits,
} from '../src/workspace-v3.ts';

const meta = {
  schemaVersion: 'v3',
  source: 'database',
  availability: 'available',
  generatedAt: '2026-07-17T00:00:00.000Z',
  asOf: '2026-07-16T23:00:00.000Z',
} as const;

const feedItem = {
  id: 'feed-nvda-filing',
  entityKey: 'US:NVDA',
  title: '최근 공시 근거가 갱신됨',
  summary: '공식 공시 원문과 연결된 정성 요약',
  asOf: '2026-07-16T22:00:00.000Z',
  availability: 'available',
  analysisStatus: 'cached',
  evidenceCount: 1,
  sourceCount: 1,
  quality: 'high',
} as const;

const entityDetail = {
  meta,
  entityKey: 'US:NVDA',
  ticker: 'NVDA',
  market: 'US',
  displayName: 'NVIDIA',
  summary: '출처와 근거를 함께 제공하는 기업 리서치 요약',
  analysisStatus: 'cached',
  quality: 'high',
  evidence: [
    {
      id: 'evidence-filing',
      claim: '최근 공식 공시가 수집되어 원문 확인이 가능하다.',
      asOf: '2026-07-16T21:00:00.000Z',
      quality: 'high',
      sourceIds: ['source-filing'],
    },
  ],
  sources: [
    {
      id: 'source-filing',
      label: 'SEC filing',
      url: 'https://www.sec.gov/edgar/browse/?CIK=1045810',
      kind: 'filing',
      publishedAt: '2026-07-16T20:00:00.000Z',
    },
  ],
} as const;

const relationGraph = {
  rootEntityKey: 'US:NVDA',
  nodes: [
    { entityKey: 'US:NVDA', market: 'US', label: 'NVIDIA', quality: 'high' },
    { entityKey: 'KR:005930', market: 'KR', label: '삼성전자', quality: 'medium' },
  ],
  edges: [
    {
      id: 'edge-supply-chain',
      from: 'US:NVDA',
      to: 'KR:005930',
      relation: 'industry_peer',
      evidenceIds: ['evidence-filing'],
      sourceIds: ['source-filing'],
      quality: 'medium',
    },
  ],
  asOf: '2026-07-16T23:00:00.000Z',
  depth: 1,
  availability: 'available',
  quality: 'medium',
} as const;

describe('workspace v3 read-only contracts', () => {
  it('parses canonical metadata and each public v3 read model', () => {
    assert.equal(canonicalMetaSchema.parse(meta).schemaVersion, 'v3');
    assert.equal(analysisStatusSchema.parse('cached'), 'cached');

    const summary = workspaceSummarySchema.parse({
      meta,
      entityCount: 2,
      feedItemCount: 1,
      evidenceCount: 1,
      sourceCount: 1,
      quality: 'high',
      analysisStatus: 'cached',
    });
    assert.equal(summary.meta.availability, 'available');

    const parsedFeed = feedListItemSchema.parse(feedItem);
    assert.deepEqual(
      {
        evidenceCount: parsedFeed.evidenceCount,
        sourceCount: parsedFeed.sourceCount,
        quality: parsedFeed.quality,
      },
      { evidenceCount: 1, sourceCount: 1, quality: 'high' },
    );

    const parsedDetail = entityDetailSchema.parse(entityDetail);
    assert.equal(parsedDetail.evidence[0]?.sourceIds[0], parsedDetail.sources[0]?.id);

    const parsedGraph = relationGraphSchema.parse(relationGraph);
    assert.equal(parsedGraph.depth, 1);
    assert.equal(parsedGraph.edges[0]?.to, 'KR:005930');
  });

  it('strips undeclared credential, config, and internal eligibility fields', () => {
    const parsed = entityDetailSchema.parse({
      ...entityDetail,
      credentialName: 'secret-broker-profile',
      config: { path: '/run/secrets/provider' },
      internalEligible: true,
      meta: {
        ...meta,
        apiKey: 'should-not-leak',
      },
      evidence: [
        {
          ...entityDetail.evidence[0],
          internalEligibility: 'private-rule',
        },
      ],
      sources: [
        {
          ...entityDetail.sources[0],
          credential: 'source-token',
          configPath: '/private/source-config',
        },
      ],
    });
    const serialized = JSON.stringify(parsed);

    for (const forbidden of [
      'credential',
      'secret-broker-profile',
      'config',
      '/run/secrets/provider',
      'internalEligib',
      'private-rule',
      'apiKey',
      'should-not-leak',
      'source-token',
      '/private/source-config',
    ]) {
      assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'));
    }
  });

  it('rejects crypto and malformed or mismatched stock entity keys', () => {
    assert.equal(
      feedListItemSchema.safeParse({ ...feedItem, entityKey: 'CRYPTO:BTC' }).success,
      false,
    );
    assert.equal(
      entityDetailSchema.safeParse({ ...entityDetail, entityKey: 'US:nvda' }).success,
      false,
    );
    assert.equal(
      entityDetailSchema.safeParse({ ...entityDetail, entityKey: 'KR:005930' }).success,
      false,
    );
    assert.equal(
      relationGraphSchema.safeParse({
        ...relationGraph,
        nodes: [
          ...relationGraph.nodes,
          { entityKey: 'CRYPTO:BTC', market: 'US', label: 'Bitcoin', quality: 'low' },
        ],
      }).success,
      false,
    );
  });

  it('rejects graph depths above two and arrays above their public bounds', () => {
    assert.equal(relationGraphSchema.safeParse({ ...relationGraph, depth: 3 }).success, false);

    const excessiveEvidence = Array.from(
      { length: workspaceV3Limits.entityEvidence + 1 },
      (_, index) => ({
        ...entityDetail.evidence[0],
        id: `evidence-${index}`,
      }),
    );
    assert.equal(
      entityDetailSchema.safeParse({ ...entityDetail, evidence: excessiveEvidence }).success,
      false,
    );
  });
});
