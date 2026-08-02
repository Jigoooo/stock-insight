import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('admin invitation console UI contract', () => {
  it('blocks the route loader before rendering member-visible admin data', async () => {
    const source = await read('routes/_authenticated/admin/invitations.tsx');
    assert.match(source, /loadAdminInvitationConsole/);
    assert.match(source, /if \(!data\.authorized\)/);
    assert.match(source, /throw redirect\(\{ to: '\/workspace'/);
  });

  it('uses semantic issuance, one-time disclosure, and revocation controls', async () => {
    const source = await read('pages/admin-invitations/ui/admin-invitation-page.tsx');
    assert.match(source, /<WorkspaceShell/);
    assert.match(source, /<PageHeader/);
    assert.match(source, /<Panel/);
    assert.match(source, /<DataTable/);
    assert.match(source, /<WorkspaceState/);
    assert.match(source, /<WorkspaceState[\s\S]*?announcement="inherit"[\s\S]*?kind="error"/);
    assert.match(source, /<DetailSurface/);
    assert.match(source, /<form/);
    assert.match(source, /<Field/);
    assert.match(source, /<div[^>]*data-testid="admin-invitation-status"/);
    assert.doesNotMatch(source, /<output[^>]*data-testid="admin-invitation-status"/);
    assert.match(source, /<InlineFeedbackRegion/);
    assert.doesNotMatch(source, /<output\b/);
    assert.match(source, /<PresenceRegion[\s\S]*?present=\{Boolean\(error\)\}/);
    assert.match(source, /<PresenceRegion[\s\S]*?present=\{Boolean\(revealedCode\)\}/);
    assert.match(source, /이 코드는 지금 한 번만 표시됩니다/);
    assert.match(source, /caption="가입 코드 발급 및 사용 상태"/);
    assert.match(source, /navigator\.clipboard[\s\S]*\.writeText/);
    const revokeHandlerStart = source.indexOf('const handleRevoke');
    const revokeHandlerEnd = source.indexOf('\n  return (', revokeHandlerStart);
    assert.ok(revokeHandlerStart >= 0 && revokeHandlerEnd > revokeHandlerStart);
    const revokeHandler = source.slice(revokeHandlerStart, revokeHandlerEnd);
    assert.match(revokeHandler, /try \{[\s\S]*await revokeInvitation/);
    assert.match(revokeHandler, /catch \{/);
    assert.match(source, /<th scope="row"[^>]*>/);
    assert.match(source, /aria-label=\{`\$\{invitation\.label\} 코드 폐기`\}/);
    assert.match(source, /\? \{ key: 'success', message: statusMessage \}/);
    assert.match(source, /listHeadingRef\.current\?\.focus\(\)/);
  });

  it('uses Stock Insight document branding without weakening the route gate', async () => {
    const source = await read('routes/_authenticated/admin/invitations.tsx');
    assert.match(source, /가입 코드 관리 \| Stock Insight/);
    assert.doesNotMatch(source, /Futur Insight/);
    assert.match(source, /관리자 전용 가입 코드 발급 및 폐기 화면/);
    assert.match(source, /if \(!data\.authorized\)/);
  });

  it('shows the workspace entry point only for invite managers', async () => {
    const source = await read('pages/research-workspace/ui/research-workspace-page.tsx');
    const route = await read('pages/research-workspace/ui/workspace-view-route.tsx');
    assert.match(source, /canManageInvitations/);
    assert.match(source, /\/admin\/invitations/);
    assert.match(route, /session\.capabilities\.canManageInvitations/);
  });
});
