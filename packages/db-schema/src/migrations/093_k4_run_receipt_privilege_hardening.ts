export const k4RunReceiptPrivilegeHardeningMigrationSql = `
-- Migration 013 installed a historical default SELECT grant for the runtime
-- app reader. Migration 091 therefore made this later-created operational
-- receipt reachable even though p4.v2 serves only five filtered projections.
-- Close that single raw-ledger boundary without changing pipeline access.
DO $k4_receipt_privilege_boundary$
DECLARE
  runtime_role text;
BEGIN
  IF to_regclass('analytics.market_intelligence_run_receipt') IS NULL THEN
    RAISE EXCEPTION
      'analytics.market_intelligence_run_receipt must exist before privilege hardening';
  END IF;

  REVOKE ALL PRIVILEGES ON TABLE analytics.market_intelligence_run_receipt FROM PUBLIC;

  FOREACH runtime_role IN ARRAY ARRAY[
    'stock_insight_app_reader',
    'stock_insight_app_writer'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_roles
       WHERE rolname = runtime_role
    ) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE analytics.market_intelligence_run_receipt FROM %I',
        runtime_role
      );
    END IF;
  END LOOP;
END
$k4_receipt_privilege_boundary$;

COMMENT ON TABLE analytics.market_intelligence_run_receipt IS
  'Append-only K4 operational receipt. Pipeline roles only; never a runtime application read surface.';
`;
