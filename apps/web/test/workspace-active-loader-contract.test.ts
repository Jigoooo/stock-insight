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
    for (const view of ['today', 'radar', 'stocks', 'themes', 'research', 'history', 'status']) {
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
    assert.match(
      source,
      /z\.enum\(\['today', 'radar', 'stocks', 'themes', 'research', 'history', 'status'\]\)/,
    );
    assert.match(source, /cursor:\s*z\.string\(\)\.min\(1\)\.max\(512\)\.optional\(\)/);
    assert.match(source, /record:\s*z\.string\(\)\.min\(1\)\.max\(256\)\.optional\(\)/);
    assert.match(source, /export const loadResearchWorkspaceView = createServerFn/);
    assert.match(source, /return loadDirect\(data\)/);
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

    assert.match(themesCase, /getEntityRelationsWithV2Preference\(executor/);
    assert.match(themesCase, /depth:\s*1/);
    assert.match(themesCase, /userId:\s*userScope\.userId/);
    assert.match(themesCase, /loadV1:\s*\(\)\s*=>\s*getEntityRelations\(executor/);

    const relationLoader =
      source.match(/export async function loadEntityRelationGraph[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(relationLoader, /getEntityRelationsWithV2Preference\(executor/);
    assert.match(relationLoader, /\n\s*depth,/);
    assert.match(relationLoader, /userId:\s*userScope\.userId/);
  });
});
