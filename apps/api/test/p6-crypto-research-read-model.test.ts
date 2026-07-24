import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getCryptoResearchWorkspace,
  type CryptoResearchQueryExecutor,
} from '../src/crypto/read-model.ts';

const knownAt = new Date('2026-07-23T00:00:00.000Z');

function executorForFixture(queries: string[] = []): CryptoResearchQueryExecutor {
  return {
    queryRows: async <TRow extends Record<string, unknown>>(sql: string) => {
      queries.push(sql);
      if (sql.includes('crypto_serving.entity_revision')) {
        return [
          {
            entity_key: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
            entity_kind: 'token',
            display_name: 'Bitcoin',
            symbol: 'BTC',
            chain_id: 'bip122:000000000019d6689c085ae165831e93',
            source_revision_id: 11,
            known_at: '2026-07-22T00:00:00.000Z',
          },
        ] as unknown as TRow[];
      }
      if (sql.includes('crypto_serving.event_revision')) {
        return [
          {
            event_key: 'crypto:event:chain_halt:test',
            event_type: 'chain_halt',
            lifecycle_state: 'confirmed',
            summary: '확인된 체인 사건',
            finality_state: 'finalized',
            source_revision_id: 12,
            known_at: '2026-07-22T00:00:00.000Z',
          },
        ] as unknown as TRow[];
      }
      if (sql.includes('crypto_serving.core_relation_revision')) {
        return [
          {
            relation_key: 'cross:btc:mstr',
            crypto_entity_key: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
            crypto_name: 'Bitcoin',
            core_entity_key: 'COMPANY:US:MSTR',
            core_name: 'Strategy',
            core_entity_type: 'Company',
            relation_kind: 'treasury_held_by_company',
            relation_state: 'verified',
            economic_magnitude: '214000',
            economic_magnitude_unit: 'BTC',
            epistemic_confidence: '0.99',
            source_revision_id: 13,
            known_at: '2026-07-22T00:00:00.000Z',
          },
        ] as unknown as TRow[];
      }
      if (sql.includes('crypto_serving.risk_exposure_revision')) {
        return [
          {
            exposure_key: 'crypto:risk:btc',
            crypto_entity_key: 'crypto:token:bip122:000000000019d6689c085ae165831e93/slip44:0',
            crypto_name: 'Bitcoin',
            shock_type: 'liquidity_withdrawal',
            channel_key: 'exchange_venue',
            direction_sign: -1,
            economic_magnitude: '0.2',
            economic_magnitude_unit: 'ratio',
            epistemic_confidence: null,
            lifecycle_state: 'building',
            source_revision_id: 14,
            known_at: '2026-07-22T00:00:00.000Z',
          },
        ] as unknown as TRow[];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

describe('P6-6 crypto research read model', () => {
  it('returns one PIT snapshot across crypto and company views', async () => {
    const queries: string[] = [];
    const result = await getCryptoResearchWorkspace(executorForFixture(queries), {
      knownAt,
      limit: 20,
    });
    assert.equal(result.availability, 'available');
    assert.deepEqual(result.stats, {
      entities: 1,
      events: 1,
      companyLinks: 1,
      riskExposures: 1,
    });
    assert.equal(result.companyLinks[0]?.coreName, 'Strategy');
    assert.equal(result.riskExposures[0]?.epistemicConfidence, null);
    assert.equal(result.riskExposures[0]?.lifecycleState, 'building');
    assert.deepEqual(
      [
        result.entities[0]?.sourceRevisionId,
        result.events[0]?.sourceRevisionId,
        result.companyLinks[0]?.sourceRevisionId,
        result.riskExposures[0]?.sourceRevisionId,
      ],
      [11, 12, 13, 14],
    );
    assert.match(
      queries.find((sql) => sql.includes('core_relation_revision')) ?? '',
      /FROM selected\s+WHERE[\s\S]*relation_state IN \('proposed','verified'\)/,
    );
    const companySql = queries.find((sql) => sql.includes('core_relation_revision')) ?? '';
    assert.doesNotMatch(companySql.split('FROM selected')[0] ?? '', /crypto_name IS NOT NULL/);
    assert.doesNotMatch(companySql.split('FROM selected')[0] ?? '', /core_entity_key IS NOT NULL/);
    const eventSql = queries.find((sql) => sql.includes('event_revision')) ?? '';
    assert.match(
      eventSql,
      /FROM selected\s+WHERE[\s\S]*lifecycle_state <> 'retracted'\s+AND summary IS NOT NULL/,
    );
    assert.doesNotMatch(eventSql.split('FROM selected')[0] ?? '', /summary IS NOT NULL/);
    assert.match(
      queries.find((sql) => sql.includes('risk_exposure_revision')) ?? '',
      /FROM selected\s+WHERE[\s\S]*lifecycle_state IN \('building','sealed'\)/,
    );
    const riskSql = queries.find((sql) => sql.includes('risk_exposure_revision')) ?? '';
    assert.doesNotMatch(riskSql.split('FROM selected')[0] ?? '', /crypto_name IS NOT NULL/);
    for (const sql of queries) {
      const [selection, outer] = sql.split('FROM selected');
      assert.doesNotMatch(selection ?? '', /valid_until IS NULL OR valid_until > \$1::timestamptz/);
      assert.match(outer ?? '', /valid_until IS NULL OR valid_until > \$1::timestamptz/);
    }
    assert.equal(result.readOnly, true);
    assert.equal(result.orderExecutable, false);
  });

  it('returns an explicit empty state and rejects unsafe limits', async () => {
    const empty: CryptoResearchQueryExecutor = { queryRows: async () => [] };
    const result = await getCryptoResearchWorkspace(empty, { knownAt, limit: 20 });
    assert.equal(result.availability, 'empty');
    await assert.rejects(getCryptoResearchWorkspace(empty, { knownAt, limit: 0 }), /limit/i);
  });
});
