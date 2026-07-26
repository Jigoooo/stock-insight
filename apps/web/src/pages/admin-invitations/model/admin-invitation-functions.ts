import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { authFunctionMiddleware } from '@/server/auth/auth-middleware';
import { isSameOriginRequest } from '@/server/auth/csrf-origin';
import { createLoginRateLimiter } from '@/server/auth/login-rate-limit';

const issueInputSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    maxUses: z.number().int().min(1).max(10),
    expiresInHours: z.enum(['24', '72', '168']),
  })
  .strict();

const revokeInputSchema = z
  .object({
    invitationId: z.uuid(),
    reason: z.string().trim().min(1).max(240),
  })
  .strict();

const adminMutationRateLimiter = createLoginRateLimiter({ limit: 10, windowMs: 60_000 });
const genericError = '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';

function isPermissionDenied(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    const candidate = current as Error & { code?: unknown; cause?: unknown };
    if (candidate.code === '42501') return true;
    current = candidate.cause;
  }
  return false;
}

export const loadAdminInvitationConsole = createServerFn({ method: 'GET' })
  .middleware([authFunctionMiddleware])
  .handler(async ({ context }) => {
    const { setResponseHeader } = await import('@tanstack/react-start/server');
    const { listAdminInvitationsForUser, loadAdminCapabilitiesForUser } =
      await import('@/server/auth/admin-invitations');
    setResponseHeader('Cache-Control', 'no-store');
    const capabilities = await loadAdminCapabilitiesForUser(context.session.sub);
    if (!capabilities.canManageInvitations) {
      return { authorized: false as const, role: capabilities.role, invitations: [] };
    }
    return {
      authorized: true as const,
      role: capabilities.role === 'owner' ? ('owner' as const) : ('admin' as const),
      invitations: await listAdminInvitationsForUser(context.session.sub),
    };
  });

export const issueInvitation = createServerFn({ method: 'POST' })
  .middleware([authFunctionMiddleware])
  .validator(issueInputSchema)
  .handler(async ({ context, data }) => {
    const { getRequest, setResponseHeader, setResponseStatus } =
      await import('@tanstack/react-start/server');
    const { getAuthenticationOrigin } = await import('@/server/auth/auth-runtime');
    const { issueAdminInvitationForUser } = await import('@/server/auth/admin-invitations');
    setResponseHeader('Cache-Control', 'no-store');
    const request = getRequest();
    if (
      !isSameOriginRequest(
        request.method,
        request.headers.get('origin'),
        await getAuthenticationOrigin(),
      )
    ) {
      setResponseStatus(403);
      return { ok: false as const, error: genericError };
    }
    const admission = adminMutationRateLimiter.consume(context.session.sub);
    if (!admission.allowed) {
      setResponseStatus(429);
      setResponseHeader('Retry-After', String(admission.retryAfterSeconds));
      return { ok: false as const, error: genericError };
    }
    try {
      const result = await issueAdminInvitationForUser(context.session.sub, {
        label: data.label,
        maxUses: data.maxUses,
        expiresAt: new Date(Date.now() + Number(data.expiresInHours) * 60 * 60 * 1_000),
      });
      return { ok: true as const, ...result };
    } catch (error) {
      setResponseStatus(isPermissionDenied(error) ? 403 : 503);
      return { ok: false as const, error: genericError };
    }
  });

export const revokeInvitation = createServerFn({ method: 'POST' })
  .middleware([authFunctionMiddleware])
  .validator(revokeInputSchema)
  .handler(async ({ context, data }) => {
    const { getRequest, setResponseHeader, setResponseStatus } =
      await import('@tanstack/react-start/server');
    const { getAuthenticationOrigin } = await import('@/server/auth/auth-runtime');
    const { revokeAdminInvitationForUser } = await import('@/server/auth/admin-invitations');
    setResponseHeader('Cache-Control', 'no-store');
    const request = getRequest();
    if (
      !isSameOriginRequest(
        request.method,
        request.headers.get('origin'),
        await getAuthenticationOrigin(),
      )
    ) {
      setResponseStatus(403);
      return { ok: false as const, error: genericError };
    }
    const admission = adminMutationRateLimiter.consume(context.session.sub);
    if (!admission.allowed) {
      setResponseStatus(429);
      setResponseHeader('Retry-After', String(admission.retryAfterSeconds));
      return { ok: false as const, error: genericError };
    }
    try {
      const revoked = await revokeAdminInvitationForUser(
        context.session.sub,
        data.invitationId,
        data.reason,
      );
      if (!revoked) {
        setResponseStatus(409);
        return { ok: false as const, error: '이미 종료되었거나 존재하지 않는 코드입니다.' };
      }
      return { ok: true as const };
    } catch (error) {
      setResponseStatus(isPermissionDenied(error) ? 403 : 503);
      return { ok: false as const, error: genericError };
    }
  });
