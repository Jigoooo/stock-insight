export type Phase12JournalSourceRow = {
  event_key: string | null;
  entity_key: string | null;
  market: string | null;
  severity: string | null;
  reason: string | null;
  title: string | null;
  summary: string | null;
  payload_json: unknown;
  source_kind: string | null;
  source_ref: string | null;
  occurred_at: string | Date | null;
};

export type Phase12JournalEntrySeed = {
  userId: string;
  entryKey: string;
  entityKey: string;
  market: 'KR' | 'US';
  entryType: 'alert_review';
  title: string;
  thesisText: string;
  evidence: Record<string, unknown>;
  sourceKind: string;
  sourceRef: string;
  occurredAt?: string;
  status: 'open';
  adviceProhibited: true;
};

export type Phase12DecisionJournalPlan = {
  sourceRows: number;
  journalEntries: Phase12JournalEntrySeed[];
  filteredNonStock: number;
  filteredActionAdvice: number;
};

export type Phase12DecisionJournalAudit = {
  sourceRows: number;
  journalEntries: number;
  filteredNonStock: number;
  filteredActionAdvice: number;
  warnings: string[];
};

export type Phase12ReadExecutor = {
  queryRows: <TRow extends Phase12JournalSourceRow = Phase12JournalSourceRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase12WriteExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase12PlanOptions = {
  userId?: string;
};

export type Phase12ApplyOptions = {
  runId: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
};

export type Phase12ApplyResult = {
  audit: {
    rowsRead: number;
    rowsWritten: number;
    rowsSkipped: number;
    summary: Phase12DecisionJournalAudit;
  };
};

const UPSERT_JOURNAL_ENTRY_SQL = `
INSERT INTO public.user_decision_journal_entries (
  user_id,
  entry_key,
  entity_key,
  market,
  entry_type,
  title,
  thesis_text,
  evidence_json,
  source_kind,
  source_ref,
  occurred_at,
  status,
  advice_prohibited
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11::timestamptz, $12, $13
)
ON CONFLICT (user_id, entry_key) DO UPDATE SET
  entity_key = EXCLUDED.entity_key,
  market = EXCLUDED.market,
  entry_type = EXCLUDED.entry_type,
  title = EXCLUDED.title,
  thesis_text = EXCLUDED.thesis_text,
  evidence_json = EXCLUDED.evidence_json,
  source_kind = EXCLUDED.source_kind,
  source_ref = EXCLUDED.source_ref,
  occurred_at = EXCLUDED.occurred_at,
  status = EXCLUDED.status,
  advice_prohibited = TRUE,
  updated_at = now()
`;

const INSERT_MIGRATION_RUN_SQL = `
INSERT INTO public.migration_runs (
  run_id,
  job_name,
  source_system,
  status,
  started_at,
  finished_at,
  rows_read,
  rows_written,
  rows_skipped,
  error,
  summary
) VALUES (
  $1, $2, 'stock-insight-app', 'completed', $3::timestamptz, $4::timestamptz, $5, $6, $7, NULL, $8::jsonb
)
`;

export const PHASE12_JOURNAL_SOURCE_ROWS_SQL = `
SELECT
  event_key,
  entity_key,
  market,
  severity,
  reason,
  title,
  summary,
  payload_json,
  source_kind,
  source_ref,
  occurred_at
FROM public.user_alert_events
WHERE market in ('KR', 'US')
  AND split_part(coalesce(entity_key, ''), ':', 1) in ('KR', 'US')
ORDER BY coalesce(occurred_at, recorded_at) DESC NULLS LAST, id DESC
LIMIT 100
`;

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeMarket(value: string | null | undefined): 'KR' | 'US' | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'KR' || normalized === 'US') return normalized;
  return null;
}

function normalizeSeverity(value: string | null | undefined): 'low' | 'medium' | 'high' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'low';
}

function normalizeReason(
  value: string | null | undefined,
): 'change_event' | 'feed_change' | 'freshness' | 'exposure' {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'change_event' ||
    normalized === 'feed_change' ||
    normalized === 'freshness' ||
    normalized === 'exposure'
  ) {
    return normalized;
  }
  return 'feed_change';
}

function toIsoString(value: string | Date | null): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function hasActionAdvice(title: string, summary: string): boolean {
  const text = `${title}\n${summary}`;
  return /매수\s*(?:추천|시점|타이밍|지시)|매도\s*(?:추천|시점|타이밍|지시)|buy\s*(?:recommendation|timing|signal)|sell\s*(?:recommendation|timing|signal)/iu.test(
    text,
  );
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function buildPhase12DecisionJournalPlan(
  rows: Phase12JournalSourceRow[],
  options: Phase12PlanOptions = {},
): Phase12DecisionJournalPlan {
  const userId = options.userId?.trim() || 'default';
  const journalEntries: Phase12JournalEntrySeed[] = [];
  let filteredNonStock = 0;
  let filteredActionAdvice = 0;

  for (const row of rows) {
    const market = normalizeMarket(row.market ?? row.entity_key?.split(':')[0]);
    const entityKey = cleanText(row.entity_key);
    const eventKey = cleanText(row.event_key);
    const title = cleanText(row.title);
    const summary = cleanText(row.summary);

    if (!market || !entityKey || !entityKey.startsWith(`${market}:`)) {
      filteredNonStock += 1;
      continue;
    }
    if (!eventKey || !title || !summary) continue;
    if (hasActionAdvice(title, summary)) {
      filteredActionAdvice += 1;
      continue;
    }

    journalEntries.push({
      userId,
      entryKey: `alert-review:${eventKey}`,
      entityKey,
      market,
      entryType: 'alert_review',
      title,
      thesisText: `기록용 관찰: ${summary}`,
      evidence: {
        alertEventKey: eventKey,
        severity: normalizeSeverity(row.severity),
        reason: normalizeReason(row.reason),
        stockOnly: true,
        ...toRecord(row.payload_json),
      },
      sourceKind: cleanText(row.source_kind) ?? 'user_alert_events',
      sourceRef: cleanText(row.source_ref) ?? eventKey,
      ...(toIsoString(row.occurred_at) ? { occurredAt: toIsoString(row.occurred_at) } : {}),
      status: 'open',
      adviceProhibited: true,
    });
  }

  return {
    sourceRows: rows.length,
    journalEntries,
    filteredNonStock,
    filteredActionAdvice,
  };
}

export function summarizePhase12DecisionJournalAudit(
  plan: Phase12DecisionJournalPlan,
): Phase12DecisionJournalAudit {
  const warnings = [
    ...(plan.filteredNonStock > 0
      ? [`${plan.filteredNonStock} non-stock journal candidate(s) were filtered.`]
      : []),
    ...(plan.filteredActionAdvice > 0
      ? [`${plan.filteredActionAdvice} action-advice journal candidate(s) were filtered.`]
      : []),
  ];
  return {
    sourceRows: plan.sourceRows,
    journalEntries: plan.journalEntries.length,
    filteredNonStock: plan.filteredNonStock,
    filteredActionAdvice: plan.filteredActionAdvice,
    warnings,
  };
}

export async function loadPhase12JournalRows(
  executor: Phase12ReadExecutor,
): Promise<Phase12JournalSourceRow[]> {
  return executor.queryRows(PHASE12_JOURNAL_SOURCE_ROWS_SQL, []);
}

export async function applyPhase12DecisionJournalPlan(
  plan: Phase12DecisionJournalPlan,
  executor: Phase12WriteExecutor,
  options: Phase12ApplyOptions,
): Promise<Phase12ApplyResult> {
  for (const entry of plan.journalEntries) {
    await executor.queryRows(UPSERT_JOURNAL_ENTRY_SQL, [
      entry.userId,
      entry.entryKey,
      entry.entityKey,
      entry.market,
      entry.entryType,
      entry.title,
      entry.thesisText,
      JSON.stringify(entry.evidence),
      entry.sourceKind,
      entry.sourceRef,
      entry.occurredAt ?? null,
      entry.status,
      entry.adviceProhibited,
    ]);
  }

  const summary = summarizePhase12DecisionJournalAudit(plan);
  const rowsWritten = plan.journalEntries.length;
  const rowsSkipped = plan.filteredNonStock + plan.filteredActionAdvice;
  await executor.queryRows(INSERT_MIGRATION_RUN_SQL, [
    options.runId,
    options.jobName,
    options.startedAt.toISOString(),
    options.finishedAt.toISOString(),
    plan.sourceRows,
    rowsWritten,
    rowsSkipped,
    JSON.stringify(summary),
  ]);

  return {
    audit: {
      rowsRead: plan.sourceRows,
      rowsWritten,
      rowsSkipped,
      summary,
    },
  };
}
