export const cryptoServingAppReaderGrantMigrationSql = `
-- P6-7 — forward-only closure for production app-reader access to sanitized
-- crypto serving views. Raw crypto/cross-domain ledgers remain inaccessible.
GRANT USAGE ON SCHEMA crypto_serving TO stock_insight_app_reader;
GRANT SELECT ON
  crypto_serving.entity_revision,
  crypto_serving.event_revision,
  crypto_serving.core_relation_revision,
  crypto_serving.risk_exposure_revision
TO stock_insight_app_reader;
`;
