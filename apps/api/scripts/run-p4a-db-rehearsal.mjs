import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

import { personalizationDecisionSupportMigrationSql } from '../../../packages/db-schema/src/migrations/043_personalization_decision_support.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const pg = require('pg');
const { Client } = pg;
const adminUrl = new URL(process.env.P4_REHEARSAL_ADMIN_DATABASE_URL ?? '');
const databaseName = `stock_insight_p4_rehearsal_${randomBytes(5).toString('hex')}`;
if (!/^stock_insight_p4_rehearsal_[a-f0-9]+$/.test(databaseName)) throw new Error('unsafe db name');
const quoted = `"${databaseName}"`;
const targetUrl = new URL(adminUrl);
targetUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: adminUrl.toString() });
await admin.connect();
async function readRoleState() {
  const state = await admin.query(`
    SELECT
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stock_insight_reader') AS reader_existed,
      EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stock_insight_writer') AS writer_existed,
      EXISTS (
        SELECT 1
        FROM pg_auth_members membership
        JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
        JOIN pg_roles member_role ON member_role.oid = membership.member
        WHERE granted_role.rolname='stock_insight_reader'
          AND member_role.rolname='stock_insight_writer'
      ) AS membership_existed,
      COALESCE((
        SELECT jsonb_agg(to_jsonb(membership) ORDER BY membership.grantor, membership.admin_option)
        FROM pg_auth_members membership
        JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
        JOIN pg_roles member_role ON member_role.oid = membership.member
        WHERE granted_role.rolname='stock_insight_reader'
          AND member_role.rolname='stock_insight_writer'
      ), '[]'::jsonb) AS membership_state
  `);
  return state.rows[0];
}
const roleStateBefore = await readRoleState();
let target;
let result;
let primaryError;
let roleStateRestored = false;
const cleanupErrors = [];
try {
  await admin.query(`CREATE DATABASE ${quoted}`);
  target = new Client({ connectionString: targetUrl.toString() });
  await target.connect();
  await target.query(`
    CREATE SCHEMA core;
    CREATE TABLE core.entity (entity_id BIGINT PRIMARY KEY, canonical_name TEXT NOT NULL);
    INSERT INTO core.entity VALUES (1, '검증 종목');
    CREATE SCHEMA knowledge;
    CREATE TABLE knowledge.derivation (derivation_id BIGINT PRIMARY KEY);
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stock_insight_reader') THEN
        CREATE ROLE stock_insight_reader NOLOGIN NOBYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='stock_insight_writer') THEN
        CREATE ROLE stock_insight_writer NOLOGIN NOBYPASSRLS;
      END IF;
    END $$;
  `);
  const migrationSha256 = createHash('sha256')
    .update(personalizationDecisionSupportMigrationSql)
    .digest('hex');
  const exactCountsSql = `
    SELECT table_name,
           CASE table_name
             WHEN 'user_profile_revision' THEN (SELECT count(*)::int FROM personalization.user_profile_revision)
             WHEN 'portfolio_snapshot' THEN (SELECT count(*)::int FROM personalization.portfolio_snapshot)
             WHEN 'portfolio_lot_snapshot' THEN (SELECT count(*)::int FROM personalization.portfolio_lot_snapshot)
             WHEN 'portfolio_snapshot_seal' THEN (SELECT count(*)::int FROM personalization.portfolio_snapshot_seal)
             WHEN 'thesis_revision' THEN (SELECT count(*)::int FROM personalization.thesis_revision)
             WHEN 'decision_packet' THEN (SELECT count(*)::int FROM personalization.decision_packet)
             WHEN 'decision_packet_legal_review' THEN (SELECT count(*)::int FROM personalization.decision_packet_legal_review)
           END AS row_count
      FROM unnest(ARRAY[
        'user_profile_revision','portfolio_snapshot','portfolio_lot_snapshot','portfolio_snapshot_seal',
        'thesis_revision','decision_packet','decision_packet_legal_review'
      ]) AS table_name
     ORDER BY table_name
  `;
  await target.query(personalizationDecisionSupportMigrationSql);
  const countsAfterFirstApply = (await target.query(exactCountsSql)).rows;
  await target.query(personalizationDecisionSupportMigrationSql);
  const countsAfterReplay = (await target.query(exactCountsSql)).rows;
  const replayCountsStable =
    JSON.stringify(countsAfterFirstApply) === JSON.stringify(countsAfterReplay);
  if (!replayCountsStable) throw new Error('migration replay changed exact relation counts');

  const userA = '10000000-0000-4000-8000-000000000001';
  const userB = '20000000-0000-4000-8000-000000000002';
  await target.query('BEGIN');
  await target.query('SET LOCAL ROLE stock_insight_writer');
  await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
  await target.query(
    `INSERT INTO personalization.user_profile_revision
      (user_profile_revision_id,user_id,revision_no,risk_capacity,max_position_weight,no_trade_band,decision_horizon_days,valid_from)
     VALUES ('30000000-0000-4000-8000-000000000003',$1,1,'medium',0.2,0.01,90,'2026-07-22T00:00:00Z')`,
    [userA],
  );
  await target.query(
    `INSERT INTO personalization.portfolio_snapshot
      (portfolio_snapshot_id,user_id,snapshot_as_of,source_known_at,base_currency,total_market_value,position_count,snapshot_digest)
     VALUES ('40000000-0000-4000-8000-000000000004',$1,'2026-07-22T00:00:00Z','2026-07-22T00:00:00Z','KRW',0,0,$2)`,
    [userA, 'a'.repeat(64)],
  );
  await target.query(
    `INSERT INTO personalization.portfolio_snapshot_seal
      (portfolio_snapshot_id,user_id,sealed_at)
     VALUES ('40000000-0000-4000-8000-000000000004',$1,'2026-07-22T00:00:00Z')`,
    [userA],
  );
  await target.query(
    `INSERT INTO personalization.decision_packet
      (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,thesis_revision_id,
       common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
       expires_at,engine_version,packet_digest,generated_at)
     VALUES ('50000000-0000-4000-8000-000000000005',$1,1,
       '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',NULL,
       'sealed-research','KR:TEST',$2,'2026-07-22T00:00:00Z','HOLD','검증 상태 유지',
       '2026-07-23T00:00:00Z','rules-v1',$3,'2026-07-22T00:00:00Z')`,
    [userA, 'b'.repeat(64), 'c'.repeat(64)],
  );
  await target.query('COMMIT');

  await target.query('BEGIN');
  await target.query('SET LOCAL ROLE stock_insight_writer');
  await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
  await target.query(
    `INSERT INTO personalization.user_profile_revision
      (user_profile_revision_id,user_id,revision_no,supersedes_profile_revision_id,risk_capacity,max_position_weight,no_trade_band,decision_horizon_days,valid_from)
     VALUES ('31000000-0000-4000-8000-000000000003',$1,2,'30000000-0000-4000-8000-000000000003','medium',0.18,0.01,90,'2026-07-22T01:00:00Z')`,
    [userA],
  );
  await target.query(
    `INSERT INTO personalization.thesis_revision
      (thesis_revision_id,user_id,security_entity_id,revision_no,thesis_text,status,valid_from)
     VALUES ('a0000000-0000-4000-8000-000000000010',$1,1,1,'초기 논지','active','2026-07-22T00:00:00Z')`,
    [userA],
  );
  await target.query(
    `INSERT INTO personalization.thesis_revision
      (thesis_revision_id,user_id,security_entity_id,revision_no,supersedes_thesis_revision_id,thesis_text,status,valid_from)
     VALUES ('a1000000-0000-4000-8000-000000000011',$1,1,2,'a0000000-0000-4000-8000-000000000010','갱신 논지','active','2026-07-22T01:00:00Z')`,
    [userA],
  );
  await target.query('COMMIT');

  const revisionState = await target.query(`
    SELECT
      (SELECT count(*)::int FROM personalization.user_profile_revision) AS profile_count,
      (SELECT count(*)::int FROM personalization.thesis_revision) AS thesis_count,
      (SELECT count(*)::int
         FROM personalization.user_profile_revision p
        WHERE NOT EXISTS (
          SELECT 1 FROM personalization.user_profile_revision successor
           WHERE successor.supersedes_profile_revision_id = p.user_profile_revision_id
             AND successor.user_id = p.user_id
        )) AS profile_head_count,
      (SELECT count(*)::int
         FROM personalization.thesis_revision t
        WHERE NOT EXISTS (
          SELECT 1 FROM personalization.thesis_revision successor
           WHERE successor.supersedes_thesis_revision_id = t.thesis_revision_id
             AND successor.user_id = t.user_id
             AND successor.security_entity_id = t.security_entity_id
        )) AS thesis_head_count
  `);

  let forkBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.user_profile_revision
        (user_profile_revision_id,user_id,revision_no,supersedes_profile_revision_id,risk_capacity,max_position_weight,no_trade_band,decision_horizon_days,valid_from)
       VALUES ('32000000-0000-4000-8000-000000000003',$1,3,'30000000-0000-4000-8000-000000000003','medium',0.18,0.01,90,'2026-07-22T02:00:00Z')`,
      [userA],
    );
    await target.query('COMMIT');
  } catch {
    forkBlocked = true;
    await target.query('ROLLBACK');
  }

  let skippedRevisionBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.thesis_revision
        (thesis_revision_id,user_id,security_entity_id,revision_no,supersedes_thesis_revision_id,thesis_text,status,valid_from)
       VALUES ('a2000000-0000-4000-8000-000000000012',$1,1,4,'a1000000-0000-4000-8000-000000000011','건너뛴 논지','active','2026-07-22T02:00:00Z')`,
      [userA],
    );
    await target.query('COMMIT');
  } catch {
    skippedRevisionBlocked = true;
    await target.query('ROLLBACK');
  }

  async function visibleCount(userId) {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_reader');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userId]);
    const result = await target.query(
      'SELECT count(*)::int AS count FROM personalization.decision_packet',
    );
    await target.query('COMMIT');
    return result.rows[0].count;
  }
  const ownVisible = await visibleCount(userA);
  const otherVisible = await visibleCount(userB);

  let crossUserBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userB]);
    await target.query(
      `INSERT INTO personalization.portfolio_snapshot
       (portfolio_snapshot_id,user_id,snapshot_as_of,source_known_at,base_currency,total_market_value,position_count,snapshot_digest)
       VALUES ('60000000-0000-4000-8000-000000000006',$1,'2026-07-22T02:00:00Z','2026-07-22T02:00:00Z','KRW',0,0,$2)`,
      [userA, '6'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    crossUserBlocked = true;
    await target.query('ROLLBACK');
  }

  await target.query('BEGIN');
  await target.query('SET LOCAL ROLE stock_insight_writer');
  await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
  await target.query(
    `INSERT INTO personalization.portfolio_snapshot
      (portfolio_snapshot_id,user_id,snapshot_as_of,source_known_at,base_currency,total_market_value,position_count,snapshot_digest)
     VALUES ('61000000-0000-4000-8000-000000000006',$1,'2026-07-22T03:00:00Z','2026-07-22T03:00:00Z','KRW',100,1,$2)`,
    [userA, '9'.repeat(64)],
  );
  await target.query('COMMIT');

  let sealMismatchBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.portfolio_snapshot_seal
        (portfolio_snapshot_id,user_id,sealed_at)
       VALUES ('61000000-0000-4000-8000-000000000006',$1,'2026-07-22T03:00:00Z')`,
      [userA],
    );
    await target.query('COMMIT');
  } catch {
    sealMismatchBlocked = true;
    await target.query('ROLLBACK');
  }

  let unsealedPacketBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,engine_version,packet_digest,generated_at)
       VALUES ('72000000-0000-4000-8000-000000000007',$1,1,
        '30000000-0000-4000-8000-000000000003','61000000-0000-4000-8000-000000000006',
        'sealed-research','KR:TEST',$2,'2026-07-22T03:00:00Z','HOLD','미봉인 검증',
        '2026-07-23T03:00:00Z','rules-v1',$3,'2026-07-22T03:01:00Z')`,
      [userA, 'a'.repeat(64), 'b'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    unsealedPacketBlocked = true;
    await target.query('ROLLBACK');
  }

  let lateLotBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.portfolio_lot_snapshot
       (portfolio_lot_snapshot_id,portfolio_snapshot_id,user_id,security_entity_id,lot_key,market,currency,quantity,market_value,portfolio_weight)
       VALUES ('62000000-0000-4000-8000-000000000006','40000000-0000-4000-8000-000000000004',$1,1,
        'late-lot','KR','KRW',1,0,0)`,
      [userA],
    );
    await target.query('COMMIT');
  } catch {
    lateLotBlocked = true;
    await target.query('ROLLBACK');
  }

  let backdatedPacketBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,engine_version,packet_digest,generated_at)
       VALUES ('73000000-0000-4000-8000-000000000007',$1,1,
        '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-21T23:58:00Z','HOLD','소급 packet 검증',
        '2026-07-22T23:59:00Z','rules-v1',$3,'2026-07-21T23:59:00Z')`,
      [userA, '3'.repeat(64), '4'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    backdatedPacketBlocked = true;
    await target.query('ROLLBACK');
  }

  let duplicatePacketTimeBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,engine_version,packet_digest,generated_at)
       VALUES ('74000000-0000-4000-8000-000000000007',$1,1,
        '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-22T00:00:00Z','HOLD','동일 시각 packet 검증',
        '2026-07-23T00:00:00Z','rules-v1',$3,'2026-07-22T00:00:00Z')`,
      [userA, '5'.repeat(64), '6'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    duplicatePacketTimeBlocked = true;
    await target.query('ROLLBACK');
  }

  let expiredProfilePacketBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.user_profile_revision
       (user_profile_revision_id,user_id,revision_no,supersedes_profile_revision_id,risk_capacity,
        max_position_weight,no_trade_band,decision_horizon_days,valid_from,valid_to)
       VALUES ('33000000-0000-4000-8000-000000000003',$1,3,
        '31000000-0000-4000-8000-000000000003','medium',0.18,0.01,90,
        '2026-07-22T02:00:00Z','2026-07-22T03:00:00Z')`,
      [userA],
    );
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,engine_version,packet_digest,generated_at)
       VALUES ('75000000-0000-4000-8000-000000000007',$1,1,
        '33000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-22T04:00:00Z','HOLD','만료 profile 검증',
        '2026-07-23T04:00:00Z','rules-v1',$3,'2026-07-22T04:00:00Z')`,
      [userA, '9'.repeat(64), 'a'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    expiredProfilePacketBlocked = true;
    await target.query('ROLLBACK');
  }

  let supersededProfilePacketBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,engine_version,packet_digest,generated_at)
       VALUES ('76000000-0000-4000-8000-000000000007',$1,1,
        '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-22T01:30:00Z','HOLD','구 profile 검증',
        '2026-07-23T01:30:00Z','rules-v1',$3,'2026-07-22T01:30:00Z')`,
      [userA, 'b'.repeat(64), 'c'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    supersededProfilePacketBlocked = true;
    await target.query('ROLLBACK');
  }

  let supersededThesisPacketBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        thesis_revision_id,common_view_kind,common_view_key,common_view_digest,common_view_as_of,
        action,action_reason,expires_at,engine_version,packet_digest,generated_at)
       VALUES ('77000000-0000-4000-8000-000000000007',$1,1,
        '31000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'a0000000-0000-4000-8000-000000000010','sealed-research','KR:TEST',$2,
        '2026-07-22T01:31:00Z','HOLD','구 thesis 검증','2026-07-23T01:31:00Z',
        'rules-v1',$3,'2026-07-22T01:31:00Z')`,
      [userA, 'd'.repeat(64), 'e'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    supersededThesisPacketBlocked = true;
    await target.query('ROLLBACK');
  }

  let orderPathBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,order_executable,engine_version,packet_digest,generated_at)
       VALUES ('70000000-0000-4000-8000-000000000007',$1,1,
        '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-22T00:00:00Z','HOLD','금지 검증',
        '2026-07-23T00:00:00Z',true,'rules-v1',$3,'2026-07-22T00:01:00Z')`,
      [userA, 'd'.repeat(64), 'e'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    orderPathBlocked = true;
    await target.query('ROLLBACK');
  }

  let futureCommonViewBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,engine_version,packet_digest,generated_at)
       VALUES ('71000000-0000-4000-8000-000000000007',$1,1,
        '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-22T00:04:00Z','HOLD','미래 view 검증',
        '2026-07-23T00:00:00Z','rules-v1',$3,'2026-07-22T00:03:00Z')`,
      [userA, '7'.repeat(64), '8'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    futureCommonViewBlocked = true;
    await target.query('ROLLBACK');
  }

  let legalStatusSpoofBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet
       (decision_packet_id,user_id,security_entity_id,user_profile_revision_id,portfolio_snapshot_id,
        common_view_kind,common_view_key,common_view_digest,common_view_as_of,action,action_reason,
        expires_at,legal_review_status,engine_version,packet_digest,generated_at)
       VALUES ('80000000-0000-4000-8000-000000000008',$1,1,
        '30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004',
        'sealed-research','KR:TEST',$2,'2026-07-22T00:00:00Z','HOLD','승인 우회 검증',
        '2026-07-23T00:00:00Z','approved_read_only','rules-v1',$3,'2026-07-22T00:02:00Z')`,
      [userA, 'f'.repeat(64), '1'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    legalStatusSpoofBlocked = true;
    await target.query('ROLLBACK');
  }

  let appWriterReviewBlocked = false;
  try {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_writer');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userA]);
    await target.query(
      `INSERT INTO personalization.decision_packet_legal_review
       (decision_packet_legal_review_id,decision_packet_id,user_id,review_status,reviewer_ref,review_note,reviewed_at,review_digest)
       VALUES ('90000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000005',$1,
        'approved_read_only','app-writer','금지된 승인','2026-07-22T01:00:00Z',$2)`,
      [userA, '2'.repeat(64)],
    );
    await target.query('COMMIT');
  } catch {
    appWriterReviewBlocked = true;
    await target.query('ROLLBACK');
  }

  await target.query(
    `INSERT INTO personalization.decision_packet_legal_review
     (decision_packet_legal_review_id,decision_packet_id,user_id,review_status,reviewer_ref,review_note,reviewed_at,review_digest)
     VALUES ('90000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000005',$1,
      'approved_read_only','independent-legal-review','읽기 전용 노출 승인','2026-07-22T01:00:00Z',$2)`,
    [userA, '2'.repeat(64)],
  );

  let sameTimeReviewBlocked = false;
  try {
    await target.query(
      `INSERT INTO personalization.decision_packet_legal_review
       (decision_packet_legal_review_id,decision_packet_id,user_id,review_status,reviewer_ref,review_note,reviewed_at,review_digest)
       VALUES ('91000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000005',$1,
        'rejected','independent-legal-review','동일 시각 충돌','2026-07-22T01:00:00Z',$2)`,
      [userA, '3'.repeat(64)],
    );
  } catch {
    sameTimeReviewBlocked = true;
  }

  let backdatedReviewBlocked = false;
  try {
    await target.query(
      `INSERT INTO personalization.decision_packet_legal_review
       (decision_packet_legal_review_id,decision_packet_id,user_id,review_status,reviewer_ref,review_note,reviewed_at,review_digest)
       VALUES ('92000000-0000-4000-8000-000000000009','50000000-0000-4000-8000-000000000005',$1,
        'rejected','independent-legal-review','생성 전 검토','2026-07-21T23:59:59Z',$2)`,
      [userA, '4'.repeat(64)],
    );
  } catch {
    backdatedReviewBlocked = true;
  }

  async function visibleReviewCount(userId) {
    await target.query('BEGIN');
    await target.query('SET LOCAL ROLE stock_insight_reader');
    await target.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userId]);
    const result = await target.query(
      'SELECT count(*)::int AS count FROM personalization.decision_packet_legal_review',
    );
    await target.query('COMMIT');
    return result.rows[0].count;
  }
  const ownReviewVisible = await visibleReviewCount(userA);
  const otherReviewVisible = await visibleReviewCount(userB);

  let mutationBlocked = false;
  try {
    await target.query(
      `UPDATE personalization.decision_packet SET action_reason='변조' WHERE decision_packet_id='50000000-0000-4000-8000-000000000005'`,
    );
  } catch {
    mutationBlocked = true;
  }

  const hardening = await target.query(
    `
    SELECT
      count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity)::int AS forced_rls,
      count(*)::int AS table_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='personalization' AND c.relname = ANY($1::text[])
  `,
    [
      [
        'user_profile_revision',
        'portfolio_snapshot',
        'portfolio_lot_snapshot',
        'portfolio_snapshot_seal',
        'thesis_revision',
        'decision_packet',
        'decision_packet_legal_review',
      ],
    ],
  );
  const reverseLinks = await target.query(`
    SELECT count(*)::int AS count
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid=fk.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace
    JOIN pg_class target_table ON target_table.oid=fk.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid=target_table.relnamespace
    WHERE fk.contype='f' AND target_ns.nspname='personalization' AND source_ns.nspname <> 'personalization'
  `);
  result = {
    ok:
      ownVisible === 1 &&
      otherVisible === 0 &&
      ownReviewVisible === 1 &&
      otherReviewVisible === 0 &&
      crossUserBlocked &&
      sealMismatchBlocked &&
      unsealedPacketBlocked &&
      lateLotBlocked &&
      backdatedPacketBlocked &&
      duplicatePacketTimeBlocked &&
      expiredProfilePacketBlocked &&
      supersededProfilePacketBlocked &&
      supersededThesisPacketBlocked &&
      orderPathBlocked &&
      futureCommonViewBlocked &&
      legalStatusSpoofBlocked &&
      appWriterReviewBlocked &&
      sameTimeReviewBlocked &&
      backdatedReviewBlocked &&
      forkBlocked &&
      skippedRevisionBlocked &&
      revisionState.rows[0].profile_count === 2 &&
      revisionState.rows[0].thesis_count === 2 &&
      revisionState.rows[0].profile_head_count === 1 &&
      revisionState.rows[0].thesis_head_count === 1 &&
      mutationBlocked &&
      hardening.rows[0].forced_rls === 7 &&
      hardening.rows[0].table_count === 7 &&
      reverseLinks.rows[0].count === 0,
    rounds: 2,
    migrationSha256,
    replayCountsStable,
    ownVisible,
    otherVisible,
    crossUserBlocked,
    sealMismatchBlocked,
    unsealedPacketBlocked,
    lateLotBlocked,
    backdatedPacketBlocked,
    duplicatePacketTimeBlocked,
    expiredProfilePacketBlocked,
    supersededProfilePacketBlocked,
    supersededThesisPacketBlocked,
    forkBlocked,
    skippedRevisionBlocked,
    profileRevisions: revisionState.rows[0].profile_count,
    thesisRevisions: revisionState.rows[0].thesis_count,
    profileHeads: revisionState.rows[0].profile_head_count,
    thesisHeads: revisionState.rows[0].thesis_head_count,
    orderPathBlocked,
    futureCommonViewBlocked,
    legalStatusSpoofBlocked,
    appWriterReviewBlocked,
    sameTimeReviewBlocked,
    backdatedReviewBlocked,
    ownReviewVisible,
    otherReviewVisible,
    mutationBlocked,
    forcedRls: hardening.rows[0].forced_rls,
    privateTables: hardening.rows[0].table_count,
    commonToPrivateForeignKeys: reverseLinks.rows[0].count,
    optionalThesisInsertAccepted: true,
  };
  if (!result.ok) throw new Error(`P4 rehearsal failed: ${JSON.stringify(result)}`);
} catch (error) {
  primaryError = error;
} finally {
  if (target) {
    try {
      await target.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
      [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoted}`);
    const residue = await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [databaseName]);
    if (residue.rowCount !== 0) {
      cleanupErrors.push(new Error('disposable rehearsal database still exists'));
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    let currentRoleState = await readRoleState();
    if (!roleStateBefore.writer_existed && currentRoleState.writer_existed) {
      await admin.query('DROP ROLE stock_insight_writer');
    }
    currentRoleState = await readRoleState();
    if (!roleStateBefore.reader_existed && currentRoleState.reader_existed) {
      await admin.query('DROP ROLE stock_insight_reader');
    }
    const roleStateAfter = await readRoleState();
    roleStateRestored =
      roleStateAfter.reader_existed === roleStateBefore.reader_existed &&
      roleStateAfter.writer_existed === roleStateBefore.writer_existed &&
      roleStateAfter.membership_existed === roleStateBefore.membership_existed &&
      JSON.stringify(roleStateAfter.membership_state) ===
        JSON.stringify(roleStateBefore.membership_state);
    if (!roleStateRestored) throw new Error('rehearsal cluster role state was not restored');
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await admin.end();
  } catch (error) {
    cleanupErrors.push(error);
  }
}
if (result) result.roleStateRestored = roleStateRestored;
const failures = primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors;
if (failures.length > 0) throw new AggregateError(failures, 'P4 rehearsal or cleanup failed');
if (!result) throw new Error('P4 rehearsal produced no result');
console.log(JSON.stringify(result));
