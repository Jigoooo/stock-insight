import { requireRequestUserScope } from '../read/internal-context-store.ts';
import {
  resolvePersonalizationMutationPolicy,
  type PersonalizationMutationPolicy,
} from '../write/mutation-policy.ts';

import {
  appendUserThesisRevision,
  claimMutation,
  completeMutation,
  createScopedDatabaseClient,
  parseServerEnv,
  type PersonalizationThesisExecutor,
} from '@stock-insight/api';
import {
  personalizationThesisSchema,
  personalizationThesisWriteInputSchema,
} from '@stock-insight/contracts/personalization';

export type PersonalizationMutationHttpResult = {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
};

type RouteDatabase = {
  database: Extract<ReturnType<typeof createScopedDatabaseClient>, { kind: 'configured' }>;
  userScope: { userId: string };
};

export type PersonalizationMutationDeps = {
  resolvePolicy: () => PersonalizationMutationPolicy;
  routeDatabase: () => RouteDatabase | undefined;
  now: () => Date;
  generateId?: () => string;
};

const idempotencyKeyPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entityKeyPattern = /^(?:KR:\d{6}|US:[A-Z][A-Z0-9]{0,7}(?:[.-][A-Z0-9]{1,2})?)$/;

function createRouteDatabase(): RouteDatabase | undefined {
  const userScope = requireRequestUserScope();
  const database = createScopedDatabaseClient(userScope.userId, parseServerEnv());
  return database.kind === 'disabled' ? undefined : { database, userScope };
}

const defaultDeps: PersonalizationMutationDeps = {
  resolvePolicy: () => resolvePersonalizationMutationPolicy(),
  routeDatabase: createRouteDatabase,
  now: () => new Date(),
};

function errorResult(
  status: number,
  code: string,
  message: string,
): PersonalizationMutationHttpResult {
  return { status, body: { error: { code, message } } };
}

export async function handleThesisAppend(
  idempotencyKeyRaw: string | undefined,
  entityKey: string,
  body: unknown,
  deps: PersonalizationMutationDeps = defaultDeps,
): Promise<PersonalizationMutationHttpResult> {
  if (!entityKeyPattern.test(entityKey)) {
    return errorResult(400, 'PERSONALIZATION_BAD_REQUEST', 'securityKey 형식이 올바르지 않습니다.');
  }
  const parsed = personalizationThesisWriteInputSchema.safeParse(body);
  if (!parsed.success) {
    return errorResult(400, 'PERSONALIZATION_BAD_REQUEST', '논지 입력 형식이 올바르지 않습니다.');
  }
  const policy = deps.resolvePolicy();
  if (!policy.enabled) {
    return errorResult(
      policy.status,
      policy.errorCode,
      '개인화 쓰기 기능이 비활성화되어 있습니다.',
    );
  }
  const idempotencyKey = idempotencyKeyRaw?.trim();
  if (!idempotencyKey) {
    return errorResult(428, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key UUID가 필요합니다.');
  }
  if (!idempotencyKeyPattern.test(idempotencyKey)) {
    return errorResult(
      400,
      'PERSONALIZATION_BAD_REQUEST',
      'Idempotency-Key 형식이 올바르지 않습니다.',
    );
  }
  const route = deps.routeDatabase();
  if (!route) {
    return errorResult(
      503,
      'DATABASE_WRITE_URL_NOT_CONFIGURED',
      '쓰기 데이터베이스가 설정되지 않았습니다.',
    );
  }
  const now = deps.now();
  if (!Number.isFinite(now.getTime())) {
    return errorResult(
      500,
      'PERSONALIZATION_WRITE_FAILED',
      '개인화 쓰기 시각이 올바르지 않습니다.',
    );
  }

  try {
    const outcome = await route.database.withTransaction(async (executor) => {
      const claim = await claimMutation(executor, {
        userScope: route.userScope,
        idempotencyKey,
        operation: 'thesis.append',
        payload: { entityKey, ...parsed.data },
      });
      if (claim.kind !== 'execute') return claim;
      const response = await appendUserThesisRevision(executor as PersonalizationThesisExecutor, {
        userScope: route.userScope,
        entityKey,
        input: parsed.data,
        now,
        ...(deps.generateId ? { generateId: deps.generateId } : {}),
      });
      await completeMutation(executor, claim, response);
      return { kind: 'completed' as const, response };
    });
    if (outcome.kind === 'conflict') {
      return errorResult(
        409,
        'IDEMPOTENCY_CONFLICT',
        '이미 처리 중이거나 다른 요청에 사용된 키입니다.',
      );
    }
    if (outcome.kind === 'replay') {
      const response = personalizationThesisSchema.parse(outcome.response);
      return { status: 200, body: response, headers: { 'Idempotency-Replayed': 'true' } };
    }
    return { status: 201, body: outcome.response };
  } catch {
    return errorResult(500, 'PERSONALIZATION_WRITE_FAILED', '논지 revision 저장에 실패했습니다.');
  }
}
