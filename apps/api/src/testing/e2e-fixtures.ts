import { randomUUID } from 'node:crypto';

import pg, { type PoolClient } from 'pg';

const { Pool } = pg;
const ADVISORY_LOCK_NAME = 'stock-insight-authenticated-e2e-fixtures';
const FEED_REASON_PREFIX = 'e2e-release-v3-feed:';
const HISTORY_PREFIX = 'e2e-release-v3-history:';
const USER_EXTERNAL_REF_PREFIX = 'e2e-release-v3-user:';

type FixtureLease = {
  client: PoolClient;
  pool: InstanceType<typeof Pool>;
  runToken: string;
  userId: string;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for authenticated E2E fixtures`);
  return value;
}

function fixtureConnectionString(): string {
  return requiredEnvironment('PLAYWRIGHT_FIXTURE_DATABASE_URL');
}

function fixtureExternalRef(userId: string): string {
  return `${USER_EXTERNAL_REF_PREFIX}${userId}`;
}

async function readFixtureOwner(client: PoolClient, userId: string) {
  return client.query<{ external_ref: string }>(
    `
      SELECT external_ref
      FROM public.app_users
      WHERE id = $1::uuid
      FOR UPDATE
    `,
    [userId],
  );
}

async function countUserRows(client: PoolClient, userId: string, fixtureOnly: boolean) {
  const feedPredicate = fixtureOnly ? `reason LIKE $2` : `(reason IS NULL OR reason NOT LIKE $2)`;
  const historyPredicate = fixtureOnly
    ? `history.entry_key LIKE $3`
    : `(history.entry_key IS NULL OR history.entry_key NOT LIKE $3)`;
  const result = await client.query<{ row_count: string }>(
    `
      WITH identity AS (
        SELECT legacy_user_id
        FROM public.app_user_identity_map
        WHERE user_id = $1::uuid
      )
      SELECT (
        SELECT count(*)
        FROM public.user_feed_index
        WHERE user_id = $1::uuid
          AND ${feedPredicate}
      ) + (
        SELECT count(*)
        FROM public.user_decision_journal_entries history
        JOIN identity ON identity.legacy_user_id = history.user_id
        WHERE ${historyPredicate}
      ) AS row_count
    `,
    [userId, `${FEED_REASON_PREFIX}%`, `${HISTORY_PREFIX}%`],
  );
  return Number(result.rows[0]?.row_count ?? 0);
}

async function assertFixtureUserOwnership(client: PoolClient, userId: string) {
  const owner = await readFixtureOwner(client, userId);
  const expectedExternalRef = fixtureExternalRef(userId);
  if (owner.rowCount === 0) {
    const existingRows = await countUserRows(client, userId, true);
    const nonFixtureRows = await countUserRows(client, userId, false);
    if (existingRows + nonFixtureRows > 0) {
      throw new Error('authenticated E2E fixture user has data without fixture ownership');
    }
    await client.query(
      `
        INSERT INTO public.app_users (id, external_ref, display_name, channel_type, raw_json)
        VALUES ($1::uuid, $2, 'E2E release user', 'e2e', '{"fixture":true}'::jsonb)
      `,
      [userId, expectedExternalRef],
    );
    return;
  }
  if (owner.rows[0]?.external_ref !== expectedExternalRef) {
    throw new Error('authenticated E2E fixture user ownership mismatch');
  }
  const nonFixtureRows = await countUserRows(client, userId, false);
  if (nonFixtureRows > 0) {
    throw new Error('authenticated E2E fixture user contains non-fixture data');
  }
}

async function deleteFixtureRows(client: PoolClient, userId: string) {
  await client.query(
    `
      DELETE FROM public.user_feed_index
      WHERE user_id = $1::uuid
        AND reason LIKE $2
    `,
    [userId, `${FEED_REASON_PREFIX}%`],
  );
  await client.query(
    `
      DELETE FROM public.user_decision_journal_entries history
      USING public.app_user_identity_map identity_map
      WHERE identity_map.user_id = $1::uuid
        AND history.user_id = identity_map.legacy_user_id
        AND history.entry_key LIKE $2
    `,
    [userId, `${HISTORY_PREFIX}%`],
  );
}

export async function acquireAuthenticatedE2eFixtureLease(): Promise<FixtureLease> {
  const pool = new Pool({ connectionString: fixtureConnectionString(), max: 1 });
  const client = await pool.connect();
  try {
    const result = await client.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtext($1)) AS acquired`,
      [ADVISORY_LOCK_NAME],
    );
    if (!result.rows[0]?.acquired) {
      throw new Error('authenticated E2E fixture lease is already held by another run');
    }
    return {
      client,
      pool,
      runToken: randomUUID(),
      userId: requiredEnvironment('STOCK_INSIGHT_E2E_USER_ID'),
    };
  } catch (error) {
    client.release();
    await pool.end();
    throw error;
  }
}

export async function releaseAuthenticatedE2eFixtureLease(lease: FixtureLease) {
  try {
    const result = await lease.client.query<{ released: boolean }>(
      `SELECT pg_advisory_unlock(hashtext($1)) AS released`,
      [ADVISORY_LOCK_NAME],
    );
    if (!result.rows[0]?.released) {
      throw new Error('authenticated E2E fixture lease ownership was lost');
    }
  } finally {
    lease.client.release();
    await lease.pool.end();
  }
}

export async function applyAuthenticatedE2eFixtures(lease: FixtureLease) {
  const { client, runToken, userId } = lease;
  const feedReason = `${FEED_REASON_PREFIX}${runToken}:`;
  const historyPrefix = `${HISTORY_PREFIX}${runToken}:`;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userId]);
    await assertFixtureUserOwnership(client, userId);
    await deleteFixtureRows(client, userId);

    const feed = await client.query(
      `
        WITH latest AS (
          SELECT analysis_run_id, analysis_revision, cutoff_at
          FROM ops.publication_projection_status
          WHERE domain = 'stock'
            AND projection_status IN ('available', 'stale')
          ORDER BY CASE projection_status WHEN 'available' THEN 0 ELSE 1 END,
                   cutoff_at DESC, analysis_revision DESC
          LIMIT 1
        ), latest_records AS (
          SELECT publication.id, publication.record_key, publication.entity_key,
                 publication.analysis_run_id, publication.analysis_revision,
                 coalesce(publication.published_at, publication.created_at) AS effective_at,
                 latest.cutoff_at
          FROM ops.internal_web_publication_records publication
          JOIN latest USING (analysis_run_id, analysis_revision)
        ), fallback_entity AS (
          SELECT entity_key
          FROM public.entities
          WHERE entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
          ORDER BY entity_key
          LIMIT 1
        ), resolved_records AS (
          SELECT latest_records.*,
                 CASE
                   WHEN latest_records.entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
                     THEN latest_records.entity_key
                   ELSE fallback_entity.entity_key
                 END AS watched_entity_key
          FROM latest_records
          CROSS JOIN fallback_entity
        ), positive_record AS (
          SELECT resolved_records.id, resolved_records.watched_entity_key
          FROM resolved_records
          WHERE EXISTS (
            SELECT 1
            FROM ops.analysis_run_record_source association
            JOIN ops.source_document_revision revision
              ON revision.source_key = association.source_key
             AND revision.known_at <= resolved_records.cutoff_at
            WHERE association.record_key = resolved_records.record_key
              AND association.analysis_run_id = resolved_records.analysis_run_id
              AND association.revision = resolved_records.analysis_revision
              AND association.lifecycle_state = 'active'
          )
          ORDER BY resolved_records.effective_at DESC, resolved_records.record_key
          LIMIT 1
        ), ranked_records AS (
          SELECT resolved_records.id, resolved_records.watched_entity_key,
                 row_number() OVER (
                   ORDER BY resolved_records.effective_at DESC, resolved_records.record_key
                 ) AS fixture_rank
          FROM resolved_records
          WHERE resolved_records.id <> (SELECT id FROM positive_record)
        ), fixture_rows AS (
          SELECT id AS record_id, watched_entity_key, 'direct'::text AS relevance_kind,
                 0 AS hops, 1::numeric AS relevance_score
          FROM positive_record
          UNION ALL
          SELECT id, watched_entity_key,
                 CASE WHEN fixture_rank <= 20 THEN 'related' ELSE 'indirect' END,
                 CASE WHEN fixture_rank <= 20 THEN 1 ELSE 2 END,
                 CASE
                   WHEN fixture_rank <= 20 THEN 0.9::numeric - fixture_rank * 0.005::numeric
                   ELSE 0.7::numeric - (fixture_rank - 20) * 0.005::numeric
                 END
          FROM ranked_records
          WHERE fixture_rank <= 80
        )
        INSERT INTO public.user_feed_index (
          user_id, record_id, watched_entity_key, relevance_kind, hops,
          relevance_score, path_keys, reason, built_at
        )
        SELECT
          $1::uuid, record_id, watched_entity_key, relevance_kind, hops,
          relevance_score, ARRAY[watched_entity_key], $2 || relevance_kind, clock_timestamp()
        FROM fixture_rows
        ON CONFLICT (user_id, record_id, watched_entity_key) DO NOTHING
        RETURNING record_id
      `,
      [userId, feedReason],
    );
    const history = await client.query(
      `
        WITH identity AS (
          SELECT legacy_user_id
          FROM public.app_user_identity_map
          WHERE user_id = $1::uuid
        ), fixture_entity AS (
          SELECT entity_key,
                 CASE WHEN entity_key LIKE 'US:%' THEN 'US' ELSE 'KR' END AS market
          FROM public.entities
          WHERE entity_key ~ '^(KR:[0-9]{6}|US:[A-Z][A-Z0-9]{0,7}([.-][A-Z0-9]{1,2})?)$'
          ORDER BY entity_key
          LIMIT 1
        )
        INSERT INTO public.user_decision_journal_entries (
          user_id, entry_key, entity_key, market, entry_type, title, thesis_text,
          evidence_json, source_kind, source_ref, occurred_at, review_due_at,
          status, advice_prohibited, created_at, updated_at
        )
        SELECT
          identity.legacy_user_id,
          $2 || series::text,
          fixture_entity.entity_key,
          fixture_entity.market,
          'manual_note',
          'E2E 판단 기록 ' || series::text,
          '판단 조건과 근거 연결 상태를 회귀 검증하는 격리 fixture',
          jsonb_build_object('sources', jsonb_build_array('fixture-source-' || series::text)),
          'e2e_fixture',
          $2 || series::text,
          clock_timestamp() - make_interval(mins => series),
          NULL,
          'open',
          true,
          clock_timestamp() - make_interval(mins => series),
          clock_timestamp()
        FROM identity
        CROSS JOIN fixture_entity
        CROSS JOIN generate_series(1, 43) series
        ON CONFLICT (user_id, entry_key) DO NOTHING
        RETURNING id
      `,
      [userId, historyPrefix],
    );
    if (feed.rowCount === 0) throw new Error('authenticated E2E fixture has no latest feed rows');
    if (history.rowCount !== 43) {
      throw new Error(
        `authenticated E2E fixture expected 43 history rows, received ${history.rowCount}`,
      );
    }
    await client.query('COMMIT');
    return { feedRows: feed.rowCount, historyRows: history.rowCount };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function cleanupAuthenticatedE2eFixtures(lease: FixtureLease) {
  const { client, userId } = lease;
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('stock_insight.user_id', $1, true)`, [userId]);
    await assertFixtureUserOwnership(client, userId);
    await deleteFixtureRows(client, userId);
    await client.query(
      `
        DELETE FROM public.app_users
        WHERE id = $1::uuid
          AND external_ref = $2
      `,
      [userId, fixtureExternalRef(userId)],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
