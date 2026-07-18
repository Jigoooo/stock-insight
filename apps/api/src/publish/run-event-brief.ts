import { createHash, randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET F / F-4: incremental event-brief trigger (Baseline §7.4/§14.5 skeleton).
// Detects high-importance document-backed events in the last 24h and publishes
// per-entity event briefs through the same atomic pointer mechanism
// (report_type='event_brief', scope_key=entity internal key).
// editorial_importance = event_strength * doc_bonus * affected_paths_bonus * freshness

const JOB_NAME = 'stock-insight-event-brief';
const PIPELINE_VERSION = 'event-brief-v1';
const IMPORTANCE_THRESHOLD = 0.55;
const MAX_BRIEFS_PER_RUN = 5;

const SEED_DEFINITION_SQL = `
INSERT INTO content.report_definition (report_type, audience_type, schedule_policy, section_policy, quality_policy, version)
VALUES (
  'event_brief', 'targeted',
  '{"trigger": "importance_threshold", "window": "24h"}'::jsonb,
  '{"sections": [{"key": "what_happened", "generator": "template", "required": true},
                 {"key": "linked_assets", "generator": "template", "required": false}]}'::jsonb,
  '{"hard_gates": ["citation_coverage_for_facts", "no_action_advice"]}'::jsonb,
  1
)
ON CONFLICT (report_type, version) DO NOTHING
`;

const DEFINITION_SQL = `
SELECT report_definition_id FROM content.report_definition
WHERE report_type = 'event_brief' AND active AND version = 1
`;

const CANDIDATE_EVENTS_SQL = `
SELECT event.event_id, event.event_type, event.summary_text,
       coalesce(event.occurred_at, event.created_at) AS occurred_at,
       event.source_document_id,
       document.title AS document_title, document.canonical_url,
       entity.entity_id AS target_entity_id, entity.canonical_name AS target_name,
       target_ident.identifier_value AS target_key,
       (SELECT count(*)::int FROM analytics.impact_path path
         WHERE path.trigger_event_id = event.event_id AND path.expires_at > now()) AS path_count
FROM knowledge.event event
JOIN knowledge.document document ON document.document_id = event.source_document_id
LEFT JOIN core.entity entity ON entity.entity_id = event.target_entity_id
LEFT JOIN core.entity_identifier target_ident
  ON target_ident.entity_id = entity.entity_id AND target_ident.identifier_type = 'INTERNAL_KEY'
WHERE event.source_document_id IS NOT NULL
  AND coalesce(event.occurred_at, event.created_at) >= now() - interval '24 hours'
  AND NOT EXISTS (
    SELECT 1 FROM content.report existing
    JOIN content.report_evidence evidence
      ON evidence.report_id = existing.report_id AND evidence.evidence_type = 'event'
    WHERE existing.report_type = 'event_brief' AND evidence.evidence_id = event.event_id
  )
ORDER BY occurred_at DESC
LIMIT 100
`;

const INSERT_RUN_SQL = `
INSERT INTO content.report_run (
  report_definition_id, scheduled_for, as_of, data_cutoff, status,
  knowledge_snapshot_id, pipeline_version, started_at
) VALUES ($1, $2, $2, $2, 'running', $3, $4, now())
ON CONFLICT (report_definition_id, scheduled_for, pipeline_version)
DO UPDATE SET status = 'running', started_at = now()
RETURNING report_run_id
`;

const INSERT_REPORT_SQL = `
INSERT INTO content.report (
  report_run_id, report_type, scope_entity_id, audience_key, title, summary,
  report_payload, status, quality_score, content_hash
) VALUES ($1, 'event_brief', $2, 'global', $3, $4, $5::jsonb, 'draft', 1.0, $6)
RETURNING report_id
`;

const INSERT_EVIDENCE_SQL = `
INSERT INTO content.report_evidence (report_id, section_key, evidence_type, evidence_id, citation_order)
VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
`;

const PUBLISH_AND_POINT_SQL = `
WITH published AS (
  UPDATE content.report SET status = 'published', published_at = now()
  WHERE report_id = $1 RETURNING report_id
), superseded AS (
  UPDATE content.report SET status = 'superseded'
  WHERE report_id = (SELECT report_id FROM serving.latest_report_pointer
                     WHERE report_type = 'event_brief' AND scope_key = $2)
    AND report_id <> $1
)
INSERT INTO serving.latest_report_pointer (report_type, scope_key, report_id)
VALUES ('event_brief', $2, $1)
ON CONFLICT (report_type, scope_key) DO UPDATE SET report_id = $1, switched_at = now()
`;

const CLOSE_RUN_SQL = `
UPDATE content.report_run SET status = 'published', finished_at = now() WHERE report_run_id = $1
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id, job_name, source_system, status, started_at, finished_at,
  rows_read, rows_written, rows_skipped, error, summary
) VALUES ($1, $2, 'derived', 'completed', $3, $4, $5, $6, $7, NULL, $8::jsonb)
`;

const ACTION_ADVICE_PATTERN =
  /(매수|매도|사세요|파세요|팔아라|사라|추격|익절|손절하세요|buy now|sell now|strong buy)/i;

type EventRow = QueryResultRow & {
  event_id: string | number;
  event_type: string;
  summary_text: string | null;
  occurred_at: Date;
  source_document_id: string | number;
  document_title: string | null;
  canonical_url: string | null;
  target_entity_id: string | number | null;
  target_name: string | null;
  target_key: string | null;
  path_count: number;
};

type PgModule = {
  Pool: new (options: { connectionString: string; max?: number }) => {
    connect: () => Promise<PoolClient>;
    end: () => Promise<void>;
  };
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function importance(event: EventRow): number {
  const typeWeight: Record<string, number> = {
    ma_deal: 1.0, capex_increase: 0.95, regulation: 0.9, supply_disruption: 0.95,
    earnings: 0.85, legal_action: 0.8, ipo_listing: 0.75, macro_shock: 0.9,
    product_launch: 0.7, buyback_dividend: 0.7,
  };
  const base = typeWeight[event.event_type] ?? 0.5;
  const pathBonus = Math.min(0.2, event.path_count * 0.02);
  const ageHours = (Date.now() - event.occurred_at.getTime()) / 3_600_000;
  const freshness = Math.exp(-Math.LN2 * (ageHours / 24));
  return base * (1 + pathBonus) * freshness;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const asOf = new Date();
  const startedAt = new Date();

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SEED_DEFINITION_SQL);
    const definition = await client.query<QueryResultRow & { report_definition_id: number }>(DEFINITION_SQL);
    await client.query('COMMIT');
    const definitionId = definition.rows[0]?.report_definition_id;
    if (definitionId === undefined) throw new Error('event_brief definition missing');

    await client.query('BEGIN READ ONLY');
    const candidates = await client.query<EventRow>(CANDIDATE_EVENTS_SQL);
    await client.query('COMMIT');

    const scored = candidates.rows
      .map((event) => ({ event, score: importance(event) }))
      .filter((entry) => entry.score >= IMPORTANCE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_BRIEFS_PER_RUN);

    const summary = {
      window: '24h',
      candidates: candidates.rows.length,
      aboveThreshold: scored.length,
      threshold: IMPORTANCE_THRESHOLD,
      briefs: [] as Array<{ eventId: number; score: number; scope: string }>,
    };

    if (!apply) {
      summary.briefs = scored.map((entry) => ({
        eventId: Number(entry.event.event_id),
        score: Number(entry.score.toFixed(3)),
        scope: entry.event.target_key ?? 'global',
      }));
      console.log(JSON.stringify({ mode: 'dry-run', readOnly: true, audit: summary }, null, 2));
      return;
    }

    let published = 0;
    for (const entry of scored) {
      const event = entry.event;
      const scopeKey = event.target_key ?? 'global';
      const text = (event.summary_text ?? event.document_title ?? '').slice(0, 400);
      if (ACTION_ADVICE_PATTERN.test(text)) continue; // hard gate
      const payload = {
        title: `[속보] ${event.target_name ?? '시장'} — ${event.event_type}`,
        thesis: text,
        sections: [
          {
            section_key: 'what_happened',
            blocks: [{
              block_id: 'what_happened-1', block_type: 'fact', text,
              citation_ids: ['cit-1'], confidence: 0.9,
            }],
          },
        ],
        citation_map: {
          'cit-1': {
            document_id: Number(event.source_document_id),
            url: event.canonical_url,
            title: event.document_title,
          },
        },
        importance: Number(entry.score.toFixed(3)),
        freshness: { knowledge: asOf.toISOString() },
      };
      const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '60s', true)");
      const runRow = await client.query<QueryResultRow & { report_run_id: number }>(INSERT_RUN_SQL, [
        definitionId, asOf.toISOString(), `knowledge@${asOf.toISOString()}`, `${PIPELINE_VERSION}:${event.event_id}`,
      ]);
      const reportRunId = runRow.rows[0]!.report_run_id;
      const reportRow = await client.query<QueryResultRow & { report_id: number }>(INSERT_REPORT_SQL, [
        reportRunId,
        event.target_entity_id === null ? null : Number(event.target_entity_id),
        payload.title,
        payload.thesis || payload.title,
        JSON.stringify(payload),
        contentHash,
      ]);
      const reportId = reportRow.rows[0]!.report_id;
      await client.query(INSERT_EVIDENCE_SQL, [reportId, 'what_happened', 'event', Number(event.event_id), 1]);
      await client.query(INSERT_EVIDENCE_SQL, [reportId, 'what_happened', 'document', Number(event.source_document_id), 1]);
      await client.query(PUBLISH_AND_POINT_SQL, [reportId, scopeKey]);
      await client.query(CLOSE_RUN_SQL, [reportRunId]);
      await client.query('COMMIT');
      published += 1;
      summary.briefs.push({
        eventId: Number(event.event_id), score: Number(entry.score.toFixed(3)), scope: scopeKey,
      });
    }

    await client.query(INSERT_MIGRATION_RUN_SQL, [
      `event-brief-${randomUUID()}`,
      JOB_NAME,
      startedAt.toISOString(),
      new Date().toISOString(),
      candidates.rows.length,
      published,
      scored.length - published,
      JSON.stringify(summary),
    ]);
    console.log(JSON.stringify({ mode: 'apply', jobName: JOB_NAME, published, audit: summary }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original failure.
    }
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

await run();
