import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { k4MarketIntelligenceRunReceiptMigrationSql } from '../src/migrations/091_k4_market_intelligence_run_receipt.ts';

describe('091 K4 market-intelligence run receipt', () => {
  it('registers after the numeric-fact revision guard', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
    const prior = indexSource.indexOf("id: '090_numeric_fact_revision_guard'");
    const current = indexSource.indexOf("id: '091_k4_market_intelligence_run_receipt'");
    assert.ok(prior >= 0 && current > prior);
    assert.match(indexSource, /k4MarketIntelligenceRunReceiptMigrationSql/);
  });

  it('stores an append-only cutoff and both request and result digests', () => {
    assert.match(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /CREATE TABLE IF NOT EXISTS analytics\.market_intelligence_run_receipt\s*\(/i,
    );
    for (const field of [
      'run_key',
      'run_kind',
      'cutoff_at',
      'request_digest',
      'plan_digest',
      'information_set_id',
      'requested_security_count',
      'evaluation_count',
      'accepted_evaluation_count',
      'reason_counts',
      'artifact_counts',
      'outcome_counts',
      'planner_version',
      'score_formula_version',
    ]) {
      assert.match(k4MarketIntelligenceRunReceiptMigrationSql, new RegExp(`\\b${field}\\b`, 'i'));
    }
    assert.match(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /UNIQUE\s*\(run_kind,\s*cutoff_at,\s*request_digest\)/i,
    );
    assert.match(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /BEFORE UPDATE OR DELETE ON analytics\.market_intelligence_run_receipt/i,
    );
  });

  it('does not expose receipt mutation or raw diagnostics to the read API', () => {
    assert.match(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /GRANT SELECT, INSERT ON analytics\.market_intelligence_run_receipt TO si_analytics/i,
    );
    assert.doesNotMatch(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /GRANT[^;]*market_intelligence_run_receipt[^;]*si_readapi/i,
    );
    assert.doesNotMatch(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /GRANT\s+UPDATE|GRANT\s+DELETE/i,
    );
  });

  it('adds the missing controlled operational channel without rewriting migration 037', () => {
    assert.match(k4MarketIntelligenceRunReceiptMigrationSql, /'operational_capacity'/);
    assert.match(k4MarketIntelligenceRunReceiptMigrationSql, /'operational'/);
    assert.match(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /ON CONFLICT \(channel_class\) DO NOTHING/i,
    );
    const oldMigration = readFileSync(
      new URL('../src/migrations/037_impact_exposure_ledger.ts', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(oldMigration, /operational_capacity/);
  });

  it('grants the analytics writer only the world event rows needed by the K4 chain', () => {
    assert.match(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /GRANT SELECT, INSERT ON\s+world\.event,\s+world\.event_revision,\s+world\.event_participant\s+TO si_analytics/i,
    );
    assert.doesNotMatch(
      k4MarketIntelligenceRunReceiptMigrationSql,
      /GRANT[^;]*world\.numeric_fact[^;]*TO si_analytics/i,
    );
  });
});
