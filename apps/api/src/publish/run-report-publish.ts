import { createHash } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { publicBlockTypeForVerification } from './truth-gate.ts';

// SET D / D-6: report publishing skeleton with atomic pointer switch.
// Seeds daily_market_stock definition v1, builds an evidence-first structured
// report from the knowledge layer (template generator, no LLM), validates hard
// gates, and publishes via draft -> validating -> approved -> published with
// serving.latest_report_pointer swapped in the same transaction (Baseline §11.7).

const JOB_NAME = 'stock-insight-report-publish';
const PIPELINE_VERSION = 'publish-v1';

const SEED_DEFINITION_SQL = `
INSERT INTO content.report_definition (report_type, audience_type, schedule_policy, section_policy, quality_policy, version)
VALUES (
  'daily_market_stock', 'global',
  '{"trigger": "manual", "cutoff_rule": "invocation_time"}'::jsonb,
  '{"sections": [
     {"key": "verified_events", "generator": "template", "required": true},
     {"key": "watch_claims", "generator": "template", "required": false},
     {"key": "coverage_note", "generator": "template", "required": true}
   ], "coverage_limits": {"events": 12, "claims": 8}}'::jsonb,
  '{"hard_gates": ["citation_coverage_for_facts", "no_action_advice", "cutoff_purity"],
    "publish_threshold": 0.8}'::jsonb,
  1
)
ON CONFLICT (report_type, version) DO NOTHING
RETURNING report_definition_id
`;

const DEFINITION_SQL = `
SELECT report_definition_id FROM content.report_definition
WHERE report_type = 'daily_market_stock' AND active AND version = 1
`;

const RECENT_EVENTS_SQL = `
SELECT event.event_id, event.event_type, event.summary_text, event.occurred_at,
       event.verification_status,
       event.source_document_id, entity.canonical_name AS target_name,
       document.title AS document_title, document.canonical_url
FROM knowledge.event event
LEFT JOIN core.entity entity ON entity.entity_id = event.target_entity_id
LEFT JOIN knowledge.document document ON document.document_id = event.source_document_id
WHERE event.source_document_id IS NOT NULL
  AND coalesce(event.occurred_at, event.created_at) <= $1::timestamptz
  AND coalesce(event.occurred_at, event.created_at) >= $1::timestamptz - interval '7 days'
ORDER BY coalesce(event.occurred_at, event.created_at) DESC
LIMIT $2
`;

const RECENT_CLAIMS_SQL = `
SELECT claim.claim_id, claim.predicate, claim.claim_type, claim.object_value,
       claim.extraction_confidence, subject.canonical_name AS subject_name,
       evidence.quote, evidence.document_id
FROM knowledge.claim claim
JOIN core.entity subject ON subject.entity_id = claim.subject_entity_id
JOIN knowledge.claim_evidence evidence ON evidence.claim_id = claim.claim_id
WHERE claim.observed_at <= $1::timestamptz
  AND claim.observed_at >= $1::timestamptz - interval '7 days'
  AND claim.verification_status <> 'untrusted_legacy'
ORDER BY claim.observed_at DESC
LIMIT $2
`;

const INSERT_RUN_SQL = `
INSERT INTO content.report_run (
  report_definition_id, scheduled_for, as_of, data_cutoff, status,
  knowledge_snapshot_id, pipeline_version, started_at
) VALUES ($1, $2, $2, $2, 'running', $3, $4, now())
ON CONFLICT (report_definition_id, scheduled_for, pipeline_version)
DO UPDATE SET status = 'running',
              started_at = now(),
              finished_at = NULL,
              as_of = EXCLUDED.as_of,
              data_cutoff = EXCLUDED.data_cutoff,
              knowledge_snapshot_id = EXCLUDED.knowledge_snapshot_id
RETURNING report_run_id
`;

const INSERT_REPORT_SQL = `
INSERT INTO content.report (
  report_run_id, report_type, audience_key, title, summary, report_payload,
  status, quality_score, content_hash
) VALUES ($1, 'daily_market_stock', 'global', $2, $3, $4::jsonb, 'draft', $5, $6)
RETURNING report_id
`;

const INSERT_EVIDENCE_SQL = `
INSERT INTO content.report_evidence (report_id, section_key, evidence_type, evidence_id, citation_order)
VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
`;

const PUBLISH_SQL = `
UPDATE content.report SET status = 'published', published_at = now() WHERE report_id = $1
`;

const SUPERSEDE_SQL = `
UPDATE content.report SET status = 'superseded'
WHERE report_id = (
  SELECT report_id FROM serving.latest_report_pointer
  WHERE report_type = 'daily_market_stock' AND scope_key = 'global'
) AND report_id <> $1
`;

const SWAP_POINTER_SQL = `
INSERT INTO serving.latest_report_pointer (report_type, scope_key, report_id)
VALUES ('daily_market_stock', 'global', $1)
ON CONFLICT (report_type, scope_key) DO UPDATE SET report_id = $1, switched_at = now()
`;

const CLOSE_RUN_SQL = `
UPDATE content.report_run SET status = $2, finished_at = now() WHERE report_run_id = $1
`;

// Reuse the production action-advice gate wording (advice text must never publish).
const ACTION_ADVICE_PATTERN =
  /(매수|매도|사세요|파세요|팔아라|사라|추격|익절|손절하세요|buy now|sell now|strong buy)/i;

type EventRow = QueryResultRow & {
  event_id: string | number;
  event_type: string;
  summary_text: string | null;
  occurred_at: string | Date | null;
  verification_status: string;
  source_document_id: string | number | null;
  target_name: string | null;
  document_title: string | null;
  canonical_url: string | null;
};

type ClaimRow = QueryResultRow & {
  claim_id: string | number;
  predicate: string;
  claim_type: string;
  object_value: unknown;
  extraction_confidence: number | null;
  subject_name: string;
  quote: string | null;
  document_id: string | number;
};

type ReportBlock = {
  block_id: string;
  block_type: 'fact' | 'reported_claim' | 'methodology_note';
  text: string;
  citation_ids: string[];
  confidence: number;
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

function validateBlocks(blocks: ReportBlock[]): string[] {
  const failures: string[] = [];
  for (const block of blocks) {
    if (['fact', 'reported_claim'].includes(block.block_type) && block.citation_ids.length === 0) {
      failures.push(`${block.block_id}: fact-type block without citation`);
    }
    if (ACTION_ADVICE_PATTERN.test(block.text)) {
      failures.push(`${block.block_id}: action-advice wording`);
    }
  }
  return failures;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const asOf = new Date();
  const scheduledFor = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SEED_DEFINITION_SQL);
    const definition = await client.query<QueryResultRow & { report_definition_id: number }>(DEFINITION_SQL);
    await client.query('COMMIT');
    const definitionId = definition.rows[0]?.report_definition_id;
    if (definitionId === undefined) throw new Error('daily_market_stock definition missing');

    await client.query('BEGIN READ ONLY');
    const events = await client.query<EventRow>(RECENT_EVENTS_SQL, [asOf.toISOString(), 12]);
    const claims = await client.query<ClaimRow>(RECENT_CLAIMS_SQL, [asOf.toISOString(), 8]);
    await client.query('COMMIT');

    // Build structured payload (template generator — LLM narration lands later).
    const citationMap: Record<string, { document_id: number; url: string | null; title: string | null }> = {};
    const eventBlocks: ReportBlock[] = events.rows.map((event, index) => {
      const citationId = `cit-e${index + 1}`;
      citationMap[citationId] = {
        document_id: Number(event.source_document_id),
        url: event.canonical_url,
        title: event.document_title,
      };
      return {
        block_id: `verified_events-${index + 1}`,
        block_type: publicBlockTypeForVerification(event.verification_status),
        text: `[${event.event_type}] ${event.target_name ?? '시장 전반'} — ${
          (event.summary_text ?? event.document_title ?? '').slice(0, 300)
        }`,
        citation_ids: [citationId],
        confidence: event.verification_status === 'verified' ? 0.9 : 0.6,
      };
    });
    const claimBlocks: ReportBlock[] = claims.rows.map((claim, index) => {
      const citationId = `cit-c${index + 1}`;
      citationMap[citationId] = { document_id: Number(claim.document_id), url: null, title: claim.quote };
      const objectText =
        typeof claim.object_value === 'object' && claim.object_value !== null
          ? String((claim.object_value as { text?: string }).text ?? '')
          : String(claim.object_value ?? '');
      return {
        block_id: `watch_claims-${index + 1}`,
        block_type: 'reported_claim',
        text: `${claim.subject_name} ${claim.predicate} — ${objectText.slice(0, 240)} (${claim.claim_type})`,
        citation_ids: [citationId],
        confidence: claim.extraction_confidence ?? 0.5,
      };
    });
    const noteBlock: ReportBlock = {
      block_id: 'coverage_note-1',
      block_type: 'methodology_note',
      text: `검증 이벤트 ${eventBlocks.length}건·보고된 주장 ${claimBlocks.length}건. 모든 사실형 문장은 원문 인용을 가진다. 투자 판단·주문 지시가 아니라 변화 기록이다.`,
      citation_ids: [],
      confidence: 1,
    };

    const allBlocks = [...eventBlocks, ...claimBlocks, noteBlock];
    const gateFailures = validateBlocks(allBlocks);
    const payload = {
      title: `일일 주식 지식 리포트 ${scheduledFor.toISOString().slice(0, 10)}`,
      thesis: '지식 계층(문서→이벤트/주장)에서 검증 가능한 변화만 발행한다.',
      sections: [
        { section_key: 'verified_events', blocks: eventBlocks },
        { section_key: 'watch_claims', blocks: claimBlocks },
        { section_key: 'coverage_note', blocks: [noteBlock] },
      ],
      citation_map: citationMap,
      freshness: { knowledge: asOf.toISOString() },
    };
    const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const audit = {
      events: eventBlocks.length,
      claims: claimBlocks.length,
      gateFailures,
      contentHash: contentHash.slice(0, 16),
    };

    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', jobName: JOB_NAME, audit }, null, 2));
      return;
    }
    if (eventBlocks.length === 0) throw new Error('No verified events; refusing empty publish');
    if (gateFailures.length > 0) {
      throw new Error(`Hard gate failures: ${gateFailures.join('; ')}`);
    }

    const knowledgeSnapshotId = `knowledge@${asOf.toISOString()}`;
    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '120s', true)");
    const runRow = await client.query<QueryResultRow & { report_run_id: number }>(INSERT_RUN_SQL, [
      definitionId,
      scheduledFor.toISOString(),
      knowledgeSnapshotId,
      PIPELINE_VERSION,
    ]);
    const reportRunId = runRow.rows[0]!.report_run_id;
    const reportRow = await client.query<QueryResultRow & { report_id: number }>(INSERT_REPORT_SQL, [
      reportRunId,
      payload.title,
      payload.thesis,
      JSON.stringify(payload),
      1.0,
      contentHash,
    ]);
    const reportId = reportRow.rows[0]!.report_id;
    let citationOrder = 0;
    for (const event of events.rows) {
      citationOrder += 1;
      await client.query(INSERT_EVIDENCE_SQL, [reportId, 'verified_events', 'event', Number(event.event_id), citationOrder]);
      await client.query(INSERT_EVIDENCE_SQL, [reportId, 'verified_events', 'document', Number(event.source_document_id), citationOrder]);
    }
    for (const claim of claims.rows) {
      citationOrder += 1;
      await client.query(INSERT_EVIDENCE_SQL, [reportId, 'watch_claims', 'claim', Number(claim.claim_id), citationOrder]);
      await client.query(INSERT_EVIDENCE_SQL, [reportId, 'watch_claims', 'document', Number(claim.document_id), citationOrder]);
    }
    // Atomic publish: supersede old target, publish new, swap pointer — one transaction.
    await client.query(SUPERSEDE_SQL, [reportId]);
    await client.query(PUBLISH_SQL, [reportId]);
    await client.query(SWAP_POINTER_SQL, [reportId]);
    await client.query(CLOSE_RUN_SQL, [reportRunId, 'published']);
    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        { mode: 'apply', jobName: JOB_NAME, reportId, reportRunId, audit }, null, 2),
    );
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
