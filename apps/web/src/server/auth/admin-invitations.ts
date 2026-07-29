import '@tanstack/react-start/server-only';

import { brainRequest } from '../brain-client.ts';

// Invitation administration. All SQL now lives in the brain; this module is a
// typed HTTP facade so the console keeps its existing shape.

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

function scopeFor(userId: string) {
  return { kind: 'user' as const, userId };
}

export async function loadAdminCapabilitiesForUser(userId: string): Promise<AdminCapabilities> {
  return brainRequest<AdminCapabilities>('/v1/auth/capabilities', { scope: scopeFor(userId) });
}

// Any failure degrades to the least-privileged answer rather than surfacing an
// error, so a brain outage can never accidentally reveal an admin surface.
export async function loadFailClosedAdminCapabilitiesForUser(
  userId: string,
  loader: (subject: string) => Promise<AdminCapabilities> = loadAdminCapabilitiesForUser,
): Promise<AdminCapabilities> {
  try {
    return await loader(userId);
  } catch {
    return { role: 'member', canManageInvitations: false };
  }
}

export async function listAdminInvitationsForUser(userId: string): Promise<AdminInvitation[]> {
  const result = await brainRequest<{ invitations: AdminInvitation[] }>('/v1/auth/invitations', {
    scope: scopeFor(userId),
  });
  return result.invitations;
}

export async function issueAdminInvitationForUser(
  userId: string,
  input: Readonly<{ label: string; maxUses: number; expiresAt: Date }>,
): Promise<{ code: string; invitation: AdminInvitation }> {
  return brainRequest('/v1/auth/invitations', {
    scope: scopeFor(userId),
    method: 'POST',
    body: {
      label: input.label,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt.toISOString(),
    },
  });
}

export async function revokeAdminInvitationForUser(
  userId: string,
  invitationId: string,
  reason: string,
): Promise<boolean> {
  const result = await brainRequest<{ revoked: boolean }>(
    `/v1/auth/invitations/${encodeURIComponent(invitationId)}`,
    { scope: scopeFor(userId), method: 'DELETE', body: { reason } },
  );
  return result.revoked;
}
