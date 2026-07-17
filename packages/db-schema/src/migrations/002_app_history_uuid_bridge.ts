export const appHistoryUuidBridgeMigrationSql = `
CREATE TABLE IF NOT EXISTS public.app_user_identity_map (
  legacy_user_id text PRIMARY KEY CHECK (length(trim(legacy_user_id)) > 0),
  user_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_user_identity_map_user_id_idx
  ON public.app_user_identity_map (user_id);

CREATE OR REPLACE VIEW public.v_user_decision_history_v3 AS
SELECT
  (
    substr(history_key.digest, 1, 8) || '-' ||
    substr(history_key.digest, 9, 4) || '-8' ||
    substr(history_key.digest, 14, 3) || '-a' ||
    substr(history_key.digest, 18, 3) || '-' ||
    substr(history_key.digest, 21, 12)
  )::uuid AS history_id,
  identity_map.user_id,
  journal.entry_key,
  journal.entity_key,
  journal.market,
  journal.entry_type,
  journal.title,
  journal.thesis_text,
  journal.evidence_json,
  journal.source_kind,
  journal.source_ref,
  journal.occurred_at,
  journal.review_due_at,
  journal.status,
  journal.advice_prohibited,
  journal.created_at,
  journal.updated_at,
  entity.name AS entity_name,
  entity.symbol
FROM public.user_decision_journal_entries journal
CROSS JOIN LATERAL (
  SELECT md5('stock-insight:decision-history:' || journal.entry_key) AS digest
) history_key
JOIN public.app_user_identity_map identity_map
  ON identity_map.legacy_user_id = journal.user_id
LEFT JOIN public.entities entity
  ON entity.entity_key = journal.entity_key;
`;
