import { createHash } from 'node:crypto';

import type { UserScope } from '../shared/user-scope';

export type MutationIdempotencyExecutor = {
  queryRows: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<TRow[]>;
};

type ClaimOptions = Readonly<{
  userScope: UserScope;
  idempotencyKey: string;
  operation: string;
  payload: unknown;
}>;

export type ExecuteMutationClaim = Readonly<{
  kind: 'execute';
  userId: string;
  idempotencyKey: string;
  operation: string;
  requestHash: string;
}>;

export type MutationClaim =
  | ExecuteMutationClaim
  | Readonly<{ kind: 'replay'; response: unknown }>
  | Readonly<{ kind: 'conflict' }>;

type ExistingClaimRow = {
  operation: string;
  request_hash: string;
  state: string;
  response_json: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationPattern = /^[a-z][a-z0-9_.-]{0,119}$/;

const CLAIM_SQL = `
  INSERT INTO public.app_mutation_idempotency (
    user_id, idempotency_key, operation, request_hash, state
  ) VALUES ($1::uuid, $2::uuid, $3::text, $4::char(64), 'pending')
  ON CONFLICT (user_id, idempotency_key) DO NOTHING
  RETURNING true AS inserted
`;

const EXISTING_SQL = `
  SELECT operation, request_hash, state, response_json
  FROM public.app_mutation_idempotency
  WHERE user_id = $1::uuid AND idempotency_key = $2::uuid
`;

const COMPLETE_SQL = `
  UPDATE public.app_mutation_idempotency
  SET state = 'completed', response_json = $5::jsonb, completed_at = now()
  WHERE user_id = $1::uuid
    AND idempotency_key = $2::uuid
    AND operation = $3::text
    AND request_hash = $4::char(64)
    AND state = 'pending'
  RETURNING true AS completed
`;

function canonicalize(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Mutation payload must contain finite numbers');
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('Mutation payload must not contain cycles');
    seen.add(value);
    const result = value.map((item) => (item === undefined ? null : canonicalize(item, seen)));
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('Mutation payload must not contain cycles');
    seen.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) result[key] = canonicalize(item, seen);
    }
    seen.delete(value);
    return result;
  }
  throw new Error('Mutation payload must be JSON-compatible');
}

export function hashMutationRequest(operation: string, payload: unknown): string {
  if (!operationPattern.test(operation)) throw new Error('Mutation operation is invalid');
  const canonical = JSON.stringify({ operation, payload: canonicalize(payload, new Set()) });
  return createHash('sha256').update(canonical).digest('hex');
}

export async function claimMutation(
  executor: MutationIdempotencyExecutor,
  options: ClaimOptions,
): Promise<MutationClaim> {
  if (!uuidPattern.test(options.idempotencyKey)) {
    throw new Error('Idempotency-Key must be a canonical UUID');
  }
  const requestHash = hashMutationRequest(options.operation, options.payload);
  const parameters = [
    options.userScope.userId,
    options.idempotencyKey.toLowerCase(),
    options.operation,
    requestHash,
  ] as const;
  const inserted = await executor.queryRows<{ inserted: boolean }>(CLAIM_SQL, parameters);
  if (inserted.length === 1) {
    return {
      kind: 'execute',
      userId: options.userScope.userId,
      idempotencyKey: options.idempotencyKey.toLowerCase(),
      operation: options.operation,
      requestHash,
    };
  }

  const existing = (
    await executor.queryRows<ExistingClaimRow>(EXISTING_SQL, parameters.slice(0, 2))
  )[0];
  if (
    existing === undefined ||
    existing.operation !== options.operation ||
    existing.request_hash.trim() !== requestHash
  ) {
    return { kind: 'conflict' };
  }
  if (existing.state === 'completed' && existing.response_json !== null) {
    return { kind: 'replay', response: existing.response_json };
  }
  return { kind: 'conflict' };
}

export async function completeMutation(
  executor: MutationIdempotencyExecutor,
  claim: ExecuteMutationClaim,
  response: unknown,
): Promise<void> {
  const serialized = JSON.stringify(canonicalize(response, new Set()));
  const rows = await executor.queryRows<{ completed: boolean }>(COMPLETE_SQL, [
    claim.userId,
    claim.idempotencyKey,
    claim.operation,
    claim.requestHash,
    serialized,
  ]);
  if (rows.length !== 1) throw new Error('Mutation idempotency completion failed');
}
