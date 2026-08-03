import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const serverUrl = new URL('../src/server/research-workspace.ts', import.meta.url);
const modelUrl = new URL(
  '../src/pages/research-workspace/model/load-research-workspace.ts',
  import.meta.url,
);
const payloadUrl = new URL(
  '../src/pages/research-workspace/model/workspace-view-payload.ts',
  import.meta.url,
);

describe('workspace active-view server loader', () => {
  it('returns a discriminated active slice plus shell counts', async () => {
    const [source, payload] = await Promise.all([
      readFile(serverUrl, 'utf8'),
      readFile(payloadUrl, 'utf8'),
    ]);

    assert.match(payload, /export type ResearchWorkspaceViewPayload/);
    assert.match(source, /export async function loadResearchWorkspaceView/);
    assert.match(source, /switch \(options\.view\)/);
    for (const view of [
      'today',
      'radar',
      'stocks',
      'crypto',
      'themes',
      'research',
      'history',
      'status',
    ]) {
      assert.match(source, new RegExp(`case '${view}'`));
    }
    assert.match(
      source,
      /const shell:\s*ResearchWorkspaceShellSummary\s*=\s*\{[\s\S]*?radarScopeTotal:[\s\S]*?watchlistCount:/,
    );
    assert.match(source, /view:\s*options\.view/);
  });

  it('keeps active cursor, lane, record, and abort request inputs bounded', async () => {
    const source = await readFile(modelUrl, 'utf8');

    assert.match(source, /workspaceViewInputSchema/);
    // The exact accepted set, still pinned — a view id reaches the brain from the
    // client, so this list widening by accident is the thing the test guards.
    // Whitespace-tolerant because the list is long enough that the formatter
    // breaks it across lines.
    assert.match(
      source,
      /z\.enum\(\[\s*'today',\s*'radar',\s*'stocks',\s*'crypto',\s*'themes',\s*'research',\s*'history',\s*'status',\s*'market-topic-news',\s*\]\)/,
    );
    assert.match(source, /cursor:\s*z\.string\(\)\.min\(1\)\.max\(512\)\.optional\(\)/);
    assert.match(source, /record:\s*z\.string\(\)\.min\(1\)\.max\(256\)\.optional\(\)/);
    assert.match(source, /export const loadResearchWorkspaceView = createServerFn/);
    // The loader is now scoped to the verified session subject, not a fixed id.
    assert.match(source, /return loadDirect\(context\.session\.sub, data\)/);
  });

  it('does not convert active read errors into empty payloads', async () => {
    const [server, model] = await Promise.all([
      readFile(serverUrl, 'utf8'),
      readFile(modelUrl, 'utf8'),
    ]);

    assert.doesNotMatch(
      server,
      /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}(?:items:\s*\[\]|data:\s*\[\])/,
    );
    assert.doesNotMatch(model, /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}(?:items:\s*\[\]|data:\s*\[\])/);
  });

  it('routes the initial themes relation through the v2-preference adapter', async () => {
    const source = await readFile(serverUrl, 'utf8');
    const themesCase = source.match(/case 'themes':\s*\{([\s\S]*?)\n\s*break;/)?.[1] ?? '';

    // Depth 1 and the caller's scope are now positional arguments to the
    // brain-backed loader: loadEntityRelationGraph(userId, entityKey, depth).
    assert.match(themesCase, /loadEntityRelationGraph\(userId,\s*relationRoot,\s*1\)/);
    // P0-5: the V1 fallback is removed — the adapter is V2-only.
    assert.doesNotMatch(themesCase, /loadV1/);
    assert.doesNotMatch(source, /getEntityRelations[^W]/);

    const relationLoader =
      source.match(/export async function loadEntityRelationGraph[\s\S]*?\n\}/)?.[0] ?? '';
    // The loader is now a brain call: it must hit the relations endpoint, pass
    // the requested depth through, and bind the caller's verified scope.
    assert.match(relationLoader, /\/v1\/entities\/.*\/relations/);
    assert.match(relationLoader, /query:\s*\{\s*depth,/);
    assert.match(relationLoader, /scope:\s*scopeFor\(userId\)/);
    assert.doesNotMatch(relationLoader, /loadV1/);
    // No SQL may survive in the BFF loader.
    assert.doesNotMatch(relationLoader, /executor|queryRows|withReadSnapshot/);
  });
});
