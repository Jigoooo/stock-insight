import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { impactExposureLedgerMigrationSql } from '../src/migrations/037_impact_exposure_ledger.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P2-WA impact exposure ledger migration', () => {
  it('registers migration 037 and all impact surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /impactExposureLedgerMigrationSql/);
    assert.match(indexSource, /id: '037_impact_exposure_ledger'/);
    for (const surface of [
      'impact_shock',
      'impact_channel',
      'impact_exposure_revision',
      'impact_score_component',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('is purely additive and never rewrites history', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(impactExposureLedgerMigrationSql, token);
    }
  });

  it('anchors a shock to a live world event revision with evidence', () => {
    assert.match(
      impactExposureLedgerMigrationSql,
      /create table if not exists analytics\.impact_shock\s*\(/i,
    );
    assert.match(
      impactExposureLedgerMigrationSql,
      /event_revision_id\s+bigint\s+not null\s+references world\.event_revision\s*\(event_revision_id\)/i,
    );
    assert.match(impactExposureLedgerMigrationSql, /evidence_locator\s+jsonb\s+not null/i);
  });

  it('defines a controlled channel vocabulary of 17 transmission channels', () => {
    assert.match(
      impactExposureLedgerMigrationSql,
      /create table if not exists analytics\.impact_channel\s*\(/i,
    );
    assert.match(impactExposureLedgerMigrationSql, /channel_class\s+text\s+not null/i);
    // The plan fixes the channel taxonomy at 17 (§7.2); the seed must insert 17 distinct classes.
    assert.match(impactExposureLedgerMigrationSql, /P2-WA channel seed/i);
    assert.match(impactExposureLedgerMigrationSql, /17/);
  });

  it('records the full §7.3 exposure field set as an append-only bitemporal revision', () => {
    assert.match(
      impactExposureLedgerMigrationSql,
      /create table if not exists analytics\.impact_exposure_revision\s*\(/i,
    );
    // §7.3 fields.
    assert.match(
      impactExposureLedgerMigrationSql,
      /sign\s+text\s+not null[\s\S]+positive[\s\S]+negative[\s\S]+ambiguous/i,
    );
    assert.match(impactExposureLedgerMigrationSql, /sensitivity\s+numeric/i);
    assert.match(impactExposureLedgerMigrationSql, /horizon\s+text/i);
    assert.match(impactExposureLedgerMigrationSql, /lag_days\s+integer/i);
    assert.match(impactExposureLedgerMigrationSql, /regime\s+text/i);
    assert.match(impactExposureLedgerMigrationSql, /threshold/i);
    assert.match(impactExposureLedgerMigrationSql, /substitutability\s+numeric/i);
    assert.match(impactExposureLedgerMigrationSql, /materiality\s+numeric/i);
    assert.match(impactExposureLedgerMigrationSql, /uncertainty\s+numeric/i);
    // §7.4: magnitude (economic size) and epistemic confidence are stored in
    // SEPARATE columns; they must never be pre-multiplied into one number.
    assert.match(impactExposureLedgerMigrationSql, /economic_magnitude\s+numeric/i);
    assert.match(impactExposureLedgerMigrationSql, /epistemic_confidence\s+numeric/i);
    // Bitemporal + evidence-required + append-only revision chain.
    assert.match(impactExposureLedgerMigrationSql, /available_at\s+timestamptz\s+not null/i);
    assert.match(impactExposureLedgerMigrationSql, /known_at\s+timestamptz\s+not null/i);
    assert.match(impactExposureLedgerMigrationSql, /check\s*\(known_at\s*>=\s*available_at\)/i);
    assert.match(impactExposureLedgerMigrationSql, /evidence_locator\s+jsonb\s+not null/i);
    assert.match(
      impactExposureLedgerMigrationSql,
      /revision_no > 1 and supersedes_impact_exposure_revision_id is not null/i,
    );
  });

  it('forces the §7.4 eight-way score decomposition and forbids a single collapsed confidence', () => {
    assert.match(
      impactExposureLedgerMigrationSql,
      /create table if not exists analytics\.impact_score_component\s*\(/i,
    );
    assert.match(
      impactExposureLedgerMigrationSql,
      /component_kind\s+text\s+not null[\s\S]+evidence_confidence[\s\S]+relation_strength[\s\S]+materiality[\s\S]+transmission[\s\S]+direction[\s\S]+lag[\s\S]+market_reflection[\s\S]+model_uncertainty/i,
    );
    // Each exposure must carry its decomposition; a guard rejects a sealed
    // exposure that lacks the full component set.
    assert.match(
      impactExposureLedgerMigrationSql,
      /create or replace function analytics\.guard_impact_exposure_write/i,
    );
    assert.match(impactExposureLedgerMigrationSql, /is append-only/i);
    assert.match(
      impactExposureLedgerMigrationSql,
      /exposure requires the full eight-component score decomposition/i,
    );
    // §7.4 hard rule: epistemic confidence is not multiplied into economic size.
    assert.match(
      impactExposureLedgerMigrationSql,
      /epistemic confidence must not be multiplied into economic magnitude/i,
    );
  });

  it('grants least-privilege with analytics USAGE and no delete', () => {
    assert.match(impactExposureLedgerMigrationSql, /grant usage on schema analytics/i);
    assert.match(impactExposureLedgerMigrationSql, /grant select, insert on/i);
    assert.match(impactExposureLedgerMigrationSql, /grant select on/i);
    assert.doesNotMatch(impactExposureLedgerMigrationSql, /grant\s+delete/i);
  });
});
