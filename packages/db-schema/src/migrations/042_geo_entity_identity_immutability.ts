export const geoEntityIdentityImmutabilityMigrationSql = `
-- P3-D — Canonical geo identity immutability.
-- Additive migration 042. Spatial and precision changes belong in the append-only
-- geo.entity_revision ledger; mutating the parent name/kind/key would leak future
-- identity state into historical point-in-time snapshots.

CREATE OR REPLACE FUNCTION geo.reject_entity_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'geo entity identity is immutable; append a geo.entity_revision instead'
    USING ERRCODE = '55000';
END $$;

DROP TRIGGER IF EXISTS geo_entity_identity_immutable ON geo.entity;
CREATE TRIGGER geo_entity_identity_immutable
BEFORE UPDATE OR DELETE ON geo.entity
FOR EACH ROW EXECUTE FUNCTION geo.reject_entity_identity_mutation();
`;
