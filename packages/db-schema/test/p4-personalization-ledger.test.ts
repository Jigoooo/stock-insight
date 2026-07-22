import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { personalizationDecisionSupportMigrationSql } from '../src/migrations/043_personalization_decision_support.ts';

const sql = personalizationDecisionSupportMigrationSql;
const indexSource = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const rolesSql = readFileSync(
  new URL('../src/roles/application_roles.sql', import.meta.url),
  'utf8',
);

const privateTables = [
  'user_profile_revision',
  'portfolio_snapshot',
  'portfolio_lot_snapshot',
  'portfolio_snapshot_seal',
  'thesis_revision',
  'decision_packet',
  'decision_packet_legal_review',
] as const;

const writerTables = privateTables.filter((table) => table !== 'decision_packet_legal_review');

describe('P4 personalization decision-support ledger', () => {
  it('registers additive migration 043 and only adds private ledger surfaces', () => {
    assert.match(indexSource, /id: '043_personalization_decision_support'/);
    assert.match(indexSource, /sql: personalizationDecisionSupportMigrationSql/);
    for (const table of privateTables) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS personalization\\.${table}`, 'i'));
    }
    assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)\b/i);
    assert.doesNotMatch(sql, /ALTER\s+TABLE\s+\S+\s+DROP\b/i);
  });

  it('binds portfolio lots and every decision input to the same canonical user', () => {
    assert.match(sql, /supersedes_profile_revision_id\s+UUID/i);
    assert.match(
      sql,
      /FOREIGN KEY \(supersedes_profile_revision_id, user_id\)[\s\S]*?REFERENCES personalization\.user_profile_revision \(user_profile_revision_id, user_id\)/i,
    );
    assert.match(sql, /supersedes_thesis_revision_id\s+UUID/i);
    assert.match(
      sql,
      /FOREIGN KEY \(supersedes_thesis_revision_id, user_id, security_entity_id\)[\s\S]*?REFERENCES personalization\.thesis_revision \(thesis_revision_id, user_id, security_entity_id\)/i,
    );
    assert.match(sql, /CREATE OR REPLACE FUNCTION personalization\.guard_profile_revision_insert/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION personalization\.guard_thesis_revision_insert/i);
    assert.doesNotMatch(sql, /ux_user_profile_revision_current/i);
    assert.doesNotMatch(sql, /ux_thesis_revision_current/i);
    assert.match(
      sql,
      /FOREIGN KEY \(portfolio_snapshot_id, user_id\)[\s\S]*REFERENCES personalization\.portfolio_snapshot \(portfolio_snapshot_id, user_id\)/i,
    );
    assert.match(
      sql,
      /FOREIGN KEY \(user_profile_revision_id, user_id\)[\s\S]*REFERENCES personalization\.user_profile_revision \(user_profile_revision_id, user_id\)/i,
    );
    assert.match(
      sql,
      /FOREIGN KEY \(thesis_revision_id, user_id, security_entity_id\)[\s\S]*REFERENCES personalization\.thesis_revision \(thesis_revision_id, user_id, security_entity_id\)/i,
    );
    assert.match(
      sql,
      /FOREIGN KEY \(decision_packet_id, user_id\)[\s\S]*REFERENCES personalization\.decision_packet \(decision_packet_id, user_id\)/i,
    );
    assert.doesNotMatch(
      sql,
      /FOREIGN KEY \(thesis_revision_id, user_id, security_entity_id\)[\s\S]*MATCH FULL/i,
      'optional thesis must remain nullable while a present thesis stays same-user and same-security scoped',
    );
    assert.match(
      sql,
      /common_view_digest\s+TEXT NOT NULL CHECK \(common_view_digest ~ '\^\[a-f0-9\]\{64\}\$'\)/i,
    );
    assert.match(
      sql,
      /packet_digest\s+TEXT NOT NULL CHECK \(packet_digest ~ '\^\[a-f0-9\]\{64\}\$'\)/i,
    );
  });

  it('stores the complete decision packet and fails closed on abstention, legal, and order boundaries', () => {
    for (const action of [
      'ADD',
      'HOLD',
      'REDUCE',
      'EXIT',
      'WATCH',
      'NO_ACTION',
      'INSUFFICIENT_DATA',
    ]) {
      assert.match(sql, new RegExp(`'${action}'`));
    }
    for (const field of [
      'action_reason',
      'counter_evidence',
      'failure_conditions',
      'estimated_costs',
      'tax_assumptions',
      'uncertainty',
      'expires_at',
      'abstention_reason',
    ]) {
      assert.match(sql, new RegExp(`\\b${field}\\b`, 'i'));
    }
    assert.match(
      sql,
      /advice_prohibited\s+BOOLEAN NOT NULL DEFAULT true CHECK \(advice_prohibited\)/i,
    );
    assert.match(
      sql,
      /order_executable\s+BOOLEAN NOT NULL DEFAULT false CHECK \(NOT order_executable\)/i,
    );
    assert.match(sql, /legal_review_status[\s\S]*CHECK \(legal_review_status = 'required'\)/i);
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS personalization\.decision_packet_legal_review[\s\S]*review_status[\s\S]*approved_read_only[\s\S]*rejected/i,
    );
    assert.match(sql, /UNIQUE \(user_id, decision_packet_id, reviewed_at\)/i);
    assert.match(sql, /UNIQUE \(user_id, security_entity_id, generated_at\)/i);
    assert.match(sql, /CHECK \(common_view_as_of <= generated_at\)/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION personalization\.guard_legal_review_insert/i);
    assert.match(sql, /reviewed_at < packet_generated_at/i);
    assert.match(sql, /CREATE OR REPLACE FUNCTION personalization\.guard_portfolio_lot_insert/i);
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION personalization\.guard_portfolio_snapshot_seal_insert/i,
    );
    assert.match(sql, /CREATE OR REPLACE FUNCTION personalization\.guard_decision_packet_insert/i);
    assert.match(sql, /pg_advisory_xact_lock/i);
    assert.match(sql, /portfolio snapshot must be sealed before packet creation/i);
    assert.match(sql, /decision packet cannot predate its bound private inputs/i);
    assert.match(sql, /decision packet profile revision is not valid at generation time/i);
    assert.match(sql, /decision packet thesis revision is not valid at generation time/i);
    assert.equal((sql.match(/'p4-profile:'/g) ?? []).length, 2);
    assert.equal((sql.match(/'p4-thesis:'/g) ?? []).length, 2);
    assert.match(
      sql,
      /action = 'INSUFFICIENT_DATA' AND abstention_reason IS NOT NULL[\s\S]*action <> 'INSUFFICIENT_DATA' AND abstention_reason IS NULL/i,
    );
  });

  it('forces row security and append-only semantics on every private table', () => {
    for (const table of privateTables) {
      assert.match(
        sql,
        new RegExp(`ALTER TABLE personalization\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'),
      );
      assert.match(
        sql,
        new RegExp(`ALTER TABLE personalization\\.${table} FORCE ROW LEVEL SECURITY`, 'i'),
      );
      assert.match(
        sql,
        new RegExp(
          `CREATE TRIGGER ${table}_append_only[\\s\\S]*ON personalization\\.${table}`,
          'i',
        ),
      );
    }
    assert.match(sql, /CREATE POLICY p4_reader_select_/i);
    assert.match(sql, /AS RESTRICTIVE FOR SELECT TO stock_insight_reader, stock_insight_writer/i);
    assert.match(sql, /AS RESTRICTIVE FOR INSERT TO stock_insight_writer/i);
    assert.match(sql, /current_setting\('{1,2}stock_insight\.user_id'{1,2}, true\)/i);
    assert.doesNotMatch(sql, /GRANT stock_insight_reader TO stock_insight_writer/i);
    assert.match(
      sql,
      /GRANT SELECT ON[\s\S]*personalization\.decision_packet_legal_review[\s\S]*TO stock_insight_reader, stock_insight_writer/i,
    );
  });

  it('keeps application roles enumerated, insert-only, and personalization-scoped', () => {
    assert.match(
      rolesSql,
      /GRANT USAGE ON SCHEMA[\s\S]*personalization[\s\S]*TO stock_insight_reader, stock_insight_writer/i,
    );
    assert.match(
      rolesSql,
      /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA[\s\S]*personalization[\s\S]*FROM stock_insight_reader, stock_insight_writer/i,
    );
    for (const table of privateTables) {
      assert.match(
        rolesSql,
        new RegExp(`GRANT SELECT ON personalization\\.${table} TO stock_insight_reader`, 'i'),
      );
      assert.doesNotMatch(
        rolesSql,
        new RegExp(`GRANT[^;]*(?:UPDATE|DELETE|TRUNCATE)[^;]*personalization\\.${table}`, 'i'),
      );
    }
    for (const table of writerTables) {
      assert.match(
        rolesSql,
        new RegExp(`GRANT INSERT ON personalization\\.${table} TO stock_insight_writer`, 'i'),
      );
    }
    assert.doesNotMatch(
      rolesSql,
      /GRANT INSERT ON personalization\.decision_packet_legal_review TO stock_insight_writer/i,
    );
  });
});
