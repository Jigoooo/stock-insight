import { randomUUID } from 'node:crypto';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

// SET D / D-5: LLM claim/event extraction worker (Gemini structured output).
// Scope: news documents in knowledge.document with processing_status='pending'.
// Contract (04-A §1): mentions stay text — entity resolution is deterministic here;
// quotes are mandatory; predicates outside the allowlist are dropped to hypotheses.

const JOB_NAME = 'stock-insight-knowledge-extraction';
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const EXTRACTION_PIPELINE_VERSION = 'extract-v1';
const BATCH_SIZE = 8;

const PREDICATE_ALLOWLIST = new Set([
  'ANNOUNCED', 'GUIDES', 'INCREASES_DEMAND_FOR', 'DECREASES_DEMAND_FOR',
  'SUPPLIES', 'COMPETES_WITH', 'PRODUCES', 'REGULATES', 'AFFECTS_REGION',
  'INVESTS_IN', 'ACQUIRES', 'PARTNERS_WITH',
]);

const CLAIM_TYPES = new Set([
  'asserted_fact', 'reported_claim', 'forecast', 'opinion', 'guidance', 'rumor',
]);

const EVENT_TYPES = new Set([
  'earnings', 'capex_increase', 'ma_deal', 'regulation', 'product_launch',
  'supply_disruption', 'legal_action', 'macro_shock', 'ipo_listing', 'buyback_dividend',
]);

// B0: source types that carry no extractable prose (structured API payloads,
// navigation links, source candidates). They are explicitly marked 'skipped'
// with a recorded reason instead of sitting in 'pending' forever and being
// masked by a successful wrapper. 'disclosure' stays pending intentionally —
// it is the known B4 backlog and is surfaced (not hidden) by the wrapper gauge.
const NON_EXTRACTION_SOURCE_TYPES = new Set([
  'macro_api', 'market_api', 'briefing_link', 'candidate_source',
]);

const SKIP_NON_EXTRACTION_SQL = `
UPDATE knowledge.document
SET processing_status = 'skipped',
    metadata = metadata || jsonb_build_object(
      'skip_reason', 'non_extraction_source_type',
      'skip_policy', 'b0-v1',
      'skipped_at', now()::text
    )
WHERE processing_status = 'pending'
  AND source_type = ANY($1::text[])
`;

const PENDING_DOCS_SQL = `
SELECT document.document_id, document.title,
       coalesce(nullif(document.metadata ->> 'summary', ''), '') AS summary,
       document.published_at, document.observed_at
FROM knowledge.document document
WHERE document.processing_status = 'pending'
  AND document.source_type = 'news'
  AND document.title IS NOT NULL
ORDER BY document.observed_at DESC
LIMIT $1
`;

const DOC_ENTITIES_SQL = `
SELECT link.document_id, link.entity_id, entity.canonical_name
FROM knowledge.document_entity link
JOIN core.entity entity ON entity.entity_id = link.entity_id
WHERE link.document_id = ANY($1::bigint[])
`;

const INSERT_CLAIM_SQL = `
INSERT INTO knowledge.claim (
  subject_entity_id, predicate, object_value, claim_type, polarity,
  observed_at, published_at, extraction_confidence, verification_status,
  extraction_run_id, metadata
) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, 'unverified', $9, $10::jsonb)
RETURNING claim_id
`;

const INSERT_CLAIM_EVIDENCE_SQL = `
INSERT INTO knowledge.claim_evidence (claim_id, document_id, quote)
VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
`;

const INSERT_EVENT_SQL = `
INSERT INTO knowledge.event (
  event_type, target_entity_id, occurred_at, announced_at, magnitude, magnitude_unit,
  verification_status, dedupe_key, source_document_id, summary_text, extraction_run_id, metadata
) VALUES ($1, $2, $3, $4, $5, $6, 'unverified', $7, $8, $9, $10, $11::jsonb)
ON CONFLICT (dedupe_key) DO NOTHING
RETURNING event_id
`;

const MARK_DOC_SQL = `
UPDATE knowledge.document SET processing_status = $2 WHERE document_id = $1
`;

type PendingDoc = QueryResultRow & {
  document_id: string | number;
  title: string;
  summary: string;
  published_at: string | Date | null;
  observed_at: string | Date;
};

type DocEntity = QueryResultRow & {
  document_id: string | number;
  entity_id: string | number;
  canonical_name: string;
};

type ExtractedClaim = {
  document_id: number;
  subject_mention: string;
  predicate: string;
  object_text: string;
  claim_type: string;
  polarity: number;
  quote: string;
  confidence: number;
};

type ExtractedEvent = {
  document_id: number;
  event_type: string;
  target_mention: string;
  magnitude: number | null;
  magnitude_unit: string | null;
  quote: string;
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

function intOption(name: string, fallback: number, max: number): number {
  const index = process.argv.indexOf(name);
  const raw = index < 0 ? undefined : process.argv[index + 1];
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer between 1 and ${max}`);
  }
  return value;
}

async function geminiExtract(
  docs: Array<{ id: number; title: string; summary: string }>,
  apiKey: string,
  model: string,
): Promise<{ claims: ExtractedClaim[]; events: ExtractedEvent[] }> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    'You are a financial information extraction engine. For each input document',
    '(id, title, optional summary), extract zero or more CLAIMS and EVENTS.',
    'Rules:',
    `- predicate must be one of: ${[...PREDICATE_ALLOWLIST].join(', ')}`,
    `- claim_type one of: ${[...CLAIM_TYPES].join(', ')}`,
    `- event_type one of: ${[...EVENT_TYPES].join(', ')}`,
    '- quote MUST be copied verbatim from the title or summary (evidence span).',
    '- subject_mention/target_mention: the exact company/asset name as written.',
    '- polarity: 1 positive/neutral statement, -1 negated statement.',
    '- confidence in [0,1]. Do not invent facts not present in the text.',
    '- If nothing extractable, return empty arrays for that document.',
    JSON.stringify(docs),
  ].join('\n');
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        required: ['claims', 'events'],
        properties: {
          claims: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['document_id', 'subject_mention', 'predicate', 'object_text', 'claim_type', 'polarity', 'quote', 'confidence'],
              properties: {
                document_id: { type: 'INTEGER' },
                subject_mention: { type: 'STRING' },
                predicate: { type: 'STRING' },
                object_text: { type: 'STRING' },
                claim_type: { type: 'STRING' },
                polarity: { type: 'INTEGER' },
                quote: { type: 'STRING' },
                confidence: { type: 'NUMBER' },
              },
            },
          },
          events: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              required: ['document_id', 'event_type', 'target_mention', 'quote', 'confidence'],
              properties: {
                document_id: { type: 'INTEGER' },
                event_type: { type: 'STRING' },
                target_mention: { type: 'STRING' },
                magnitude: { type: 'NUMBER' },
                magnitude_unit: { type: 'STRING' },
                quote: { type: 'STRING' },
                confidence: { type: 'NUMBER' },
              },
            },
          },
        },
      },
    },
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`Gemini extraction failed with HTTP ${response.status}`);
      const payload = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini extraction returned no text');
      const parsed = JSON.parse(text) as { claims?: ExtractedClaim[]; events?: ExtractedEvent[] };
      return { claims: parsed.claims ?? [], events: parsed.events ?? [] };
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

// V1 schema validation (04-A §3): allowlist + quote-must-exist-in-source.
function validateClaim(
  claim: ExtractedClaim,
  docText: string,
): 'ok' | 'bad_predicate' | 'bad_type' | 'no_quote' {
  if (!PREDICATE_ALLOWLIST.has(claim.predicate)) return 'bad_predicate';
  if (!CLAIM_TYPES.has(claim.claim_type)) return 'bad_type';
  if (!claim.quote?.trim() || !docText.includes(claim.quote.trim().slice(0, 40))) return 'no_quote';
  return 'ok';
}

function validateEvent(event: ExtractedEvent, docText: string): 'ok' | 'bad_type' | 'no_quote' {
  if (!EVENT_TYPES.has(event.event_type)) return 'bad_type';
  if (!event.quote?.trim() || !docText.includes(event.quote.trim().slice(0, 40))) return 'no_quote';
  return 'ok';
}

// Deterministic mention resolution against pre-linked document entities (04-A §2).
function resolveMention(
  mention: string,
  links: Array<{ entity_id: number; canonical_name: string }>,
): number | null {
  const normalized = mention.trim().toLowerCase();
  if (!normalized) return null;
  for (const link of links) {
    const name = link.canonical_name.toLowerCase();
    if (name === normalized || name.includes(normalized) || normalized.includes(name)) {
      return link.entity_id;
    }
  }
  return null;
}

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const limit = intOption('--limit', 24, 500);
  const extractionRunId = `${EXTRACTION_PIPELINE_VERSION}-${randomUUID()}`;
  const model = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();
  try {
    // B0: mark non-extraction source types as skipped first so 'pending' only
    // ever means "extractable work not yet done" (fail-closed wrapper readback).
    let nonExtractionSkipped = 0;
    if (apply) {
      await client.query('BEGIN');
      const skipResult = await client.query(SKIP_NON_EXTRACTION_SQL, [[...NON_EXTRACTION_SOURCE_TYPES]]);
      nonExtractionSkipped = skipResult.rowCount ?? 0;
      await client.query('COMMIT');
    }

    await client.query('BEGIN READ ONLY');
    const pending = await client.query<PendingDoc>(PENDING_DOCS_SQL, [limit]);
    const docIds = pending.rows.map((row) => Number(row.document_id));
    const links = docIds.length
      ? await client.query<DocEntity>(DOC_ENTITIES_SQL, [docIds])
      : { rows: [] as DocEntity[] };
    await client.query('COMMIT');

    const linksByDoc = new Map<number, Array<{ entity_id: number; canonical_name: string }>>();
    for (const link of links.rows) {
      const key = Number(link.document_id);
      if (!linksByDoc.has(key)) linksByDoc.set(key, []);
      linksByDoc.get(key)!.push({
        entity_id: Number(link.entity_id),
        canonical_name: link.canonical_name,
      });
    }
    const docText = new Map<number, string>();
    const docMeta = new Map<number, PendingDoc>();
    for (const doc of pending.rows) {
      const id = Number(doc.document_id);
      docText.set(id, `${doc.title}\n${doc.summary}`.trim());
      docMeta.set(id, doc);
    }

    const stats = {
      documents: pending.rows.length,
      nonExtractionSkipped,
      claimsExtracted: 0,
      claimsStored: 0,
      claimsRejected: { bad_predicate: 0, bad_type: 0, no_quote: 0, unresolved_subject: 0 },
      eventsExtracted: 0,
      eventsStored: 0,
      eventsRejected: { bad_type: 0, no_quote: 0 },
    };

    if (pending.rows.length === 0) {
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', audit: stats }, null, 2));
      return;
    }

    const apiKey = required('GEMINI_API_KEY');
    const batches: Array<Array<{ id: number; title: string; summary: string }>> = [];
    const docsForLlm = pending.rows.map((doc) => ({
      id: Number(doc.document_id),
      title: doc.title,
      summary: doc.summary.slice(0, 600),
    }));
    for (let index = 0; index < docsForLlm.length; index += BATCH_SIZE) {
      batches.push(docsForLlm.slice(index, index + BATCH_SIZE));
    }

    for (const batch of batches) {
      const extracted = await geminiExtract(batch, apiKey, model);
      stats.claimsExtracted += extracted.claims.length;
      stats.eventsExtracted += extracted.events.length;
      if (!apply) continue;

      await client.query('BEGIN');
      await client.query("SELECT set_config('statement_timeout', '120s', true)");
      for (const claim of extracted.claims) {
        const text = docText.get(claim.document_id) ?? '';
        const verdict = validateClaim(claim, text);
        if (verdict !== 'ok') {
          stats.claimsRejected[verdict] += 1;
          continue;
        }
        const subjectId = resolveMention(claim.subject_mention, linksByDoc.get(claim.document_id) ?? []);
        if (subjectId === null) {
          stats.claimsRejected.unresolved_subject += 1;
          continue;
        }
        const doc = docMeta.get(claim.document_id)!;
        const inserted = await client.query<QueryResultRow & { claim_id: number }>(INSERT_CLAIM_SQL, [
          subjectId,
          claim.predicate,
          JSON.stringify({ text: claim.object_text }),
          claim.claim_type,
          claim.polarity === -1 ? -1 : 1,
          doc.observed_at,
          doc.published_at,
          Math.min(1, Math.max(0, claim.confidence)),
          extractionRunId,
          JSON.stringify({ subject_mention: claim.subject_mention, model }),
        ]);
        const claimId = inserted.rows[0]?.claim_id;
        if (claimId !== undefined) {
          await client.query(INSERT_CLAIM_EVIDENCE_SQL, [claimId, claim.document_id, claim.quote.slice(0, 1000)]);
          stats.claimsStored += 1;
        }
      }
      for (const event of extracted.events) {
        const text = docText.get(event.document_id) ?? '';
        const verdict = validateEvent(event, text);
        if (verdict !== 'ok') {
          stats.eventsRejected[verdict] += 1;
          continue;
        }
        const targetId = resolveMention(event.target_mention, linksByDoc.get(event.document_id) ?? []);
        const doc = docMeta.get(event.document_id)!;
        const dedupeKey = `${EXTRACTION_PIPELINE_VERSION}:${event.document_id}:${event.event_type}:${event.target_mention.toLowerCase().slice(0, 40)}`;
        const inserted = await client.query(INSERT_EVENT_SQL, [
          event.event_type,
          targetId,
          doc.published_at ?? doc.observed_at,
          doc.published_at ?? doc.observed_at,
          event.magnitude,
          event.magnitude_unit,
          dedupeKey,
          event.document_id,
          event.quote.slice(0, 2000),
          extractionRunId,
          JSON.stringify({ target_mention: event.target_mention, model, resolved: targetId !== null }),
        ]);
        if ((inserted.rowCount ?? 0) > 0) stats.eventsStored += 1;
      }
      for (const doc of batch) {
        await client.query(MARK_DOC_SQL, [doc.id, 'extracted']);
      }
      await client.query('COMMIT');
    }

    console.log(
      JSON.stringify(
        { mode: apply ? 'apply' : 'dry-run', jobName: JOB_NAME, extractionRunId, model, audit: stats },
        null,
        2,
      ),
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
