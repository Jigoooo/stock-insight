import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const serverUrl = new URL('../src/server/research-workspace.ts', import.meta.url);
const orchestratorUrl = new URL(
  '../src/server/research-workspace-orchestrator.ts',
  import.meta.url,
);
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
    const [server, source, payload] = await Promise.all([
      readFile(serverUrl, 'utf8'),
      readFile(orchestratorUrl, 'utf8'),
      readFile(payloadUrl, 'utf8'),
    ]);

    assert.match(payload, /export type ResearchWorkspaceViewPayload/);
    assert.match(server, /export async function loadResearchWorkspaceView/);
    assert.match(server, /orchestrateResearchWorkspaceView\(loaders, userId, options\)/);
    assert.match(source, /switch \(options\.view\)/);
    for (const view of ['today', 'radar', 'stocks', 'history', 'status']) {
      assert.match(source, new RegExp(`case '${view}'`));
    }
    assert.doesNotMatch(source, /case '(?:crypto|themes|market-topic-news)'/);
    assert.match(source, /const shellPromise = loaders\.loadShell\(userId\)/);
    assert.match(source, /const \[activeSlice, shell\] = await Promise\.all/);
    assert.match(source, /\.\.\.activeSlice,[\s\S]*?shell,[\s\S]*?view:\s*options\.view/);
    assert.match(source, /view:\s*options\.view/);
  });

  it('keeps active cursor, lane, record, and abort request inputs bounded', async () => {
    const source = await readFile(modelUrl, 'utf8');

    assert.match(source, /workspaceViewInputSchema/);
    // The exact accepted set, still pinned — a view id reaches the brain from the
    // client, so this list widening by accident is the thing the test guards.
    // Whitespace-tolerant because the list is long enough that the formatter
    // breaks it across lines.
    assert.match(source, /z\.enum\(\['today', 'radar', 'stocks', 'history', 'status'\]\)/);
    assert.match(source, /cursor:\s*z\.string\(\)\.min\(1\)\.max\(512\)\.optional\(\)/);
    assert.match(source, /record:\s*z\.string\(\)\.min\(1\)\.max\(256\)\.optional\(\)/);
    assert.match(source, /export const loadResearchWorkspaceView = createServerFn/);
    // The loader is now scoped to the verified session subject, not a fixed id.
    assert.match(source, /return loadDirect\(context\.session\.sub, data\)/);
  });

  it('does not convert active read errors into empty payloads', async () => {
    const [server, orchestrator, model] = await Promise.all([
      readFile(serverUrl, 'utf8'),
      readFile(orchestratorUrl, 'utf8'),
      readFile(modelUrl, 'utf8'),
    ]);

    assert.doesNotMatch(
      server,
      /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}(?:items:\s*\[\]|data:\s*\[\])/,
    );
    assert.doesNotMatch(model, /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}(?:items:\s*\[\]|data:\s*\[\])/);
    assert.doesNotMatch(
      orchestrator,
      /catch\s*\([^)]*\)\s*\{[\s\S]{0,300}(?:items:\s*\[\]|data:\s*\[\])/,
    );
  });

  it('keeps hidden view loaders out while preserving the compatibility relation adapter', async () => {
    const [source, orchestrator] = await Promise.all([
      readFile(serverUrl, 'utf8'),
      readFile(orchestratorUrl, 'utf8'),
    ]);
    assert.doesNotMatch(
      orchestrator,
      /loadCrypto|loadRelation|case '(?:crypto|themes|market-topic-news)'/,
    );
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
