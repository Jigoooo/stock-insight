import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPostgresStockReadModel,
  getStockList,
  type StockRowQueryExecutor,
} from '../src/stocks/read-model.ts';

const userScope = { userId: '11111111-1111-4111-8111-111111111111' } as const;

describe('public stock contract golden negative', () => {
  it('never serializes internal eligibility, credential, or config-only labels', async () => {
    const executor: StockRowQueryExecutor = async () => [
      {
        entity_key: 'US:NVDA',
        ticker: 'NVDA',
        market: 'US',
        name: 'NVIDIA',
        latest_price: '180.25',
        currency: 'USD',
        change_pct: '1.2',
        primary_thesis: 'source-backed research summary',
        confidence: 'medium',
        is_watched: true,
        is_holding: false,
        deep_report_length: 120,
        last_analyzed_at: '2026-07-16T00:00:00.000Z',
        internal_eligible: true,
        credential_name: 'secret-broker-profile',
        config_path: '/run/secrets/stock-provider',
        api_key_label: 'api_key',
      },
    ];
    const response = await getStockList({
      readModel: createPostgresStockReadModel(executor, userScope),
      now: new Date('2026-07-16T00:00:00.000Z'),
    });
    const serialized = JSON.stringify(response);

    for (const forbidden of [
      'internal_eligible',
      'credential_name',
      'secret-broker-profile',
      'config_path',
      '/run/secrets/stock-provider',
      'api_key_label',
      'api_key',
    ]) {
      assert.doesNotMatch(serialized, new RegExp(forbidden, 'i'));
    }
  });
});
