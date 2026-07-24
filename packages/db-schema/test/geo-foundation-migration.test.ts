import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { geoFoundationMigrationSql } from '../src/migrations/034_geo_foundation.ts';

const destructiveTokens = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\s+\S+\s+rename\b/i,
];

describe('P1-W4 geo-foundation migration', () => {
  it('registers migration 034 and all geo surfaces', () => {
    const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /geoFoundationMigrationSql/);
    assert.match(indexSource, /id: '034_geo_foundation'/);
    for (const surface of [
      'geo_entity',
      'geo_entity_revision',
      'geo_location_mention',
      'geo_location_candidate',
      'geo_location_decision',
      'geo_crosswalk',
    ]) {
      assert.match(indexSource, new RegExp(`'${surface}'`));
    }
  });

  it('requires PostGIS and never rewrites history destructively', () => {
    assert.match(geoFoundationMigrationSql, /create extension if not exists postgis/i);
    for (const token of destructiveTokens) {
      assert.doesNotMatch(geoFoundationMigrationSql, token);
    }
  });

  it('models a canonical geo entity with a spatial, time-and-precision revision', () => {
    assert.match(geoFoundationMigrationSql, /create schema if not exists geo/i);
    assert.match(geoFoundationMigrationSql, /create table if not exists geo\.entity\s*\(/i);
    assert.match(
      geoFoundationMigrationSql,
      /create table if not exists geo\.entity_revision\s*\(/i,
    );
    // Real PostGIS geometry with an SRID constraint (not a JSON fallback).
    assert.match(geoFoundationMigrationSql, /geometry\s*\(geometry,\s*4326\)/i);
    assert.match(
      geoFoundationMigrationSql,
      /precision_class\s+text\s+not null[\s\S]+exact[\s\S]+approximate[\s\S]+admin_area[\s\S]+country/i,
    );
    // Bitemporal + boundary/disputed handling.
    assert.match(geoFoundationMigrationSql, /valid_from\s+timestamptz/i);
    assert.match(geoFoundationMigrationSql, /known_from\s+timestamptz\s+not null/i);
    assert.match(geoFoundationMigrationSql, /check\s*\(known_from\s*>=/i);
    assert.match(
      geoFoundationMigrationSql,
      /boundary_policy\s+text\s+not null[\s\S]+undisputed[\s\S]+disputed[\s\S]+de_facto/i,
    );
  });

  it('maps location standards (ISO 3166 / UN M49 / GeoNames / UN LOCODE / IANA tz)', () => {
    assert.match(geoFoundationMigrationSql, /create table if not exists geo\.crosswalk\s*\(/i);
    assert.match(
      geoFoundationMigrationSql,
      /standard\s+text\s+not null[\s\S]+iso3166[\s\S]+unm49[\s\S]+geonames[\s\S]+unlocode[\s\S]+iana_tz/i,
    );
  });

  it('resolves a location mention through candidate + decision with abstention allowed', () => {
    assert.match(
      geoFoundationMigrationSql,
      /create table if not exists geo\.location_mention\s*\(/i,
    );
    assert.match(
      geoFoundationMigrationSql,
      /create table if not exists geo\.location_candidate\s*\(/i,
    );
    assert.match(
      geoFoundationMigrationSql,
      /create table if not exists geo\.location_decision\s*\(/i,
    );
    // auto_resolve / needs_review / abstain / non_link — abstention is explicit.
    assert.match(
      geoFoundationMigrationSql,
      /decision\s+text\s+not null[\s\S]+auto_resolve[\s\S]+needs_review[\s\S]+abstain[\s\S]+non_link/i,
    );
    assert.match(geoFoundationMigrationSql, /geo_auto_resolve_threshold/i);
  });

  it('enforces the accepted-location invariant and forbids forcing an ambiguous pick', () => {
    assert.match(
      geoFoundationMigrationSql,
      /create or replace function geo\.guard_location_decision_write/i,
    );
    // Accepted (auto_resolve) needs evidence + a resolved geo entity; ambiguous
    // scores may not be auto-resolved (abstention allowed instead).
    assert.match(geoFoundationMigrationSql, /ambiguous location may not be auto-resolved/i);
    assert.match(
      geoFoundationMigrationSql,
      /auto-resolved location requires a resolved geo entity and evidence/i,
    );
    assert.match(geoFoundationMigrationSql, /is append-only/i);
    // Gold set + machine gate result surface.
    assert.match(geoFoundationMigrationSql, /create table if not exists geo\.gold_location/i);
    assert.match(geoFoundationMigrationSql, /machine_gate_result/i);
  });

  it('seeds canonical country geo entities from existing entity country codes', () => {
    assert.match(geoFoundationMigrationSql, /from core\.entity/i);
    assert.match(geoFoundationMigrationSql, /country_code is not null/i);
    assert.match(geoFoundationMigrationSql, /P1-W4 geo seed/i);
  });

  it('grants least-privilege access and denies deletes on the new surfaces', () => {
    assert.match(geoFoundationMigrationSql, /grant usage on schema geo/i);
    assert.match(geoFoundationMigrationSql, /grant select, insert on/i);
    assert.match(geoFoundationMigrationSql, /grant select on/i);
    assert.doesNotMatch(geoFoundationMigrationSql, /grant\s+delete/i);
  });
});
