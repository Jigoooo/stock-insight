export const appMutationIdempotencyMigrationSql = `
CREATE TABLE IF NOT EXISTS public.app_mutation_idempotency (
  user_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  operation text NOT NULL CHECK (length(trim(operation)) BETWEEN 1 AND 120),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed')),
  response_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, idempotency_key),
  CHECK (
    (state = 'pending' AND completed_at IS NULL AND response_json IS NULL)
    OR (state = 'completed' AND completed_at IS NOT NULL AND response_json IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS app_mutation_idempotency_created_at_idx
  ON public.app_mutation_idempotency (created_at DESC);
`;
