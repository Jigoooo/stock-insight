import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { methodologyRegistryMigrationSql } from '../src/migrations/039_methodology_registry.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P2-WC methodology registry migration', () => {
  it('registers migration 039 and all methodology surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /methodologyRegistryMigrationSql/);
    assert.match(indexSource, /id: '039_methodology_registry'/);
    for (const surface of [
      'methodology_template',
      'method_estimate',
      'method_assumption',
      'method_diagnostic',
      'conformal_interval',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('is purely additive and never rewrites history', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(methodologyRegistryMigrationSql, token);
    }
  });

  it('registers the standard method templates and marks their causal claim class', () => {
    assert.match(
      methodologyRegistryMigrationSql,
      /create table if not exists analytics\.methodology_template\s*\(/i,
    );
    assert.match(
      methodologyRegistryMigrationSql,
      /method_kind\s+text\s+not null[\s\S]+event_study[\s\S]+local_projection[\s\S]+scm[\s\S]+did[\s\S]+dml[\s\S]+pcmci/i,
    );
    // The claim class separates statistical association from a causal claim.
    assert.match(
      methodologyRegistryMigrationSql,
      /claim_class\s+text\s+not null[\s\S]+statistical_association[\s\S]+causal_estimate/i,
    );
    assert.match(methodologyRegistryMigrationSql, /P2-WC methodology template seed/i);
  });

  it('stores an estimate with method, CI, and a candidate-only flag for PCMCI', () => {
    assert.match(
      methodologyRegistryMigrationSql,
      /create table if not exists analytics\.method_estimate\s*\(/i,
    );
    assert.match(methodologyRegistryMigrationSql, /point_estimate\s+numeric/i);
    assert.match(methodologyRegistryMigrationSql, /ci_lower\s+numeric/i);
    assert.match(methodologyRegistryMigrationSql, /ci_upper\s+numeric/i);
    // CI must be coherent when present.
    assert.match(
      methodologyRegistryMigrationSql,
      /ci_upper is null or ci_lower is null or ci_upper\s*>=\s*ci_lower/i,
    );
    // A program + inputs must be stored so a published number can be replayed.
    assert.match(methodologyRegistryMigrationSql, /program_ref\s+jsonb\s+not null/i);
    assert.match(methodologyRegistryMigrationSql, /is_candidate_only\s+boolean/i);
  });

  it('forbids a PCMCI estimate from ever claiming causal, and forbids causal without diagnostics', () => {
    assert.match(
      methodologyRegistryMigrationSql,
      /create or replace function analytics\.guard_method_estimate_write/i,
    );
    // Hard rule: a discovery method (PCMCI) may only be candidate; never a causal estimate.
    assert.match(
      methodologyRegistryMigrationSql,
      /pcmci .* candidate only|discovery method estimates must be candidate-only and cannot claim causal/i,
    );
    // A causal claim requires stored assumptions + diagnostics.
    assert.match(
      methodologyRegistryMigrationSql,
      /causal estimate requires stored assumptions and diagnostics/i,
    );
    assert.match(methodologyRegistryMigrationSql, /is append-only/i);
  });

  it('captures assumptions and diagnostics as separate evidenced rows', () => {
    assert.match(
      methodologyRegistryMigrationSql,
      /create table if not exists analytics\.method_assumption\s*\(/i,
    );
    assert.match(
      methodologyRegistryMigrationSql,
      /create table if not exists analytics\.method_diagnostic\s*\(/i,
    );
    assert.match(methodologyRegistryMigrationSql, /diagnostic_kind\s+text\s+not null/i);
    assert.match(methodologyRegistryMigrationSql, /passed\s+boolean/i);
  });

  it('wraps an estimate with a conformal prediction interval at a stated coverage', () => {
    assert.match(
      methodologyRegistryMigrationSql,
      /create table if not exists analytics\.conformal_interval\s*\(/i,
    );
    assert.match(
      methodologyRegistryMigrationSql,
      /target_coverage\s+numeric\s+not null[\s\S]+> 0[\s\S]+< 1/i,
    );
    assert.match(methodologyRegistryMigrationSql, /interval_lower\s+numeric/i);
    assert.match(methodologyRegistryMigrationSql, /interval_upper\s+numeric/i);
  });

  it('grants least-privilege with analytics USAGE and no delete', () => {
    assert.match(methodologyRegistryMigrationSql, /grant usage on schema analytics/i);
    assert.match(methodologyRegistryMigrationSql, /grant select, insert on/i);
    assert.match(methodologyRegistryMigrationSql, /grant select on/i);
    assert.doesNotMatch(methodologyRegistryMigrationSql, /grant\s+delete/i);
  });
});
