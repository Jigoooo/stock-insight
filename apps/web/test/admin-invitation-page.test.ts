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
    assert.match(source, /<main/);
    assert.match(source, /<h1/);
    assert.match(source, /<form/);
    assert.match(source, /<label/);
    assert.match(source, /<output[^>]*aria-live="polite"/);
    assert.match(source, /이 코드는 지금 한 번만 표시됩니다/);
    assert.match(source, /<table/);
    assert.match(source, /<caption/);
    assert.match(source, /navigator\.clipboard[\s\S]*\.writeText/);
    const revokeHandlerStart = source.indexOf('const handleRevoke');
    const revokeHandlerEnd = source.indexOf('\n  return (', revokeHandlerStart);
    assert.ok(revokeHandlerStart >= 0 && revokeHandlerEnd > revokeHandlerStart);
    const revokeHandler = source.slice(revokeHandlerStart, revokeHandlerEnd);
    assert.match(revokeHandler, /try \{[\s\S]*await revokeInvitation/);
    assert.match(revokeHandler, /catch \{/);
    assert.match(source, /<th scope="row"[^>]*>/);
    assert.match(source, /aria-label=\{`\$\{invitation\.label\} 코드 폐기`\}/);
    assert.match(source, /statusMessage \? <span>/);
    assert.match(source, /listHeadingRef\.current\?\.focus\(\)/);
  });

  it('shows the workspace entry point only for invite managers', async () => {
    const source = await read('pages/research-workspace/ui/research-workspace-page.tsx');
    const route = await read('routes/_authenticated/workspace.tsx');
    assert.match(source, /canManageInvitations/);
    assert.match(source, /\/admin\/invitations/);
    assert.match(route, /session\.capabilities\.canManageInvitations/);
  });
});
