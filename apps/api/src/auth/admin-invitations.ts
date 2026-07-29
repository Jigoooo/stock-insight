import { randomBytes } from 'node:crypto';

import { hashEnrollmentCode } from './enrollment-code.ts';

export type AdminQueryExecutor = <TRow extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: readonly unknown[],
) => Promise<TRow[]>;

export type AccountRole = 'owner' | 'admin' | 'member';
export type InvitationStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

export type AdminCapabilities = Readonly<{
  role: AccountRole;
  canManageInvitations: boolean;
}>;

export type AdminInvitation = Readonly<{
  invitationId: string;
  label: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  createdAt: string;
  createdByUsername: string | null;
  status: InvitationStatus;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const accountRoles = new Set<AccountRole>(['owner', 'admin', 'member']);
const invitationStatuses = new Set<InvitationStatus>(['active', 'revoked', 'expired', 'exhausted']);

function invalidState(): Error {
  return new Error('Invalid admin invitation state');
}

function parseTimestamp(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  const date =
    value instanceof Date ? value : typeof value === 'string' ? new Date(value) : undefined;
  if (!date || !Number.isFinite(date.getTime())) throw invalidState();
  return date.toISOString();
}

function parseInteger(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw invalidState();
  }
  return value;
}

function parseInvitation(row: Record<string, unknown>, issueResult = false): AdminInvitation {
  const invitationId = row.invitation_id;
  const label = row.label === null && !issueResult ? '기존 가입 코드' : row.label;
  const maxUses = parseInteger(row.max_uses, 1, 10);
  const usedCount = parseInteger(row.used_count, 0, maxUses);
  const statusValue = issueResult ? 'active' : row.status;
  if (
    typeof invitationId !== 'string' ||
    !UUID_PATTERN.test(invitationId) ||
    typeof label !== 'string' ||
    label.length < 1 ||
    label.length > 120 ||
    typeof statusValue !== 'string' ||
    !invitationStatuses.has(statusValue as InvitationStatus)
  ) {
    throw invalidState();
  }
  const createdByUsername = issueResult ? null : row.created_by_username;
  const revokedReason = issueResult ? null : row.revoked_reason;
  if (
    createdByUsername !== null &&
    (typeof createdByUsername !== 'string' || createdByUsername.length > 64)
  ) {
    throw invalidState();
  }
  if (revokedReason !== null && (typeof revokedReason !== 'string' || revokedReason.length > 240)) {
    throw invalidState();
  }
  return {
    invitationId,
    label,
    maxUses,
    usedCount,
    expiresAt: parseTimestamp(row.expires_at, true),
    revokedAt: issueResult ? null : parseTimestamp(row.revoked_at, true),
    revokedReason: revokedReason as string | null,
    createdAt: parseTimestamp(row.created_at)!,
    createdByUsername: createdByUsername as string | null,
    status: statusValue as InvitationStatus,
  };
}

export function generateInvitationCode(
  randomSource: (size: number) => Uint8Array = randomBytes,
): string {
  const entropy = randomSource(32);
  if (entropy.byteLength !== 32) throw invalidState();
  return Buffer.from(entropy).toString('base64url');
}

export async function loadAdminCapabilities(
  executor: AdminQueryExecutor,
): Promise<AdminCapabilities> {
  const rows = await executor<{ role: unknown; can_manage_invitations: unknown }>(
    'SELECT role, can_manage_invitations FROM public.get_app_capabilities()',
  );
  // Zero rows is a NORMAL state, not corruption: current_app_account_role()
  // returns an empty set for any authenticated user who simply has no row in
  // app_account_roles. Treating it as an error made every request from such a
  // user throw, filling the brain's logs with stack traces while the BFF's
  // fail-closed wrapper silently downgraded them to 'member' anyway. Answer the
  // least-privileged role directly and keep the failure signal for states that
  // really are impossible (multiple rows, unknown role, inconsistent flag).
  if (rows.length === 0) return { role: 'member', canManageInvitations: false };
  if (rows.length > 1) throw invalidState();
  const role = rows[0]?.role;
  const canManageInvitations = rows[0]?.can_manage_invitations;
  if (
    typeof role !== 'string' ||
    !accountRoles.has(role as AccountRole) ||
    typeof canManageInvitations !== 'boolean' ||
    canManageInvitations !== (role === 'owner' || role === 'admin')
  ) {
    throw invalidState();
  }
  return { role: role as AccountRole, canManageInvitations };
}

export async function issueAdminInvitation(
  executor: AdminQueryExecutor,
  input: Readonly<{ label: string; maxUses: number; expiresAt: Date }>,
  randomSource: (size: number) => Uint8Array = randomBytes,
): Promise<{ code: string; invitation: AdminInvitation }> {
  const code = generateInvitationCode(randomSource);
  const rows = await executor(
    `SELECT invitation_id::text, label, max_uses, used_count, expires_at, created_at
       FROM public.issue_app_invitation($1, $2, $3, $4)`,
    [hashEnrollmentCode(code), input.label, input.maxUses, input.expiresAt],
  );
  if (rows.length !== 1) throw invalidState();
  return { code, invitation: parseInvitation(rows[0]!, true) };
}

export async function listAdminInvitations(
  executor: AdminQueryExecutor,
): Promise<AdminInvitation[]> {
  const rows = await executor(
    `SELECT invitation_id::text, label, max_uses, used_count, expires_at, revoked_at,
            revoked_reason, created_at, created_by_username, status
       FROM public.list_app_invitations()`,
  );
  return rows.map((row) => parseInvitation(row));
}

export async function revokeAdminInvitation(
  executor: AdminQueryExecutor,
  invitationId: string,
  reason: string,
): Promise<boolean> {
  if (!UUID_PATTERN.test(invitationId)) throw invalidState();
  const rows = await executor(
    `SELECT invitation_id::text, revoked_at
       FROM public.revoke_app_invitation($1::uuid, $2)`,
    [invitationId, reason],
  );
  if (rows.length === 0) return false;
  if (
    rows.length !== 1 ||
    rows[0]?.invitation_id !== invitationId ||
    parseTimestamp(rows[0]?.revoked_at) === null
  ) {
    throw invalidState();
  }
  return true;
}
