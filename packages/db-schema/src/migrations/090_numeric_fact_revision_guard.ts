/**
 * Numeric facts use an immutable observation key per filing cell while revisions
 * are chained by restatement_group_key. Migration 031's shared guard required
 * fact_key equality, so replace only this table's trigger with the claim-aware
 * contract. Assertion and coverage guards remain on the original function.
 */
export const numericFactRevisionGuardMigrationSql = `
CREATE OR REPLACE FUNCTION world.guard_numeric_fact_revision_chain()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  previous world.numeric_fact%ROWTYPE;
BEGIN
  IF NEW.revision_no > 1 THEN
    SELECT prior.*
      INTO previous
      FROM world.numeric_fact prior
     WHERE prior.numeric_fact_id = NEW.supersedes_numeric_fact_id
     FOR SHARE;

    IF NOT FOUND
       OR previous.revision_no IS DISTINCT FROM NEW.revision_no - 1
       OR previous.restatement_group_key IS DISTINCT FROM NEW.restatement_group_key THEN
      RAISE EXCEPTION 'numeric-fact supersession must reference exact N-1 revision of the same restatement group';
    END IF;

    IF ROW(
         previous.entity_id,
         previous.concept_namespace,
         previous.concept_key,
         previous.unit,
         previous.currency,
         previous.scale_power,
         previous.period_start,
         previous.period_end,
         previous.instant_at,
         previous.fiscal_year,
         previous.fiscal_quarter,
         previous.dimensions_json,
         previous.metadata ->> 'metricDefinitionKey'
       ) IS DISTINCT FROM ROW(
         NEW.entity_id,
         NEW.concept_namespace,
         NEW.concept_key,
         NEW.unit,
         NEW.currency,
         NEW.scale_power,
         NEW.period_start,
         NEW.period_end,
         NEW.instant_at,
         NEW.fiscal_year,
         NEW.fiscal_quarter,
         NEW.dimensions_json,
         NEW.metadata ->> 'metricDefinitionKey'
       ) THEN
      RAISE EXCEPTION 'numeric-fact revision changes immutable claim structure';
    END IF;

    IF NEW.known_at < previous.known_at
       OR NEW.available_at < previous.available_at THEN
      RAISE EXCEPTION 'numeric-fact revision time cannot move backwards';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION world.guard_numeric_fact_revision_chain() IS
  'Enforces exact N-1 numeric-fact supersession within an immutable economic claim while permitting a distinct filing-cell fact key.';
REVOKE ALL ON FUNCTION world.guard_numeric_fact_revision_chain() FROM PUBLIC;

DROP TRIGGER IF EXISTS numeric_fact_revision_guard ON world.numeric_fact;
CREATE TRIGGER numeric_fact_revision_guard
BEFORE INSERT ON world.numeric_fact
FOR EACH ROW EXECUTE FUNCTION world.guard_numeric_fact_revision_chain();
`;
