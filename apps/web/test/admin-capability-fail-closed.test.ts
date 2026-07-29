import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadFailClosedAdminCapabilitiesForUser } from '../src/server/auth/admin-invitations.ts';

// The invitation SQL moved to the brain (covered by
// apps/api/test/admin-invitations.test.ts). What remains on the BFF is the
// fail-closed wrapper, and its guarantee matters more after the split than
// before: the capability lookup is now a NETWORK call, so a brain outage or a
// timeout must degrade to the least-privileged answer rather than surfacing an
// error — or, worse, an admin surface.
describe('admin capability fail-closed wrapper', () => {
  it('keeps the authenticated session usable while failing admin capability closed', async () => {
    const capabilities = await loadFailClosedAdminCapabilitiesForUser(
      '11111111-1111-4111-8111-111111111111',
      async () => {
        throw new Error('database unavailable');
      },
    );
    assert.deepEqual(capabilities, { role: 'member', canManageInvitations: false });
  });

  it('degrades to member on a brain transport failure', async () => {
    for (const failure of [
      new Error('fetch failed'),
      new Error('The operation was aborted'),
      Object.assign(new Error('Brain request failed (503)'), { status: 503 }),
    ]) {
      const capabilities = await loadFailClosedAdminCapabilitiesForUser(
        '11111111-1111-4111-8111-111111111111',
        async () => {
          throw failure;
        },
      );
      assert.deepEqual(
        capabilities,
        { role: 'member', canManageInvitations: false },
        `failure=${failure.message}`,
      );
    }
  });

  it('passes a genuine capability answer through unchanged', async () => {
    const capabilities = await loadFailClosedAdminCapabilitiesForUser(
      '11111111-1111-4111-8111-111111111111',
      async () => ({ role: 'owner', canManageInvitations: true }),
    );
    assert.deepEqual(capabilities, { role: 'owner', canManageInvitations: true });
  });
});
