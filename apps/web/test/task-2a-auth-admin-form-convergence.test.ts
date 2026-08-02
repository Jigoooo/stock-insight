import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
const read = (path: string) => readFile(new URL(path, sourceRoot), 'utf8');

describe('Task 2A auth and administrator form convergence', () => {
  it('keeps authentication and administrator controls on shared public UI entry points', async () => {
    const sources = await Promise.all([
      read('pages/auth/login-page.tsx'),
      read('pages/auth/signup-page.tsx'),
      read('pages/auth/auth-input-field.tsx'),
      read('pages/admin-invitations/ui/admin-invitation-page.tsx'),
    ]);

    for (const source of sources) {
      assert.doesNotMatch(source, /<(?:input|button|select|textarea)\b/);
      assert.doesNotMatch(source, /@\/shared\/ui\/[^/'"]+\//);
    }

    assert.match(sources[0], /from '@\/shared\/ui\/button'/);
    assert.match(sources[1], /from '@\/shared\/ui\/button'/);
    assert.match(sources[2], /from '@\/shared\/ui\/input'/);
    assert.match(sources[3], /from '@\/shared\/ui\/(?:button|field|input|select)'/);
  });

  it('keeps focus and invalid visuals owned by shared controls', async () => {
    const css = await Promise.all([
      read('pages/auth/auth-page.module.css'),
      read('pages/admin-invitations/ui/admin-invitation-page.module.css'),
    ]);

    for (const source of css) {
      assert.doesNotMatch(source, /:focus(?:-visible|-within)?/);
      assert.doesNotMatch(source, /\boutline\s*:/);
      assert.doesNotMatch(source, /\bbox-shadow\s*:[^;]*(?:ring|focus)/i);
    }
  });

  it('uses the shared inline feedback presence contract in auth and administrator forms', async () => {
    const [feedback, authFeedback, admin] = await Promise.all([
      read('shared/ui/feedback/feedback.tsx'),
      read('pages/auth/auth-feedback-region.tsx'),
      read('pages/admin-invitations/ui/admin-invitation-page.tsx'),
    ]);

    assert.match(feedback, /export function InlineFeedbackRegion/);
    assert.match(feedback, /data-slot="inline-feedback-root"/);
    assert.match(feedback, /data-slot="inline-feedback-announcement"/);
    assert.match(feedback, /<PresenceRegion\b/);
    assert.match(authFeedback, /<InlineFeedbackRegion\b/);
    assert.match(admin, /<InlineFeedbackRegion\b/);
    assert.doesNotMatch(admin, /<output\b/);
  });

  it('delegates administrator pending visuals to Button and scopes them to the active action', async () => {
    const admin = await read('pages/admin-invitations/ui/admin-invitation-page.tsx');

    assert.match(admin, /type PendingAction/);
    assert.match(admin, /<form[^>]*aria-busy=\{pending\}/);
    assert.match(admin, /pending=\{pendingAction\?\.kind === 'issue'/);
    assert.match(admin, /pendingLabel="발급 중"/);
    assert.match(
      admin,
      /pending=\{[\s\S]*pendingAction\?\.invitationId === invitation\.invitationId/,
    );
    assert.match(admin, /pendingLabel="폐기 중"/);
    assert.doesNotMatch(admin, /pending \? '처리 중' : '코드 발급'/);
  });
});
