export const provenanceOutboxMigrationSql = `
-- B1 — Provenance, event contract, outbox/inbox (master plan §5.1/§5.2, B1).
-- Additive-only. PostgreSQL stays the authoritative queue; Kafka/broker runtime
-- is deferred behind the broker-neutral EventPublisher port.

CREATE SCHEMA IF NOT EXISTS ops;

-- 1) Event schema registry: every event_type/schema_version pair is declared
--    before a producer may emit it (fail-closed producers).
CREATE TABLE IF NOT EXISTS ops.event_schema_registry (
    event_type      TEXT NOT NULL,
    schema_version  INTEGER NOT NULL,
    payload_schema  JSONB NOT NULL DEFAULT '{}',
    description     TEXT,
    active          BOOLEAN NOT NULL DEFAULT true,
    registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_type, schema_version)
);

-- 2) Transactional outbox. Deterministic event_id; one event per aggregate
--    version. Same aggregate/version with a different payload hash is a
--    conflict (quarantined in ops.outbox_conflict, never silently replaced).
CREATE TABLE IF NOT EXISTS ops.outbox_event (
    event_id          TEXT PRIMARY KEY,
    event_type        TEXT NOT NULL,
    schema_version    INTEGER NOT NULL,
    aggregate_type    TEXT NOT NULL,
    aggregate_id      TEXT NOT NULL,
    aggregate_version BIGINT NOT NULL,
    partition_key     TEXT NOT NULL,
    occurred_at       TIMESTAMPTZ NOT NULL,
    available_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    produced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    producer          TEXT NOT NULL,
    trace_id          TEXT,
    causation_id      TEXT,
    correlation_id    TEXT,
    payload           JSONB NOT NULL,
    payload_hash      TEXT NOT NULL,
    CONSTRAINT uq_outbox_event_aggregate UNIQUE (aggregate_type, aggregate_id, aggregate_version),
    CONSTRAINT fk_outbox_event_schema FOREIGN KEY (event_type, schema_version)
      REFERENCES ops.event_schema_registry (event_type, schema_version)
);

CREATE TABLE IF NOT EXISTS ops.outbox_conflict (
    conflict_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aggregate_type    TEXT NOT NULL,
    aggregate_id      TEXT NOT NULL,
    aggregate_version BIGINT NOT NULL,
    existing_event_id TEXT NOT NULL,
    attempted_payload JSONB NOT NULL,
    attempted_hash    TEXT NOT NULL,
    producer          TEXT NOT NULL,
    detected_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Per-destination durable delivery with lease fencing and bounded retries.
CREATE TABLE IF NOT EXISTS ops.outbox_delivery (
    delivery_id   TEXT PRIMARY KEY,
    event_id      TEXT NOT NULL REFERENCES ops.outbox_event (event_id),
    destination   TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'leased', 'delivered', 'dead')),
    attempts      INTEGER NOT NULL DEFAULT 0,
    max_attempts  INTEGER NOT NULL DEFAULT 8,
    not_before    TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_token   TEXT,
    lease_until   TIMESTAMPTZ,
    last_error    TEXT,
    delivered_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_outbox_delivery_event_destination UNIQUE (event_id, destination)
);

CREATE INDEX IF NOT EXISTS ix_outbox_delivery_due
ON ops.outbox_delivery (destination, not_before)
WHERE status IN ('pending', 'leased');

-- 4) Consumer inbox: PK (consumer_id, event_id) — independent receipt per
--    fan-out consumer, processed in the same transaction as its projection.
CREATE TABLE IF NOT EXISTS ops.consumer_inbox (
    consumer_id  TEXT NOT NULL,
    event_id     TEXT NOT NULL REFERENCES ops.outbox_event (event_id),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer_id, event_id)
);

-- 5) Bounded dead letter: append-only, inspectable, replayable by operators.
CREATE TABLE IF NOT EXISTS ops.dead_letter (
    dead_letter_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_id    TEXT NOT NULL,
    event_id       TEXT NOT NULL,
    destination    TEXT NOT NULL,
    attempts       INTEGER NOT NULL,
    last_error     TEXT,
    dead_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6) Seed schema registry with the B1 core event types (idempotent).
INSERT INTO ops.event_schema_registry (event_type, schema_version, description)
VALUES
  ('report.published', 1, 'A report was atomically published and the latest pointer swapped.'),
  ('event_brief.published', 1, 'An incremental event brief was published.'),
  ('knowledge.document_extracted', 1, 'A knowledge document finished claim/event extraction.'),
  ('relation.revised', 1, 'A relation identity gained a new revision.'),
  ('source.revision.appended', 1, 'An immutable source record revision and raw lineage were committed.')
ON CONFLICT (event_type, schema_version) DO NOTHING;

CREATE OR REPLACE FUNCTION ops.reject_outbox_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only',TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME USING ERRCODE='55000';
END $$;

DROP TRIGGER IF EXISTS outbox_event_immutable ON ops.outbox_event;
CREATE TRIGGER outbox_event_immutable BEFORE UPDATE OR DELETE ON ops.outbox_event
FOR EACH ROW EXECUTE FUNCTION ops.reject_outbox_audit_mutation();
DROP TRIGGER IF EXISTS outbox_conflict_immutable ON ops.outbox_conflict;
CREATE TRIGGER outbox_conflict_immutable BEFORE UPDATE OR DELETE ON ops.outbox_conflict
FOR EACH ROW EXECUTE FUNCTION ops.reject_outbox_audit_mutation();
DROP TRIGGER IF EXISTS dead_letter_immutable ON ops.dead_letter;
CREATE TRIGGER dead_letter_immutable BEFORE UPDATE OR DELETE ON ops.dead_letter
FOR EACH ROW EXECUTE FUNCTION ops.reject_outbox_audit_mutation();
`;
