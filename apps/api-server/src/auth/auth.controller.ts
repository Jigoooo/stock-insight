import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';

import { authenticateCredentials, enrollAccount, resolveAccountIdentity } from './auth.service.ts';
import { getInternalContextSecret } from './internal-secret.ts';
import { apiError } from '../common/http.ts';
import { requireRequestScope, requireRequestUserScope } from '../read/internal-context-store.ts';

import {
  createReadOnlyDatabaseClient,
  createScopedDatabaseClient,
  createScopedReadOnlyDatabaseClient,
  createSignupDatabaseClient,
  hashEnrollmentCode,
  issueAdminInvitation,
  listAdminInvitations,
  loadAdminCapabilities,
  revokeAdminInvitation,
  type AdminCapabilities,
} from '@stock-insight/api';

const usernameSchema = z.string().regex(/^[A-Za-z0-9._-]{3,64}$/);

const credentialsSchema = z.object({
  username: z.string().max(256),
  password: z.string().max(1024),
});

const enrollSchema = z.object({
  username: z.string().max(256),
  password: z.string().max(1024),
  enrollmentCode: z.string().max(256),
});

const issueInvitationSchema = z.object({
  label: z.string().min(1).max(120),
  maxUses: z.number().int().min(1).max(10),
  expiresAt: z.string().datetime(),
});

const revokeInvitationSchema = z.object({
  invitationId: z.string().uuid(),
  reason: z.string().max(240),
});

function unavailable(): never {
  throw apiError('AUTH_DATABASE_UNAVAILABLE', 503);
}

// Pre-authentication reads (login, session refresh) have no user scope yet, so
// they use the unscoped reader. Every statement still runs BEGIN READ ONLY and
// only ever reaches the SECURITY DEFINER lookup functions.
function requireUnscopedReader() {
  const database = createReadOnlyDatabaseClient();
  if (database.kind !== 'configured') unavailable();
  return database;
}

function requireScopedReader(userId: string) {
  const database = createScopedReadOnlyDatabaseClient(userId);
  if (database.kind !== 'configured') unavailable();
  return database;
}

function requireScopedWriter(userId: string) {
  const database = createScopedDatabaseClient(userId);
  if (database.kind !== 'configured') unavailable();
  return database;
}

// Anonymous (pre-authentication) routes must NOT be reachable with a user
// context and vice versa, so each handler asserts the scope kind it expects.
function requireAnonymousScope(): void {
  if (requireRequestScope().kind !== 'anonymous') throw apiError('UNAUTHORIZED', 401);
}

@Controller('auth')
export class AuthController {
  // --- pre-authentication (anonymous internal context) ---

  @Post('authenticate')
  // Legacy parity: apps/web answered 200 for a login attempt (success OR
  // rejection); Nest's default for POST is 201, which would silently change the
  // contract the BFF reads.
  @HttpCode(HttpStatus.OK)
  async authenticate(@Body() body: unknown) {
    requireAnonymousScope();
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) return { status: 'rejected' as const };
    const database = requireUnscopedReader();
    return authenticateCredentials(database.queryRows, getInternalContextSecret(), parsed.data);
  }

  @Get('account')
  async accountById(@Query('userId') userId?: string) {
    requireAnonymousScope();
    if (typeof userId !== 'string') throw apiError('VALIDATION_FAILED', 400);
    const database = requireUnscopedReader();
    const identity = await resolveAccountIdentity(
      database.queryRows,
      getInternalContextSecret(),
      userId,
    );
    return identity ? { status: 'found' as const, identity } : { status: 'not_found' as const };
  }

  @Post('enroll')
  // Legacy parity: signup answered 200 regardless of outcome (created /
  // invalid_code / unavailable), never 201.
  @HttpCode(HttpStatus.OK)
  async enroll(@Body() body: unknown) {
    requireAnonymousScope();
    const parsed = enrollSchema.safeParse(body);
    if (!parsed.success) return { status: 'invalid_code' as const };
    if (!usernameSchema.safeParse(parsed.data.username).success) {
      return { status: 'invalid_code' as const };
    }
    const database = createSignupDatabaseClient();
    if (database.kind !== 'configured') unavailable();

    return enrollAccount(
      {
        hashCode: hashEnrollmentCode,
        consumeInvitation: (codeDigest, username, passwordRecord) =>
          database.withTransaction(async (executor) => {
            const rows = await executor.queryRows<{ status: string; user_id: string | null }>(
              `SELECT status, user_id::text AS user_id
                 FROM public.consume_invitation_and_create_account($1, $2, $3)`,
              [codeDigest, username, passwordRecord],
            );
            return rows[0];
          }),
      },
      getInternalContextSecret(),
      parsed.data,
    );
  }

  // --- authenticated admin surface (user internal context) ---

  @Get('capabilities')
  async capabilities(): Promise<AdminCapabilities> {
    const { userId } = requireRequestUserScope();
    const database = requireScopedReader(userId);
    return loadAdminCapabilities(database.queryRows);
  }

  @Get('invitations')
  async invitations() {
    const { userId } = requireRequestUserScope();
    const database = requireScopedReader(userId);
    return { invitations: await listAdminInvitations(database.queryRows) };
  }

  @Post('invitations')
  // Legacy parity: the admin console read a 200 envelope, not Nest's default 201.
  @HttpCode(HttpStatus.OK)
  async issueInvitation(@Body() body: unknown) {
    const { userId } = requireRequestUserScope();
    const parsed = issueInvitationSchema.safeParse(body);
    if (!parsed.success) throw apiError('VALIDATION_FAILED', 400);
    const database = requireScopedWriter(userId);
    return database.withTransaction((executor) =>
      issueAdminInvitation(executor.queryRows, {
        label: parsed.data.label,
        maxUses: parsed.data.maxUses,
        expiresAt: new Date(parsed.data.expiresAt),
      }),
    );
  }

  @Delete('invitations/:invitationId')
  async revokeInvitation(@Param('invitationId') invitationId: string, @Body() body: unknown) {
    const { userId } = requireRequestUserScope();
    const parsed = revokeInvitationSchema.safeParse({
      invitationId,
      reason: (body as { reason?: unknown })?.reason ?? '',
    });
    if (!parsed.success) throw apiError('VALIDATION_FAILED', 400);
    const database = requireScopedWriter(userId);
    const revoked = await database.withTransaction((executor) =>
      revokeAdminInvitation(executor.queryRows, parsed.data.invitationId, parsed.data.reason),
    );
    return { revoked };
  }
}
