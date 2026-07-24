export const personalizationReaderSurfaceHardeningMigrationSql = `
-- XG — remove raw-table read capability while preserving the exact scoped
-- columns required by the read-only decision API. Existing RLS remains active.
REVOKE SELECT ON personalization.decision_packet
  FROM stock_insight_reader, stock_insight_writer;
REVOKE SELECT ON personalization.decision_packet_legal_review
  FROM stock_insight_reader, stock_insight_writer;

GRANT SELECT (
  decision_packet_id,
  user_id,
  security_entity_id,
  portfolio_snapshot_id,
  action,
  action_reason,
  abstention_reason,
  common_view_key,
  common_view_digest,
  common_view_as_of,
  generated_at,
  expires_at,
  advice_prohibited,
  order_executable,
  runtime_packet
) ON personalization.decision_packet
TO stock_insight_reader, stock_insight_writer;

GRANT SELECT (
  decision_packet_legal_review_id,
  decision_packet_id,
  user_id,
  review_status,
  reviewed_at,
  advice_prohibited,
  order_executable
) ON personalization.decision_packet_legal_review
TO stock_insight_reader, stock_insight_writer;

DO $effective_privilege_guard$
DECLARE
  application_role TEXT;
  leaked_column RECORD;
BEGIN
  FOREACH application_role IN ARRAY ARRAY['stock_insight_reader','stock_insight_writer'] LOOP
    SELECT column_name, table_name
      INTO leaked_column
      FROM information_schema.columns
     WHERE table_schema = 'personalization'
       AND (
         (table_name = 'decision_packet' AND NOT (column_name = ANY (ARRAY[
           'decision_packet_id','user_id','security_entity_id','portfolio_snapshot_id',
           'action','action_reason','abstention_reason','common_view_key',
           'common_view_digest','common_view_as_of','generated_at','expires_at',
           'advice_prohibited','order_executable','runtime_packet'
         ])))
         OR
         (table_name = 'decision_packet_legal_review' AND NOT (column_name = ANY (ARRAY[
           'decision_packet_legal_review_id','decision_packet_id','user_id',
           'review_status','reviewed_at','advice_prohibited','order_executable'
         ])))
       )
       AND has_column_privilege(
         application_role,
         format('%I.%I', table_schema, table_name),
         column_name,
         'SELECT'
       )
     ORDER BY table_name, ordinal_position
     LIMIT 1;
    IF leaked_column.column_name IS NOT NULL THEN
      RAISE EXCEPTION 'effective raw personalization read privilege remains for % on %.%',
        application_role, leaked_column.table_name, leaked_column.column_name
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END
$effective_privilege_guard$;
`;
