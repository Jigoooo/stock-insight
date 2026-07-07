export type Phase11AlertSourceRow = {
  id: string | null;
  title: string | null;
  summary: string | null;
  severity: string | null;
  reason: string | null;
  entity_key: string | null;
  market: string | null;
  created_at: string | Date | null;
};

export type Phase11NotificationRuleSeed = {
  userId: string;
  ruleKey: string;
  scope: 'portfolio_digest';
  channel: 'in_app';
  enabled: true;
  severityThreshold: 'low' | 'medium' | 'high';
  stockOnly: true;
  rateLimitMinutes: number;
};

export type Phase11AlertEventSeed = {
  userId: string;
  ruleKey: string;
  eventKey: string;
  entityKey: string;
  market: 'KR' | 'US';
  severity: 'low' | 'medium' | 'high';
  reason: 'change_event' | 'feed_change' | 'freshness' | 'exposure';
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  sourceKind: string;
  sourceRef: string;
  occurredAt?: string;
};

export type Phase11AlertLedgerPlan = {
  sourceRows: number;
  rule: Phase11NotificationRuleSeed;
  alertEvents: Phase11AlertEventSeed[];
  filteredNonStock: number;
  filteredActionAdvice: number;
};

export type Phase11AlertAudit = {
  sourceRows: number;
  alertEvents: number;
  filteredNonStock: number;
  filteredActionAdvice: number;
  warnings: string[];
};

export type Phase11ReadExecutor = {
  queryRows: <TRow extends Phase11AlertSourceRow = Phase11AlertSourceRow>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase11WriteExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<TRow[]>;
};

export type Phase11PlanOptions = {
  userId?: string;
};

export type Phase11ApplyOptions = {
  runId: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date;
};

export type Phase11ApplyResult = {
  audit: {
    rowsRead: number;
    rowsWritten: number;
    rowsSkipped: number;
    summary: Phase11AlertAudit;
  };
};

const UPSERT_RULE_SQL = `
INSERT INTO public.user_notification_rules (
  user_id,
  rule_key,
  scope,
  channel,
  enabled,
  severity_threshold,
  stock_only,
  rate_limit_minutes
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8
)
ON CONFLICT (user_id, rule_key) DO UPDATE SET
  scope = EXCLUDED.scope,
  channel = EXCLUDED.channel,
  enabled = EXCLUDED.enabled,
  severity_threshold = EXCLUDED.severity_threshold,
  stock_only = EXCLUDED.stock_only,
  rate_limit_minutes = EXCLUDED.rate_limit_minutes,
  updated_at = now()
`;

const UPSERT_ALERT_EVENT_SQL = `
INSERT INTO public.user_alert_events (
  user_id,
  rule_key,
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
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::timestamptz
)
ON CONFLICT (user_id, event_key) DO UPDATE SET
  rule_key = EXCLUDED.rule_key,
  entity_key = EXCLUDED.entity_key,
  market = EXCLUDED.market,
  severity = EXCLUDED.severity,
  reason = EXCLUDED.reason,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  payload_json = EXCLUDED.payload_json,
  source_kind = EXCLUDED.source_kind,
  source_ref = EXCLUDED.source_ref,
  occurred_at = EXCLUDED.occurred_at,
  recorded_at = now()
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

export const PHASE11_ALERT_SOURCE_ROWS_SQL = `
WITH change_alerts AS (
  SELECT
    concat('change:', event_key) AS id,
    coalesce(nullif(title, ''), concat(coalesce(ticker, entity_key), ' 변화 감지')) AS title,
    concat(
      coalesce(nullif(event_type, ''), 'change'),
      CASE WHEN delta_pct IS NOT NULL THEN concat(' · ', round(delta_pct::numeric, 2)::text, '%') ELSE '' END
    ) AS summary,
    CASE
      WHEN severity = 'high' OR abs(coalesce(delta_pct, 0)) >= 5 THEN 'high'
      WHEN severity = 'medium' OR abs(coalesce(delta_pct, 0)) >= 2 THEN 'medium'
      ELSE 'low'
    END AS severity,
    'change_event' AS reason,
    entity_key,
    split_part(coalesce(entity_key, ''), ':', 1) AS market,
    created_at
  FROM public.change_events
  WHERE domain = 'stock'
    AND resolved_at IS NULL
), feed_alerts AS (
  SELECT
    concat('feed:', record_id::text) AS id,
    coalesce(nullif(title, ''), '관심종목 변화 후보') AS title,
    coalesce(nullif(summary_text, ''), nullif(top_reason, ''), concat('개인화 피드 ', coalesce(primary_kind, 'change'))) AS summary,
    CASE
      WHEN coalesce(relevance_score, 0) >= 0.8 THEN 'high'
      WHEN coalesce(relevance_score, 0) >= 0.3 THEN 'medium'
      ELSE 'low'
    END AS severity,
    'feed_change' AS reason,
    CASE
      WHEN coalesce(record_entity_key, '') <> '' THEN record_entity_key
      WHEN array_length(watched_entities, 1) > 0 THEN watched_entities[1]
      ELSE NULL
    END AS entity_key,
    CASE
      WHEN coalesce(record_entity_key, '') <> '' THEN split_part(record_entity_key, ':', 1)
      WHEN array_length(watched_entities, 1) > 0 THEN split_part(watched_entities[1], ':', 1)
      ELSE NULL
    END AS market,
    coalesce(published_at, effective_date) AS created_at
  FROM public.v_user_feed_dedup
  WHERE domain = 'stock'
    AND coalesce(title, '') <> ''
), alert_candidates AS (
  SELECT * FROM change_alerts
  UNION ALL
  SELECT * FROM feed_alerts
)
SELECT
  id,
  title,
  summary,
  severity,
  reason,
  entity_key,
  market,
  created_at
FROM alert_candidates
ORDER BY created_at DESC NULLS LAST,
  CASE severity WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
  id DESC
LIMIT 50
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

function defaultRule(userId: string): Phase11NotificationRuleSeed {
  return {
    userId,
    ruleKey: 'default-stock-digest',
    scope: 'portfolio_digest',
    channel: 'in_app',
    enabled: true,
    severityThreshold: 'low',
    stockOnly: true,
    rateLimitMinutes: 60,
  };
}

export function buildPhase11AlertLedgerPlan(
  rows: Phase11AlertSourceRow[],
  options: Phase11PlanOptions = {},
): Phase11AlertLedgerPlan {
  const userId = options.userId?.trim() || 'default';
  const alertEvents: Phase11AlertEventSeed[] = [];
  let filteredNonStock = 0;
  let filteredActionAdvice = 0;

  for (const row of rows) {
    const market = normalizeMarket(row.market ?? row.entity_key?.split(':')[0]);
    const entityKey = cleanText(row.entity_key);
    const id = cleanText(row.id);
    const title = cleanText(row.title);
    const summary = cleanText(row.summary);

    if (!market || !entityKey || !entityKey.startsWith(`${market}:`)) {
      filteredNonStock += 1;
      continue;
    }
    if (!id || !title || !summary) continue;
    if (hasActionAdvice(title, summary)) {
      filteredActionAdvice += 1;
      continue;
    }

    alertEvents.push({
      userId,
      ruleKey: 'default-stock-digest',
      eventKey: `portfolio-alert:${id}`,
      entityKey,
      market,
      severity: normalizeSeverity(row.severity),
      reason: normalizeReason(row.reason),
      title,
      summary,
      payload: {
        sourceAlertId: id,
        stockOnly: true,
      },
      sourceKind: id.startsWith('change:') ? 'change_events' : 'v_user_feed_dedup',
      sourceRef: id,
      ...(toIsoString(row.created_at) ? { occurredAt: toIsoString(row.created_at) } : {}),
    });
  }

  return {
    sourceRows: rows.length,
    rule: defaultRule(userId),
    alertEvents,
    filteredNonStock,
    filteredActionAdvice,
  };
}

export function summarizePhase11AlertAudit(plan: Phase11AlertLedgerPlan): Phase11AlertAudit {
  const warnings = [
    ...(plan.filteredNonStock > 0
      ? [`${plan.filteredNonStock} non-stock alert candidate(s) were filtered.`]
      : []),
    ...(plan.filteredActionAdvice > 0
      ? [`${plan.filteredActionAdvice} action-advice alert candidate(s) were filtered.`]
      : []),
  ];
  return {
    sourceRows: plan.sourceRows,
    alertEvents: plan.alertEvents.length,
    filteredNonStock: plan.filteredNonStock,
    filteredActionAdvice: plan.filteredActionAdvice,
    warnings,
  };
}

export async function loadPhase11AlertRows(
  executor: Phase11ReadExecutor,
): Promise<Phase11AlertSourceRow[]> {
  return executor.queryRows(PHASE11_ALERT_SOURCE_ROWS_SQL, []);
}

export async function applyPhase11AlertLedgerPlan(
  plan: Phase11AlertLedgerPlan,
  executor: Phase11WriteExecutor,
  options: Phase11ApplyOptions,
): Promise<Phase11ApplyResult> {
  await executor.queryRows(UPSERT_RULE_SQL, [
    plan.rule.userId,
    plan.rule.ruleKey,
    plan.rule.scope,
    plan.rule.channel,
    plan.rule.enabled,
    plan.rule.severityThreshold,
    plan.rule.stockOnly,
    plan.rule.rateLimitMinutes,
  ]);

  for (const event of plan.alertEvents) {
    await executor.queryRows(UPSERT_ALERT_EVENT_SQL, [
      event.userId,
      event.ruleKey,
      event.eventKey,
      event.entityKey,
      event.market,
      event.severity,
      event.reason,
      event.title,
      event.summary,
      JSON.stringify(event.payload),
      event.sourceKind,
      event.sourceRef,
      event.occurredAt ?? null,
    ]);
  }

  const summary = summarizePhase11AlertAudit(plan);
  const rowsWritten = 1 + plan.alertEvents.length;
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
