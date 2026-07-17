import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { isSameOriginRequest } from '@/server/auth/csrf-origin';
import {
  createConcurrencyGate,
  createLoginRateLimiter,
  normalizedClientKey,
} from '@/server/auth/login-rate-limit';
import { clearSessionCookieHeader, sessionCookieHeader } from '@/server/auth/session-cookie';

const invalidLoginMessage = '아이디 또는 비밀번호를 확인해 주세요.';
const loginInputSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(1_024),
  })
  .strict();

const enrollmentInputSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/),
    password: z.string().min(12).max(1_024),
    enrollmentCode: z.string().trim().min(1).max(256),
  })
  .strict();

const invalidEnrollmentMessage =
  '계정을 설정하지 못했습니다. 가입 코드와 입력 내용을 확인해 주세요.';

const globalLoginRateLimiter = createLoginRateLimiter({ limit: 30, windowMs: 60_000 });
const clientLoginRateLimiter = createLoginRateLimiter({ limit: 5, windowMs: 60_000 });
const accountLoginRateLimiter = createLoginRateLimiter({ limit: 5, windowMs: 60_000 });
const loginPasswordGate = createConcurrencyGate(2);
const globalEnrollmentRateLimiter = createLoginRateLimiter({
  limit: 20,
  windowMs: 10 * 60_000,
});
const clientEnrollmentRateLimiter = createLoginRateLimiter({
  limit: 5,
  windowMs: 10 * 60_000,
});

export const login = createServerFn({ method: 'POST' })
  .validator(loginInputSchema)
  .handler(async ({ data }) => {
    const { getRequest, setResponseHeader, setResponseStatus } =
      await import('@tanstack/react-start/server');
    const { authenticateConfiguredCredentials, getAuthenticationOrigin } =
      await import('@/server/auth/auth-runtime');

    const request = getRequest();
    const expectedOrigin = await getAuthenticationOrigin();
    if (!isSameOriginRequest(request.method, request.headers.get('origin'), expectedOrigin)) {
      setResponseStatus(403);
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidLoginMessage };
    }

    const clientKey = normalizedClientKey(request.headers);
    const accountKey = data.username.toLocaleLowerCase('en-US');
    const admissionLimits = [
      globalLoginRateLimiter.consume('global'),
      clientLoginRateLimiter.consume(clientKey),
      accountLoginRateLimiter.consume(accountKey),
    ];
    const blockedLimit = admissionLimits.find((limit) => !limit.allowed);
    if (blockedLimit) {
      setResponseStatus(429);
      setResponseHeader('Retry-After', String(blockedLimit.retryAfterSeconds));
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidLoginMessage };
    }

    const releasePasswordSlot = loginPasswordGate.tryAcquire();
    if (!releasePasswordSlot) {
      setResponseStatus(429);
      setResponseHeader('Retry-After', '1');
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidLoginMessage };
    }
    let authenticated;
    try {
      authenticated = await authenticateConfiguredCredentials(data);
    } finally {
      releasePasswordSlot();
    }
    if (!authenticated) {
      setResponseStatus(401);
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidLoginMessage };
    }

    accountLoginRateLimiter.reset(accountKey);
    setResponseHeader(
      'Set-Cookie',
      sessionCookieHeader(authenticated.token, authenticated.maxAgeSeconds),
    );
    setResponseHeader('Cache-Control', 'no-store');
    return {
      ok: true as const,
      user: {
        id: authenticated.session.sub,
        username: authenticated.session.username,
      },
    };
  });

export const getEnrollmentStatus = createServerFn({ method: 'GET' }).handler(async () => {
  const { setResponseHeader } = await import('@tanstack/react-start/server');
  const { getEnrollmentAvailability } = await import('@/server/auth/auth-runtime');
  const available = await getEnrollmentAvailability();
  setResponseHeader('Cache-Control', 'no-store');
  return { available };
});

export const enrollAccount = createServerFn({ method: 'POST' })
  .validator(enrollmentInputSchema)
  .handler(async ({ data }) => {
    const { getRequest, setResponseHeader, setResponseStatus } =
      await import('@tanstack/react-start/server');
    const { enrollLocalAccountCredentials, getAuthenticationOrigin } =
      await import('@/server/auth/auth-runtime');
    const request = getRequest();
    if (
      !isSameOriginRequest(
        request.method,
        request.headers.get('origin'),
        await getAuthenticationOrigin(),
      )
    ) {
      setResponseStatus(403);
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidEnrollmentMessage };
    }

    const clientKey = normalizedClientKey(request.headers);
    const admissionLimits = [
      globalEnrollmentRateLimiter.consume('global'),
      clientEnrollmentRateLimiter.consume(clientKey),
    ];
    const blockedLimit = admissionLimits.find((limit) => !limit.allowed);
    if (blockedLimit) {
      setResponseStatus(429);
      setResponseHeader('Retry-After', String(blockedLimit.retryAfterSeconds));
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidEnrollmentMessage };
    }

    const releasePasswordSlot = loginPasswordGate.tryAcquire();
    if (!releasePasswordSlot) {
      setResponseStatus(429);
      setResponseHeader('Retry-After', '1');
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidEnrollmentMessage };
    }

    let enrollment;
    try {
      enrollment = await enrollLocalAccountCredentials(data);
    } catch {
      setResponseStatus(503);
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidEnrollmentMessage };
    } finally {
      releasePasswordSlot();
    }
    if (enrollment.status === 'unavailable') {
      setResponseStatus(409);
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: '가입이 이미 완료되었습니다. 로그인해 주세요.' };
    }
    if (enrollment.status !== 'created') {
      setResponseStatus(400);
      setResponseHeader('Cache-Control', 'no-store');
      return { ok: false as const, error: invalidEnrollmentMessage };
    }

    setResponseHeader(
      'Set-Cookie',
      sessionCookieHeader(enrollment.token, enrollment.maxAgeSeconds),
    );
    setResponseHeader('Cache-Control', 'no-store');
    return {
      ok: true as const,
      user: {
        id: enrollment.session.sub,
        username: enrollment.session.username,
      },
    };
  });

export const getCurrentSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { getRequestHeader, setResponseHeader } = await import('@tanstack/react-start/server');
  const { readBoundSession } = await import('@/server/auth/auth-runtime');
  const session = await readBoundSession(getRequestHeader('cookie'));
  setResponseHeader('Cache-Control', 'private, no-store');
  setResponseHeader('Vary', 'Cookie');
  return session ? { user: { id: session.sub, username: session.username } } : null;
});

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const { getRequest, setResponseHeader, setResponseStatus } =
    await import('@tanstack/react-start/server');
  const { getAuthenticationOrigin } = await import('@/server/auth/auth-runtime');
  const request = getRequest();
  if (
    !isSameOriginRequest(
      request.method,
      request.headers.get('origin'),
      await getAuthenticationOrigin(),
    )
  ) {
    setResponseStatus(403);
    return { ok: false as const };
  }
  setResponseHeader('Set-Cookie', clearSessionCookieHeader());
  setResponseHeader('Cache-Control', 'no-store');
  return { ok: true as const };
});
