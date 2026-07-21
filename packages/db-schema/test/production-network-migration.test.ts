import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { productionNetworkMigrationSql } from '../src/migrations/038_production_network.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P2-WB production network migration', () => {
  it('registers migration 038 and all production-network surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /productionNetworkMigrationSql/);
    assert.match(indexSource, /id: '038_production_network'/);
    for (const surface of [
      'io_industry_linkage',
      'firm_supply_relation',
      'product_classification',
      'trade_route',
      'industry_firm_allocation',
      'meta_path_policy',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('is purely additive and never rewrites history', () => {
    for (const token of destructiveTokens) {
      assert.doesNotMatch(productionNetworkMigrationSql, token);
    }
  });

  it('records industry IO linkage with a technical coefficient and provenance', () => {
    assert.match(
      productionNetworkMigrationSql,
      /create table if not exists analytics\.io_industry_linkage\s*\(/i,
    );
    // Leontief technical coefficient a_ij, source table version (OECD ICIO vintage).
    assert.match(productionNetworkMigrationSql, /technical_coefficient\s+numeric\s+not null/i);
    assert.match(productionNetworkMigrationSql, /io_table_version\s+text\s+not null/i);
    assert.match(
      productionNetworkMigrationSql,
      /source_industry_entity_id\s+bigint\s+not null\s+references core\.entity/i,
    );
    assert.match(
      productionNetworkMigrationSql,
      /target_industry_entity_id\s+bigint\s+not null\s+references core\.entity/i,
    );
  });

  it('captures disclosed firm supplier/customer relations with direction and evidence', () => {
    assert.match(
      productionNetworkMigrationSql,
      /create table if not exists analytics\.firm_supply_relation\s*\(/i,
    );
    assert.match(
      productionNetworkMigrationSql,
      /relation_kind\s+text\s+not null[\s\S]+supplier[\s\S]+customer/i,
    );
    assert.match(productionNetworkMigrationSql, /disclosure_source/i);
    assert.match(productionNetworkMigrationSql, /evidence_locator\s+jsonb\s+not null/i);
  });

  it('classifies products (HS / ECCN) and geographic trade routes (ports)', () => {
    assert.match(
      productionNetworkMigrationSql,
      /create table if not exists analytics\.product_classification\s*\(/i,
    );
    assert.match(
      productionNetworkMigrationSql,
      /classification_system\s+text\s+not null[\s\S]+hs[\s\S]+eccn/i,
    );
    assert.match(
      productionNetworkMigrationSql,
      /create table if not exists analytics\.trade_route\s*\(/i,
    );
    // Ports resolve through the P1 geo layer.
    assert.match(
      productionNetworkMigrationSql,
      /origin_geo_entity_id\s+bigint[\s\S]+references geo\.entity/i,
    );
  });

  it('allocates industry effects down to firms with a bounded, provenanced weight', () => {
    assert.match(
      productionNetworkMigrationSql,
      /create table if not exists analytics\.industry_firm_allocation\s*\(/i,
    );
    assert.match(productionNetworkMigrationSql, /allocation_weight\s+numeric\s+not null/i);
    // A single allocation weight must be a valid share in [0,1].
    assert.match(
      productionNetworkMigrationSql,
      /allocation_weight\s*>=\s*0\s+and\s+allocation_weight\s*<=\s*1/i,
    );
    assert.match(productionNetworkMigrationSql, /allocation_basis/i);
    assert.match(productionNetworkMigrationSql, /evidence_locator\s+jsonb\s+not null/i);
    // The per-industry allocation shares must not exceed 1 in aggregate; a guard enforces it.
    assert.match(
      productionNetworkMigrationSql,
      /create or replace function analytics\.guard_industry_firm_allocation_write/i,
    );
    assert.match(
      productionNetworkMigrationSql,
      /industry allocation weights.*exceed 1|allocation weights for an industry may not exceed 1/i,
    );
    assert.match(productionNetworkMigrationSql, /is append-only/i);
  });

  it('bounds path traversal to typed meta-paths with a cost budget (no mixed shortest path)', () => {
    assert.match(
      productionNetworkMigrationSql,
      /create table if not exists analytics\.meta_path_policy\s*\(/i,
    );
    assert.match(productionNetworkMigrationSql, /max_hops\s+integer\s+not null/i);
    assert.match(productionNetworkMigrationSql, /cost_budget\s+numeric\s+not null/i);
    // UI ≤ 3 hops per §13.3.
    assert.match(productionNetworkMigrationSql, /surface\s*<>\s*'ui'\s+or\s+max_hops\s*<=\s*3/i);
    // A typed meta-path pattern is required; mixed-relation shortest path is forbidden.
    assert.match(productionNetworkMigrationSql, /meta_path_pattern\s+text\s+not null/i);
    assert.match(productionNetworkMigrationSql, /P2-WB meta-path policy seed/i);
  });

  it('grants least-privilege with analytics USAGE and no delete', () => {
    assert.match(productionNetworkMigrationSql, /grant usage on schema analytics/i);
    assert.match(productionNetworkMigrationSql, /grant select, insert on/i);
    assert.match(productionNetworkMigrationSql, /grant select on/i);
    assert.doesNotMatch(productionNetworkMigrationSql, /grant\s+delete/i);
  });
});
