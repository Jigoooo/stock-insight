// B1 — supply relations out of Korean 사업보고서 filings.
//
// Reads document.xml for each KR issuer, keeps the prose near a customer phrase,
// resolves the names in it against our own issuer catalog, and writes the pairs to
// analytics.firm_supply_relation. buildSupplyChainCandidates turns those into
// SUPPLIES/CUSTOMER_OF, which is how the graph gets its first causal predicate:
// AFFECTS, SUPPLY_CHAIN and EXPOSES all stand at zero accepted revisions because
// nothing legitimate ever fed them.
//
// FOUR TRAPS, ALL ALREADY PAID FOR — do not re-derive them:
//
//   encoding   The XML declares encoding="utf-8". Decoding EUC-KR produced
//              148,449 replacement characters and a reading of "0 매출처". A
//              misread that looks exactly like an absence is worse than a crash,
//              so replacementChars is counted and reported every run.
//   context    Names count only within ±150 chars of a customer phrase. Searching
//              whole documents turned 한국투자금융지주's PORTFOLIO into its
//              customers — the same error made on SEC data first.
//   budget     document.xml is far tighter than the financial-facts API. On
//              2026-08-05 the quota died at 120 requests, so 188 issuers × 2
//              requests cannot fit one day. Status 020 ends the run SUCCESSFULLY
//              with the cursor kept; it is a budget boundary, not a failure.
//   windows    The raw windows are stored. Changing the resolution rules must not
//              require re-fetching: 80 requests is not a budget that can be spent
//              on every rule change. Both the customer AND affiliate windows are
//              captured in the same pass for exactly this reason — the earlier
//              sample kept only customer windows, so measuring the affiliate
//              section's format would have cost another full collection.

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import pg, { type PoolClient, type QueryResultRow } from 'pg';

import {
  CLOSE_FETCH_RUN_SQL,
  OPEN_FETCH_RUN_SQL,
  registerRawObjectWithRevision,
  writeRawObject,
} from './raw-object-store.ts';
import { type NameCatalogEntry, resolveCustomerMentions } from './supply-disclosure-resolution.ts';

const JOB_NAME = 'stock-insight-dart-supply-disclosure';
const PROVIDER_KEY = 'opendart-business-report-supply';
const CURSOR_KEY = 'kr-business-report-supply';
const LIST_URL = 'https://opendart.fss.or.kr/api/list.json';
const DOCUMENT_URL = 'https://opendart.fss.or.kr/api/document.xml';

/** ±150 chars. Measured: whole-document search reads holdings as customers. */
const CONTEXT_CHARS = 150;

/** Phrases that introduce a CUSTOMER — not a supplier, not a shareholder. */
const CUSTOMER_MARKERS = ['매출처', '주요 거래처', '주요거래처', '주요 고객', '주요고객'] as const;

/**
 * Phrases that introduce the issuer's own affiliates. B4: `(주)LS → LS일렉트릭` is a
 * subsidiary rather than a customer, and no name rule can tell — the normalized
 * forms share no substring — while the ledger cannot help because OWNS and
 * ROLLS_UP both hold zero accepted revisions. The disclosure names them itself, in
 * the same document, so reading this section costs no extra request.
 *
 * The format of this section has NOT been measured yet. The dry run reports how
 * many documents carry it and how many names come out, and the exclusion stays OFF
 * until those numbers are looked at. Guessing the format and enabling exclusion
 * would silently drop real customers.
 */
const AFFILIATE_MARKERS = ['계열회사', '계열 회사', '종속회사', '종속 회사'] as const;

/** A decode this broken is a misread, not an empty document. */
const REPLACEMENT_CHAR_LIMIT = 100;

type PgModule = { Pool: new (config: { connectionString: string; max: number }) => Pool };
type Pool = { connect: () => Promise<PoolClient>; end: () => Promise<void> };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function intOption(flag: string, fallback: number, max: number): number {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${flag} must be an integer between 1 and ${max}`);
  }
  return parsed;
}

export type DartStatus = { status: string };

/** Windows of prose around every occurrence of any marker. */
export function extractWindows(
  documentText: string,
  markers: readonly string[],
  contextChars = CONTEXT_CHARS,
): string[] {
  // Tags and entities become spaces rather than being deleted: deleting them
  // would join a tag-separated company name to the next word and invent a name
  // that is in no document.
  const plain = documentText.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  // Deduplicated as a cheap safeguard, NOT because duplicates were measured. Two
  // documents produced 207 affiliate windows and deduplication removed none of
  // them on 2026-08-06 — the marker repeats through a table but each occurrence
  // slices different prose, so they are genuinely distinct. Kept because an
  // identical window carries no new information if one ever appears; the earlier
  // note here claimed it shrank the output, which the measurement disproved.
  const windows = new Set<string>();
  for (const marker of markers) {
    let at = plain.indexOf(marker);
    while (at !== -1) {
      windows.add(plain.slice(Math.max(0, at - contextChars), at + marker.length + contextChars));
      at = plain.indexOf(marker, at + 1);
    }
  }
  return [...windows];
}

/** document.xml returns a ZIP whose XML declares utf-8. Read it as utf-8. */
export function decodeDocumentZip(buffer: Buffer): string | null {
  if (buffer.subarray(0, 2).toString('latin1') !== 'PK') return null;
  const dir = mkdtempSync(join(tmpdir(), 'dart-supply-'));
  try {
    writeFileSync(join(dir, 'doc.zip'), buffer);
    execFileSync('unzip', ['-o', '-q', join(dir, 'doc.zip'), '-d', dir]);
    const files = readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.xml'));
    if (files.length === 0) return null;
    return readFileSync(join(dir, files[0]!), 'utf8');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CATALOG_SQL = `
SELECT issuer.entity_id AS issuer_entity_id,
       issuer.canonical_name AS name,
       identifier.identifier_value AS corp_code
FROM core.entity issuer
JOIN core.security_issuer_identity sii ON sii.issuer_entity_id = issuer.entity_id
LEFT JOIN core.entity_identifier identifier
  ON identifier.entity_id = issuer.entity_id
 AND identifier.identifier_type = 'DART_CORP_CODE'
WHERE issuer.entity_type = 'Company'
  AND issuer.country_code = 'KR'
GROUP BY 1, 2, 3
ORDER BY 3 NULLS LAST, 1
`;

const READ_CURSOR_SQL = `
SELECT last_corp_code, issuers_completed FROM ingestion.dart_supply_cursor WHERE cursor_key = $1
`;

const WRITE_CURSOR_SQL = `
INSERT INTO ingestion.dart_supply_cursor (cursor_key, last_corp_code, issuers_completed, metadata)
VALUES ($1, $2, $3, $4::jsonb)
ON CONFLICT (cursor_key) DO UPDATE
  SET last_corp_code = EXCLUDED.last_corp_code,
      issuers_completed = EXCLUDED.issuers_completed,
      metadata = EXCLUDED.metadata,
      updated_at = now()
`;

const UPSERT_RELATION_SQL = `
INSERT INTO analytics.firm_supply_relation (
  relation_key, from_firm_entity_id, to_firm_entity_id, relation_kind, disclosure_source,
  evidence_locator, available_at, known_at, valid_from, metadata
)
VALUES ($1, $2, $3, 'customer', $4, $5::jsonb, $6, $7, $8, $9::jsonb)
ON CONFLICT (relation_key) DO UPDATE
  SET known_at = GREATEST(analytics.firm_supply_relation.known_at, EXCLUDED.known_at),
      metadata = EXCLUDED.metadata
RETURNING firm_supply_relation_id
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (run_id, job_name, status, started_at, finished_at, summary)
VALUES ($1, $2, $3, $4, now(), $5::jsonb)
`;

const SOURCE_ID_SQL = `SELECT source_id FROM ingestion.source WHERE provider_key = $1`;

type CatalogRow = QueryResultRow & {
  issuer_entity_id: string | number;
  name: string;
  corp_code: string | null;
};

async function fetchList(
  apiKey: string,
  corpCode: string,
): Promise<
  DartStatus & {
    list: { rcept_no?: string; report_nm?: string; rcept_dt?: string }[];
  }
> {
  const url = new URL(LIST_URL);
  url.searchParams.set('crtfc_key', apiKey);
  url.searchParams.set('corp_code', corpCode);
  url.searchParams.set('bgn_de', '20240101');
  url.searchParams.set('pblntf_ty', 'A');
  url.searchParams.set('page_count', '20');
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`OpenDART list HTTP ${response.status}`);
  const payload = (await response.json()) as {
    status?: string;
    list?: { rcept_no?: string; report_nm?: string; rcept_dt?: string }[];
  };
  return { status: payload.status ?? '999', list: payload.list ?? [] };
}

async function fetchDocument(apiKey: string, rceptNo: string): Promise<Buffer | null> {
  const url = new URL(DOCUMENT_URL);
  url.searchParams.set('crtfc_key', apiKey);
  url.searchParams.set('rcept_no', rceptNo);
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function run(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const limit = intOption('--limit', 20, 200);
  const startedAt = new Date();
  const runId = `${JOB_NAME}-${randomUUID()}`;
  const apiKey = required('OPENDART_API_KEY');

  const Pool = (pg as PgModule).Pool;
  const pool = new Pool({ connectionString: required('DATABASE_URL'), max: 1 });
  const client = await pool.connect();

  // Counted, because nothing counts it today. ingestion.fetch_run records
  // records_read, not HTTP requests, so "how much budget is left" is unanswerable
  // from our own data — the same blindness the unattributed gauge fixed for events.
  let requests = 0;
  let quotaExhausted = false;

  const outcomes: Record<string, number> = {};
  const bump = (key: string): void => {
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  };

  try {
    const sourceRow = await client.query<QueryResultRow & { source_id: string | number }>(
      SOURCE_ID_SQL,
      [PROVIDER_KEY],
    );
    const sourceId = sourceRow.rows[0] ? Number(sourceRow.rows[0].source_id) : null;
    // Migration 069 registers the source. Without it there is nothing to attach a
    // source_revision to, and source_revision is the ONLY evidence kind migration
    // 024's gate admits for these predicates — claim/document need a verified
    // claim and production has none. So this is a hard stop, not a warning.
    if (sourceId === null) {
      throw new Error(
        `ingestion.source '${PROVIDER_KEY}' is missing — apply migration 069 before collecting`,
      );
    }

    const catalogRows = await client.query<CatalogRow>(CATALOG_SQL, []);
    const catalog: NameCatalogEntry[] = catalogRows.rows.map((row) => ({
      entityId: Number(row.issuer_entity_id),
      issuerEntityId: Number(row.issuer_entity_id),
      name: row.name,
    }));
    const collectible = catalogRows.rows.filter((row) => row.corp_code !== null);

    const cursorRow = await client.query<
      QueryResultRow & { last_corp_code: string; issuers_completed: number }
    >(READ_CURSOR_SQL, [CURSOR_KEY]);
    const cursor = cursorRow.rows[0];
    const startIndex = cursor
      ? collectible.findIndex((row) => (row.corp_code ?? '') > cursor.last_corp_code)
      : 0;
    // A cursor past the end means the cycle finished; wrap to the start. Business
    // reports change once a year, so re-reading from the top is the steady state
    // rather than an error.
    const from = startIndex === -1 ? 0 : startIndex;
    const batch = collectible.slice(from, from + limit);

    let fetchRunId: number | null = null;
    if (apply) {
      const opened = await client.query<QueryResultRow & { fetch_run_id: string | number }>(
        OPEN_FETCH_RUN_SQL,
        [PROVIDER_KEY, runId, `${PROVIDER_KEY}:${runId}`, startedAt.toISOString()],
      );
      const openedRow = opened.rows[0];
      // No row means the idempotency key belongs to another source — the
      // cross-source collision guard added on 2026-08-05. Refuse rather than
      // write under someone else's provenance.
      if (!openedRow) throw new Error('fetch run could not be opened for this source');
      fetchRunId = Number(openedRow.fetch_run_id);
    }

    let lastCorpCode = cursor?.last_corp_code ?? '';
    let relationsWritten = 0;
    let customerWindowDocuments = 0;
    let affiliateWindowDocuments = 0;
    let affiliateWindowsTotal = 0;
    // NOT an exclusion list. Measured 2026-08-06 on real filings: the section the
    // affiliate markers actually catch is the related-party note of the financial
    // statements, and it names major group companies — 삼성증권's window resolved
    // 삼성전자, 삼성에스디에스, 삼성생명보험, 삼성화재해상보험. Excluding those
    // would delete intra-group revenue relationships that are real.
    //
    // And on the case that motivated the rule it is INVERTED, which the first
    // apply run showed outright. (주)LS names two customers:
    //
    //   (주)LS → 엘에스일렉트릭   its own subsidiary   flagged FALSE
    //   (주)LS → LG전자           a genuine customer   flagged TRUE
    //
    // So an exclusion rule would have deleted the real edge and kept the spurious
    // one. Over 10 issuers the flag fired on 5 of 10 relations, so this is not a
    // rare misfire. The section names whoever the related-party note happens to
    // discuss, which correlates with corporate history — LS was spun out of LG —
    // rather than with "is not a customer".
    //
    // So the flag is recorded on the relation and the decision is left to whoever
    // reads it. The field name says what was observed ('named in the related-party
    // note'), not what it implies, because the implication is what turned out to be
    // false. Dropping the information would be worse than either choice.
    let affiliateNamesResolved = 0;
    let customersAlsoRelatedParty = 0;
    const affiliateSamples: { from: string; resolved: string[]; window: string }[] = [];
    let badDecodeDocuments = 0;
    let resolvedMentions = 0;
    const rejectionsByReason: Record<string, number> = {};
    const samples: { from: string; customers: string[] }[] = [];

    for (const issuer of batch) {
      const corpCode = issuer.corp_code!;
      const list = await fetchList(apiKey, corpCode);
      requests += 1;
      await sleep(120);
      if (list.status === '020') {
        quotaExhausted = true;
        break;
      }
      if (list.status !== '000') {
        bump(`list_${list.status}`);
        lastCorpCode = corpCode;
        continue;
      }
      const report = list.list.find((entry) => /사업보고서/.test(entry.report_nm ?? ''));
      if (!report?.rcept_no) {
        bump('no_annual_report');
        lastCorpCode = corpCode;
        continue;
      }

      const buffer = await fetchDocument(apiKey, report.rcept_no);
      requests += 1;
      await sleep(120);
      if (buffer === null) {
        bump('document_unavailable');
        lastCorpCode = corpCode;
        continue;
      }
      // A ZIP is a document; a JSON body here is an API status, and 020 arrives
      // this way from document.xml rather than as a ZIP.
      if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
        const asText = buffer.toString('utf8');
        if (asText.includes('"020"')) {
          quotaExhausted = true;
          break;
        }
        bump('document_not_zip');
        lastCorpCode = corpCode;
        continue;
      }
      const text = decodeDocumentZip(buffer);
      if (text === null) {
        bump('document_unreadable');
        lastCorpCode = corpCode;
        continue;
      }
      const replacementChars = (text.match(/�/g) ?? []).length;
      if (replacementChars > REPLACEMENT_CHAR_LIMIT) {
        // Never counted as "no customers": that is the exact misreading this guard
        // exists to prevent.
        badDecodeDocuments += 1;
        bump('bad_decode');
        lastCorpCode = corpCode;
        continue;
      }

      const customerWindows = extractWindows(text, CUSTOMER_MARKERS);
      const affiliateWindows = extractWindows(text, AFFILIATE_MARKERS);
      // Per issuer, deliberately. A batch-wide set would flag issuer B's customer
      // because issuer A happened to name it as a related party — the flag has to
      // mean "this filer's own related party" or it means nothing.
      const issuerAffiliateIds = new Set<number>();
      if (affiliateWindows.length > 0) {
        affiliateWindowDocuments += 1;
        affiliateWindowsTotal += affiliateWindows.length;
        // B4's decision input. Run through the SAME resolver as customers so the
        // number is comparable: if the affiliate section names catalog companies
        // the way the customer section does, exclusion is workable; if it resolves
        // nothing, the format is not readable and the rule stays off. Reported,
        // never applied — an exclusion rule built on an unread format would drop
        // real customers silently.
        const affiliateResolution = resolveCustomerMentions({
          reportingIssuerEntityId: Number(issuer.issuer_entity_id),
          reportingName: issuer.name,
          contextWindows: affiliateWindows,
          catalog,
        });
        affiliateNamesResolved += affiliateResolution.resolved.length;
        for (const mention of affiliateResolution.resolved) {
          issuerAffiliateIds.add(mention.issuerEntityId);
        }
        if (!apply && affiliateSamples.length < 3) {
          affiliateSamples.push({
            from: issuer.name,
            resolved: affiliateResolution.resolved.map((mention) => mention.matchedName),
            // Truncated prose so the FORMAT can be read by eye. Dry run only.
            window: affiliateWindows[0]!.replace(/\s+/g, ' ').slice(0, 300),
          });
        }
      }
      if (customerWindows.length === 0) {
        // A real observation. 6 of 40 sampled reports have no customer section,
        // and the contract declares emptiness valid for this source.
        bump('no_customer_context');
        lastCorpCode = corpCode;
        continue;
      }
      customerWindowDocuments += 1;

      const resolution = resolveCustomerMentions({
        reportingIssuerEntityId: Number(issuer.issuer_entity_id),
        reportingName: issuer.name,
        contextWindows: customerWindows,
        catalog,
      });
      for (const rejection of resolution.rejections) {
        rejectionsByReason[rejection.reason] = (rejectionsByReason[rejection.reason] ?? 0) + 1;
      }
      resolvedMentions += resolution.resolved.length;
      for (const mention of resolution.resolved) {
        if (issuerAffiliateIds.has(mention.issuerEntityId)) customersAlsoRelatedParty += 1;
      }
      if (resolution.resolved.length > 0 && samples.length < 10) {
        samples.push({
          from: issuer.name,
          customers: resolution.resolved.map((mention) => mention.matchedName),
        });
      }

      if (apply && fetchRunId !== null) {
        // Both window sets are stored, so a resolution-rule change re-measures
        // without re-fetching. The document text itself is NOT stored: it is up to
        // ~megabytes per filing and the windows are what any rule reads.
        const payload = JSON.stringify({
          provider: PROVIDER_KEY,
          corpCode,
          rceptNo: report.rcept_no,
          rceptDt: report.rcept_dt ?? null,
          issuerEntityId: Number(issuer.issuer_entity_id),
          issuerName: issuer.name,
          documentChars: text.length,
          replacementChars,
          customerWindows,
          affiliateWindows,
        });
        const raw = await writeRawObject({
          providerKey: PROVIDER_KEY,
          content: payload,
          extension: 'json',
          fetchedAt: startedAt,
        });
        const registered = await registerRawObjectWithRevision(client, {
          fetchRunId,
          sourceId,
          providerRecordKey: `supply:${corpCode}:${report.rcept_no}`,
          contentHash: raw.contentHash,
          objectUri: raw.objectUri,
          httpMeta: {
            bytes: raw.bytes,
            kind: 'dart_business_report_supply_windows',
            rcept_no: report.rcept_no,
          },
          fetchedAt: startedAt.toISOString(),
        });

        // valid_from is the FILING's receipt date, not our capture time. The same
        // bitemporal split that made 14 MEASURED_BY revisions churn: a disclosure
        // holds from when it was disclosed.
        const validFrom = report.rcept_dt
          ? `${report.rcept_dt.slice(0, 4)}-${report.rcept_dt.slice(4, 6)}-${report.rcept_dt.slice(6, 8)}T00:00:00Z`
          : registered.sourceAvailableAt;
        for (const mention of resolution.resolved) {
          const written = await client.query<
            QueryResultRow & { firm_supply_relation_id: string | number }
          >(UPSERT_RELATION_SQL, [
            `dart:${corpCode}:${mention.issuerEntityId}`,
            Number(issuer.issuer_entity_id),
            mention.issuerEntityId,
            PROVIDER_KEY,
            JSON.stringify({
              rcept_no: report.rcept_no,
              source_revision_id: registered.sourceRevisionId,
              object_uri: registered.objectUri,
            }),
            registered.sourceAvailableAt,
            startedAt.toISOString(),
            validFrom,
            JSON.stringify({
              matched_name: mention.matchedName,
              merged_names: mention.mergedNames,
              disclosure_kind: 'customer_disclosed',
              // Flagged, not excluded. See issuerAffiliateIds above for why the
              // exclusion rule this was built for is not enabled.
              also_disclosed_as_related_party: issuerAffiliateIds.has(mention.issuerEntityId),
              collector: JOB_NAME,
            }),
          ]);
          if (written.rowCount === 1) relationsWritten += 1;
        }
      }

      bump('measured');
      lastCorpCode = corpCode;
    }

    const summary = {
      job: JOB_NAME,
      mode: apply ? 'apply' : 'dry-run',
      // Counted here because ingestion.fetch_run counts records, not requests, so
      // this is the only place remaining budget can be reasoned about.
      requests,
      quotaExhausted,
      catalogIssuers: catalogRows.rows.length,
      collectibleIssuers: collectible.length,
      // Issuers with no DART_CORP_CODE identifier cannot be collected at all. A
      // number, not a silence: it bounds what this job can ever reach.
      issuersWithoutCorpCode: catalogRows.rows.length - collectible.length,
      batchRequested: limit,
      batchAttempted: batch.length,
      cursorFrom: cursor?.last_corp_code ?? null,
      cursorTo: lastCorpCode === '' ? null : lastCorpCode,
      documentsWithCustomerContext: customerWindowDocuments,
      // B4 is NOT enabled. These two numbers are the measurement that decides
      // whether the affiliate section is readable at all; the exclusion rule stays
      // off until they are looked at.
      documentsWithAffiliateContext: affiliateWindowDocuments,
      affiliateWindowsTotal,
      // The number B4 turns on. Zero means the section exists but names nothing we
      // hold, and the exclusion rule must stay off rather than be guessed.
      affiliateNamesResolved,
      // How many resolved CUSTOMERS are also named as related parties. This is the
      // number an exclusion rule would have deleted, so it must be visible before
      // anyone turns one on.
      customersAlsoDisclosedAsRelatedParty: customersAlsoRelatedParty,
      affiliateSamples,
      // A misread must never be reported as an absence.
      badDecodeDocuments,
      resolvedMentions,
      rejectionsByReason,
      relationsWritten,
      outcomes,
      samples,
    };
    console.log(JSON.stringify(summary, null, 2));

    if (apply && fetchRunId !== null) {
      const finishedAt = new Date().toISOString();
      await client.query(CLOSE_FETCH_RUN_SQL, [
        fetchRunId,
        finishedAt,
        // 'partial', not 'failed': the run did exactly what the budget allowed and
        // the cursor is kept. Recording a budget boundary as a failure would page
        // someone for correct behaviour.
        quotaExhausted ? 'partial' : 'success',
        requests,
        relationsWritten,
        0,
        null,
        finishedAt,
        JSON.stringify(summary),
      ]);
      // Advanced even when the quota ran out — that is the whole point of the
      // cursor. Only an issuer actually processed moves it, so a run that died on
      // its first request re-tries that issuer rather than skipping it.
      await client.query(WRITE_CURSOR_SQL, [
        CURSOR_KEY,
        lastCorpCode === ''
          ? (cursor?.last_corp_code ?? collectible[0]?.corp_code ?? '0')
          : lastCorpCode,
        (cursor?.issuers_completed ?? 0) + (outcomes['measured'] ?? 0),
        JSON.stringify({ lastRunId: runId, quotaExhausted }),
      ]);
    }

    if (apply) {
      await client.query(INSERT_MIGRATION_RUN_SQL, [
        runId,
        JOB_NAME,
        // Quota exhaustion is a budget boundary, not a failure: the cursor is kept
        // and the next run resumes. Recording it as failed would page someone for
        // a job that did exactly what it should.
        quotaExhausted ? 'completed_partial' : 'completed',
        startedAt.toISOString(),
        JSON.stringify(summary),
      ]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('run-dart-supply-disclosure.ts')) {
  run().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
