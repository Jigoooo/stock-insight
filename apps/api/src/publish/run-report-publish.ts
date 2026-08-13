import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import { publicBlockTypeForVerification } from './truth-gate.ts';
import { buildKnowledgeSnapshotId } from '../ingest/knowledge-revision-contract.ts';
import { containsActionAdvice } from '../shared/action-advice.ts';

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

export const RECENT_EVENTS_SQL = `
SELECT event.event_id, event.event_type, event.summary_text, event.occurred_at,
       event.verification_status,
       event.source_document_id, entity.canonical_name AS target_name,
       document.title AS document_title, document.canonical_url,
       evidence.chunk_id, chunk.revision_no
FROM knowledge.event event
JOIN knowledge.event_evidence evidence
  ON evidence.event_id=event.event_id
 AND evidence.document_id=event.source_document_id
JOIN knowledge.document_chunk chunk
  ON chunk.chunk_id=evidence.chunk_id
 AND chunk.document_id=evidence.document_id
JOIN knowledge.document document ON document.document_id = event.source_document_id
LEFT JOIN core.entity entity ON entity.entity_id = event.target_entity_id
WHERE event.source_document_id IS NOT NULL
  AND document.processing_status='extracted'
  AND chunk.revision_no = coalesce(
    CASE WHEN document.metadata ->> 'revision_no' ~ '^[1-9][0-9]*$'
      THEN (document.metadata ->> 'revision_no')::integer END,
    1
  )
  AND event.created_at <= $1::timestamptz
  AND document.available_at <= $1::timestamptz
  AND chunk.available_at <= $1::timestamptz
  AND chunk.ingested_at <= $1::timestamptz
  AND coalesce(event.occurred_at, event.created_at) <= $1::timestamptz
  AND coalesce(event.occurred_at, event.created_at) >= $1::timestamptz - interval '7 days'
ORDER BY coalesce(event.occurred_at, event.created_at) DESC
LIMIT $2
`;

export const RECENT_CLAIMS_SQL = `
SELECT claim.claim_id, claim.predicate, claim.claim_type, claim.object_value,
       claim.extraction_confidence, subject.canonical_name AS subject_name,
       evidence.quote, evidence.document_id, evidence.chunk_id, chunk.revision_no
FROM knowledge.claim claim
JOIN core.entity subject ON subject.entity_id = claim.subject_entity_id
JOIN knowledge.claim_evidence evidence ON evidence.claim_id = claim.claim_id
JOIN knowledge.document_chunk chunk
  ON chunk.chunk_id=evidence.chunk_id
 AND chunk.document_id=evidence.document_id
JOIN knowledge.document document ON document.document_id=evidence.document_id
WHERE claim.observed_at <= $1::timestamptz
  AND claim.observed_at >= $1::timestamptz - interval '7 days'
  AND document.processing_status='extracted'
  AND chunk.revision_no = coalesce(
    CASE WHEN document.metadata ->> 'revision_no' ~ '^[1-9][0-9]*$'
      THEN (document.metadata ->> 'revision_no')::integer END,
    1
  )
  AND document.available_at <= $1::timestamptz
  AND chunk.available_at <= $1::timestamptz
  AND chunk.ingested_at <= $1::timestamptz
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

// The canonical gate, not a hand-rolled copy. Both of these files carried a
// comment saying they reused the production action-advice wording while actually
// running a cruder pattern that matched bare 매수/매도/추격/익절. That flagged
// 644 of 4,003 events as advice, including every insider-transaction disclosure
// ("삼성전기 임원 순매수 14,851,645주") and every circuit-breaker headline
// ("코스닥 매도 사이드카 발동") — market facts this product exists to surface.
// shared/action-advice.ts blocks 409: it still catches broker calls
// ("HD현대중공업 iM증권 목표가 860000 Buy") and every imperative form, because it
// matches 매수/매도 only when followed by 하세요·하라·추천·시점·타이밍·지시·신호,
// and it strips disclaimer wording before testing.

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
  chunk_id: string | number;
  revision_no: number;
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
  chunk_id: string | number;
  revision_no: number;
};

export type ReportBlock = {
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

/**
 * **두 종류의 위반을 구분한다.** 둘 다 하드 실패로 묶어 두면 하나가 전부를 막는다.
 *
 * 인용 없는 사실형 블록은 **우리 코드의 결함**이다. 그런 블록이 있다는 것은
 * 이 발행기가 잘못 조립했다는 뜻이고, 그 상태로 내보내면 근거 없는 문장이
 * 제품에 실린다. 계속 하드 실패다.
 *
 * 행동 조언 문구는 다르다. **수집한 원문에 들어 있는 것**이고, 그런 원문이
 * 들어오는 것은 결함이 아니라 예상된 입력이다. 2026-08-13 실측: 주장 블록
 * 137건 중 1건이 걸렸다("카카오 GUIDES — 목표가 하향"). `목표가` 는
 * CLAUDE.md 제품 경계가 이름으로 금지한 낱말이므로 게이트 판정은 옳다.
 *
 * 그런데 그 1건이 **682건(주장 137 + 이벤트 545)을 통째로 막았다.** 리포트가
 * 한 줄도 발행되지 않고, 파이프라인이 거기서 끝나 뒤따르는 단계가 전부 멈춘다.
 * 계획서가 기록한 2026-08-03 사고와 같은 모양이다 — 그때는 v2 발행을 앞으로
 * 옮겨 그래프가 함께 죽는 것만 막았고, 리포트 자체는 이 상태로 남았다.
 *
 * 제외로 바꾸어도 **보호력은 그대로다** — 금지 문구는 여전히 제품에 닿지 않는다.
 * 바뀌는 것은 폭발 반경뿐이다.
 *
 * 그리고 조용히 버리지 않는다(REQ-SRC-001). 제외한 수를 돌려주어 발행물이
 * 스스로 "몇 건을 뺐다" 고 말하게 한다.
 */
export function partitionBlocks(blocks: ReportBlock[]): {
  kept: ReportBlock[];
  excludedForAdvice: number;
  failures: string[];
} {
  const failures: string[] = [];
  const kept: ReportBlock[] = [];
  let excludedForAdvice = 0;
  for (const block of blocks) {
    if (['fact', 'reported_claim'].includes(block.block_type) && block.citation_ids.length === 0) {
      failures.push(`${block.block_id}: fact-type block without citation`);
      continue;
    }
    if (containsActionAdvice(block.text)) {
      excludedForAdvice += 1;
      continue;
    }
    kept.push(block);
  }
  return { kept, excludedForAdvice, failures };
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SEED_DEFINITION_SQL);
    const definition = await client.query<QueryResultRow & { report_definition_id: number }>(
      DEFINITION_SQL,
    );
    await client.query('COMMIT');
    const definitionId = definition.rows[0]?.report_definition_id;
    if (definitionId === undefined) throw new Error('daily_market_stock definition missing');

    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const cutoff = await client.query<QueryResultRow & { as_of: string | Date }>(
      'SELECT clock_timestamp() AS as_of',
    );
    const asOf = new Date(cutoff.rows[0]!.as_of);
    const scheduledFor = new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
    );
    const events = await client.query<EventRow>(RECENT_EVENTS_SQL, [asOf.toISOString(), 12]);
    const claims = await client.query<ClaimRow>(RECENT_CLAIMS_SQL, [asOf.toISOString(), 8]);
    await client.query('COMMIT');
    const knowledgeSnapshotId = buildKnowledgeSnapshotId(asOf.toISOString(), [
      ...events.rows.map((event) => ({
        kind: 'event' as const,
        id: event.event_id,
        chunkId: event.chunk_id,
        revisionNo: event.revision_no,
      })),
      ...claims.rows.map((claim) => ({
        kind: 'claim' as const,
        id: claim.claim_id,
        chunkId: claim.chunk_id,
        revisionNo: claim.revision_no,
      })),
    ]);

    // Build structured payload (template generator — LLM narration lands later).
    const citationMap: Record<
      string,
      { document_id: number; url: string | null; title: string | null }
    > = {};
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
        text: `[${event.event_type}] ${event.target_name ?? '시장 전반'} — ${(
          event.summary_text ??
          event.document_title ??
          ''
        ).slice(0, 300)}`,
        citation_ids: [citationId],
        confidence: event.verification_status === 'verified' ? 0.9 : 0.6,
      };
    });
    const claimBlocks: ReportBlock[] = claims.rows.map((claim, index) => {
      const citationId = `cit-c${index + 1}`;
      citationMap[citationId] = {
        document_id: Number(claim.document_id),
        url: null,
        title: claim.quote,
      };
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
    // 제외 판정을 **본문 블록에만** 돌린다. 안내문은 아래에서 그 결과를 읽어
    // 스스로를 서술하므로, 자기 자신을 세는 순환에 넣지 않는다.
    const partitioned = partitionBlocks([...eventBlocks, ...claimBlocks]);
    const keptEvents = partitioned.kept.filter((block) => block.block_id.startsWith('verified_'));
    const keptClaims = partitioned.kept.filter((block) =>
      block.block_id.startsWith('watch_claims'),
    );
    const gateFailures = partitioned.failures;

    // 뺀 것을 발행물이 스스로 말한다(REQ-SRC-001). 조용히 줄어든 목록은
    // "그런 주장이 없었다" 로 읽히고, 그건 사실에 대한 거짓 진술이다.
    const excludedNote =
      partitioned.excludedForAdvice > 0
        ? ` 원문에 매매 판단 표현이 들어 있어 ${partitioned.excludedForAdvice}건은 싣지 않았습니다.`
        : '';
    const noteBlock: ReportBlock = {
      block_id: 'coverage_note-1',
      block_type: 'methodology_note',
      text: `검증 이벤트 ${keptEvents.length}건·보고된 주장 ${keptClaims.length}건. 모든 사실형 문장은 원문 인용을 가진다. 투자 판단·주문 지시가 아니라 변화 기록이다.${excludedNote}`,
      citation_ids: [],
      confidence: 1,
    };

    const payload = {
      title: `일일 주식 지식 리포트 ${scheduledFor.toISOString().slice(0, 10)}`,
      thesis: '지식 계층(문서→이벤트/주장)에서 검증 가능한 변화만 발행한다.',
      sections: [
        { section_key: 'verified_events', blocks: keptEvents },
        { section_key: 'watch_claims', blocks: keptClaims },
        { section_key: 'coverage_note', blocks: [noteBlock] },
      ],
      citation_map: citationMap,
      freshness: { knowledge: asOf.toISOString() },
    };
    const contentHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const audit = {
      events: keptEvents.length,
      claims: keptClaims.length,
      excludedForAdvice: partitioned.excludedForAdvice,
      gateFailures,
      contentHash: contentHash.slice(0, 16),
    };

    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', jobName: JOB_NAME, audit }, null, 2));
      return;
    }
    // 제외 **후**를 센다. 전부 제외돼 빈 리포트가 되는 경우를 빈 발행으로
    // 잡아야 하고, 제외 전 개수로 재면 그 상황이 통과한다.
    if (keptEvents.length === 0) {
      throw new Error('No recent document-backed events; refusing empty publish');
    }
    if (gateFailures.length > 0) {
      throw new Error(`Hard gate failures: ${gateFailures.join('; ')}`);
    }

    await client.query('BEGIN');
    await client.query("SELECT set_config('statement_timeout', '120s', true)");
    const runRow = await client.query<QueryResultRow & { report_run_id: number }>(INSERT_RUN_SQL, [
      definitionId,
      scheduledFor.toISOString(),
      knowledgeSnapshotId,
      PIPELINE_VERSION,
    ]);
    const reportRunId = runRow.rows[0]!.report_run_id;
    const reportRow = await client.query<QueryResultRow & { report_id: number }>(
      INSERT_REPORT_SQL,
      [reportRunId, payload.title, payload.thesis, JSON.stringify(payload), 1.0, contentHash],
    );
    const reportId = reportRow.rows[0]!.report_id;
    let citationOrder = 0;
    for (const event of events.rows) {
      citationOrder += 1;
      await client.query(INSERT_EVIDENCE_SQL, [
        reportId,
        'verified_events',
        'event',
        Number(event.event_id),
        citationOrder,
      ]);
      await client.query(INSERT_EVIDENCE_SQL, [
        reportId,
        'verified_events',
        'document',
        Number(event.source_document_id),
        citationOrder,
      ]);
    }
    for (const claim of claims.rows) {
      citationOrder += 1;
      await client.query(INSERT_EVIDENCE_SQL, [
        reportId,
        'watch_claims',
        'claim',
        Number(claim.claim_id),
        citationOrder,
      ]);
      await client.query(INSERT_EVIDENCE_SQL, [
        reportId,
        'watch_claims',
        'document',
        Number(claim.document_id),
        citationOrder,
      ]);
    }
    // Atomic publish: supersede old target, publish new, swap pointer — one transaction.
    await client.query(SUPERSEDE_SQL, [reportId]);
    await client.query(PUBLISH_SQL, [reportId]);
    await client.query(SWAP_POINTER_SQL, [reportId]);
    await client.query(CLOSE_RUN_SQL, [reportRunId, 'published']);
    await client.query('COMMIT');

    console.log(
      JSON.stringify({ mode: 'apply', jobName: JOB_NAME, reportId, reportRunId, audit }, null, 2),
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
