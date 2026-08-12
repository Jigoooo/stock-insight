import {
  planSpanVerification,
  type PlannedSpanVerification,
  type SpanVerificationCandidate,
  type SpanVerificationSkip,
} from './assertion-span-verification-plan.ts';

export type SpanVerificationArgs = {
  mode: 'dry-run' | 'apply';
  cutoff: string;
};

export type SpanVerificationSummary = {
  cutoff: string;
  mode: SpanVerificationArgs['mode'];
  extractionRunId: string;
  candidateCount: number;
  plannedCount: number;
  ruleCounts: Record<string, number>;
  skips: Record<string, number>;
  promotedCount: number | null;
};

type QueryClient = {
  query: <Row>(text: string, values?: readonly unknown[]) => Promise<{ rows: Row[] }>;
};

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseSpanVerificationArgs(argv: readonly string[]): SpanVerificationArgs {
  let cutoff: string | undefined;
  const modes: Array<SpanVerificationArgs['mode']> = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') {
      modes.push('apply');
      continue;
    }
    if (argument === '--dry-run') {
      modes.push('dry-run');
      continue;
    }
    if (argument === '--cutoff') {
      cutoff = valueAfter(argv, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`unknown span verification argument: ${String(argument)}`);
  }
  if (modes.length > 1) throw new Error('select exactly one span verification write mode');
  // REQ-PIT-003 — `now()` 는 업무 기준이 될 수 없다.
  if (!cutoff) throw new Error('span verification requires --cutoff');
  const parsed = new Date(cutoff);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== cutoff) {
    throw new Error('--cutoff must be a canonical ISO timestamp');
  }
  return { mode: modes[0] ?? 'dry-run', cutoff };
}

/**
 * **가장 최신 리비전만** 후보로 삼는다.
 *
 * 이 표는 append-only 이고 오늘까지 모든 키의 리비전이 1 뿐이었다. 그래서 지금까지
 * 모든 독자가 "키 하나 = 행 하나" 를 암묵적으로 전제하고도 옳았다. 이 생산자가
 * 리비전 2 를 처음 쓰는 쪽이라, 그 전제를 처음 깨뜨린다.
 *
 * 리비전 필터가 없으면 이 쿼리 자신이 두 번째 실행에서 죽는다: 리비전 1 은
 * 영원히 `extracted` 이므로 다시 후보가 되고, `revision_no = 2` 를 계산해
 * `UNIQUE (assertion_key, revision_no)` 에 부딪힌다. 승격이 실패가 아니라
 * **크래시**로 나타나는 셈이고, 원인은 다음 사람이 재구성하기 어렵다.
 *
 * 조각의 `available_at` 도 컷오프로 자른다 — 주장 자신의 시각만 보면 컷오프
 * 시점에 존재하지 않던 원문으로 대조하게 되고, 그것은 REQ-PIT-003 이 막으려는
 * 바로 그 미래 정보 사용이다.
 */
const CANDIDATE_SQL = `
  WITH latest AS (
    SELECT DISTINCT ON (assertion_key)
           assertion_id, assertion_key, revision_no, verification_state,
           literal_value->>'text' AS quoted_text,
           (source_span_locator->>'documentChunkId')::bigint AS chunk_id,
           available_at
      FROM knowledge.assertion
     WHERE modality IN ('forecast','alleged')
       AND available_at <= $1::timestamptz
     ORDER BY assertion_key, revision_no DESC
  )
  SELECT latest.assertion_id::text,
         latest.assertion_key,
         latest.revision_no,
         latest.quoted_text,
         latest.available_at::text,
         chunk.content AS chunk_content,
         chunk.content_hash AS chunk_content_hash
    FROM latest
    LEFT JOIN knowledge.document_chunk chunk
      ON chunk.chunk_id = latest.chunk_id
     AND chunk.available_at <= $1::timestamptz
   WHERE latest.verification_state = 'extracted'
   ORDER BY latest.assertion_key
`;

type CandidateRow = {
  assertion_id: string;
  assertion_key: string;
  revision_no: number;
  quoted_text: string | null;
  available_at: string;
  chunk_content: string | null;
  chunk_content_hash: string | null;
};

export async function loadSpanVerificationCandidates(
  client: QueryClient,
  options: { cutoff: string },
): Promise<SpanVerificationCandidate[]> {
  const rows = await client.query<CandidateRow>(CANDIDATE_SQL, [options.cutoff]);
  return rows.rows.map((row) => ({
    assertionId: Number(row.assertion_id),
    assertionKey: row.assertion_key,
    revisionNo: Number(row.revision_no),
    quotedText: row.quoted_text,
    chunkContent: row.chunk_content,
    chunkContentHash: row.chunk_content_hash,
    availableAt: row.available_at,
  }));
}

/**
 * 새 리비전은 이전 리비전을 **통째로 복사**하고 승격이 바꾸는 것만 덮어쓴다.
 * 열 목록을 손으로 적으면 표에 열이 하나 늘 때 조용히 null 이 들어간다 —
 * 이 표는 append-only 라 그렇게 들어간 null 은 되돌릴 수 없다.
 *
 * 덮어쓰는 것은 넷뿐이다:
 *
 * - `revision_no` / `supersedes_assertion_id` — 031 의 리비전 사슬 가드가 요구한다.
 * - `known_at` — 우리가 이 사실을 **안 시각**이 검증 시각이다. `available_at`(원문이
 *   나온 시각)은 그대로 둔다. 둘을 같이 옮기면 원문이 오늘 나온 것이 된다.
 * - `extraction_run_id` — 이 행은 추출 실행이 아니라 **검증 실행**의 산물이다.
 *   추출 실행 id 를 복사하면 원장이 "이 문장은 그때 뽑혔다" 고 말하게 되는데
 *   그때 뽑힌 것은 리비전 1 이다. `parser_version` 은 반대로 그대로 둔다 —
 *   내용을 다시 파싱한 적이 없기 때문이다.
 */
const PROMOTE_SQL = `
  INSERT INTO knowledge.assertion (
    assertion_key, revision_no, source_revision_id, subject_entity_id, predicate_key,
    predicate_ontology_revision_id, object_entity_id, literal_value, polarity, modality,
    attribution_entity_id, quotation_scope, valid_time_start, valid_time_end, published_at,
    available_at, known_at, source_span_locator, parser_version, extraction_run_id,
    verification_state, supersedes_assertion_id, metadata)
  SELECT previous.assertion_key, previous.revision_no + 1, previous.source_revision_id,
         previous.subject_entity_id, previous.predicate_key,
         previous.predicate_ontology_revision_id, previous.object_entity_id,
         previous.literal_value, previous.polarity, previous.modality,
         previous.attribution_entity_id, previous.quotation_scope,
         previous.valid_time_start, previous.valid_time_end, previous.published_at,
         previous.available_at, $2::timestamptz, previous.source_span_locator,
         previous.parser_version, $3,
         'verified_span', previous.assertion_id, previous.metadata || $4::jsonb
    FROM knowledge.assertion previous
   WHERE previous.assertion_id = $1::bigint
  ON CONFLICT (assertion_key, revision_no) DO NOTHING
  RETURNING assertion_id::text
`;

export function spanVerificationRunId(cutoff: string): string {
  return `span-verify:${cutoff}`;
}

export async function promoteSpanVerifications(
  client: QueryClient,
  plans: readonly PlannedSpanVerification[],
  options: { cutoff: string; extractionRunId: string },
): Promise<number> {
  let promoted = 0;
  for (const plan of plans) {
    const result = await client.query<{ assertion_id: string }>(PROMOTE_SQL, [
      String(plan.assertionId),
      options.cutoff,
      options.extractionRunId,
      JSON.stringify({
        span_verification: {
          rule: plan.rule,
          match_offset: plan.matchOffset,
          chunk_content_hash: plan.chunkContentHash,
          verified_at: options.cutoff,
        },
      }),
    ]);
    if (result.rows.length > 0) promoted += 1;
  }
  return promoted;
}

export async function executeSpanVerificationJob(input: {
  client: QueryClient;
  args: SpanVerificationArgs;
}): Promise<SpanVerificationSummary> {
  const candidates = await loadSpanVerificationCandidates(input.client, {
    cutoff: input.args.cutoff,
  });
  const plans: PlannedSpanVerification[] = [];
  const skips: SpanVerificationSkip[] = [];
  for (const candidate of candidates) {
    const { plan, skip } = planSpanVerification(candidate);
    if (plan) plans.push(plan);
    if (skip) skips.push(skip);
  }

  const ruleCounts = plans.reduce<Record<string, number>>((accumulator, plan) => {
    accumulator[plan.rule] = (accumulator[plan.rule] ?? 0) + 1;
    return accumulator;
  }, {});
  const skipCounts = skips.reduce<Record<string, number>>((accumulator, skip) => {
    accumulator[skip.reason] = (accumulator[skip.reason] ?? 0) + 1;
    return accumulator;
  }, {});
  const extractionRunId = spanVerificationRunId(input.args.cutoff);

  if (input.args.mode === 'dry-run') {
    return {
      cutoff: input.args.cutoff,
      mode: 'dry-run',
      extractionRunId,
      candidateCount: candidates.length,
      plannedCount: plans.length,
      ruleCounts,
      skips: skipCounts,
      promotedCount: null,
    };
  }

  await input.client.query('BEGIN');
  try {
    const promotedCount = await promoteSpanVerifications(input.client, plans, {
      cutoff: input.args.cutoff,
      extractionRunId,
    });
    await input.client.query('COMMIT');
    return {
      cutoff: input.args.cutoff,
      mode: 'apply',
      extractionRunId,
      candidateCount: candidates.length,
      plannedCount: plans.length,
      ruleCounts,
      skips: skipCounts,
      promotedCount,
    };
  } catch (error) {
    await input.client.query('ROLLBACK');
    throw error;
  }
}
