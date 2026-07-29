// Moved from apps/web/test/ by the P2 brain split: the module under test now
// lives in the brain (apps/api/src/auth). Assertions are unchanged.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  generateInvitationCode,
  issueAdminInvitation,
  listAdminInvitations,
  loadAdminCapabilities,
  revokeAdminInvitation,
  type AdminQueryExecutor,
} from '../src/auth/admin-invitations.ts';
import { hashEnrollmentCode } from '../src/auth/enrollment-code.ts';

function recordingExecutor(rows: Record<string, unknown>[] = []) {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = [];
  const executor: AdminQueryExecutor = async (sql, params = []) => {
    calls.push({ sql, params });
    return rows;
  };
  return { calls, executor };
}

describe('admin invitations runtime', () => {
  it('generates a high-entropy URL-safe code', () => {
    const code = generateInvitationCode(() => Buffer.alloc(32, 0xab));
    assert.equal(code.length, 43);
    assert.match(code, /^[A-Za-z0-9_-]+$/);
  });

  it('issues through the scoped DB function without persisting plaintext', async () => {
    const db = recordingExecutor([
      {
        invitation_id: '11111111-1111-4111-8111-111111111111',
        label: '친구 초대',
        max_uses: 1,
        used_count: 0,
        expires_at: new Date('2026-07-28T00:00:00Z'),
        created_at: new Date('2026-07-27T00:00:00Z'),
      },
    ]);
    const result = await issueAdminInvitation(
      db.executor,
      { label: '친구 초대', maxUses: 1, expiresAt: new Date('2026-07-28T00:00:00Z') },
      () => Buffer.alloc(32, 0xcd),
    );

    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0]!.sql, /issue_app_invitation/);
    assert.equal(db.calls[0]!.params[0], hashEnrollmentCode(result.code));
    assert.ok(!db.calls[0]!.params.includes(result.code));
    assert.equal(result.invitation.status, 'active');
  });

  it('loads capabilities and invitation status from DB-authoritative functions', async () => {
    const capabilitiesDb = recordingExecutor([{ role: 'owner', can_manage_invitations: true }]);
    assert.deepEqual(await loadAdminCapabilities(capabilitiesDb.executor), {
      role: 'owner',
      canManageInvitations: true,
    });

    const listDb = recordingExecutor([
      {
        invitation_id: '22222222-2222-4222-8222-222222222222',
        label: '만료 예정',
        max_uses: 2,
        used_count: 1,
        expires_at: '2026-07-28T00:00:00.000Z',
        revoked_at: null,
        revoked_reason: null,
        created_at: '2026-07-27T00:00:00.000Z',
        created_by_username: 'owner',
        status: 'active',
      },
    ]);
    const invitations = await listAdminInvitations(listDb.executor);
    assert.equal(invitations[0]?.status, 'active');
    assert.equal(invitations[0]?.createdByUsername, 'owner');
  });

  it('preserves legacy invitations with nullable labels and expiry', async () => {
    const listDb = recordingExecutor([
      {
        invitation_id: '44444444-4444-4444-8444-444444444444',
        label: null,
        max_uses: 1,
        used_count: 1,
        expires_at: null,
        revoked_at: null,
        revoked_reason: null,
        created_at: '2026-07-20T00:00:00.000Z',
        created_by_username: null,
        status: 'exhausted',
      },
    ]);

    assert.deepEqual((await listAdminInvitations(listDb.executor))[0], {
      invitationId: '44444444-4444-4444-8444-444444444444',
      label: '기존 가입 코드',
      maxUses: 1,
      usedCount: 1,
      expiresAt: null,
      revokedAt: null,
      revokedReason: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      createdByUsername: null,
      status: 'exhausted',
    });
  });

  it('fails closed on malformed DB rows', async () => {
    const db = recordingExecutor([{ role: 'root', can_manage_invitations: true }]);
    await assert.rejects(
      () => loadAdminCapabilities(db.executor),
      /Invalid admin invitation state/,
    );
  });

  it('revokes through the DB function and distinguishes a missing active row', async () => {
    const successDb = recordingExecutor([
      {
        invitation_id: '33333333-3333-4333-8333-333333333333',
        revoked_at: '2026-07-27T02:00:00.000Z',
      },
    ]);
    assert.equal(
      await revokeAdminInvitation(
        successDb.executor,
        '33333333-3333-4333-8333-333333333333',
        '발급 취소',
      ),
      true,
    );
    assert.match(successDb.calls[0]!.sql, /revoke_app_invitation/);

    assert.equal(
      await revokeAdminInvitation(
        recordingExecutor([]).executor,
        '33333333-3333-4333-8333-333333333333',
        '발급 취소',
      ),
      false,
    );
  });
});
