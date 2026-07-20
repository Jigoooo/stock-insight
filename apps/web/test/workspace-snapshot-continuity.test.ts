import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const root = new URL('../../../', import.meta.url);

async function read(path: string) {
  return readFile(new URL(path, root), 'utf8');
}

describe('workspace publication snapshot continuity', () => {
  it('binds cursor, detail, relation and URL loader to one run/revision pair', async () => {
    const [readModel, page, route, client, recordRoute, relationRoute] = await Promise.all([
      read('apps/api/src/workspace/read-model.ts'),
      read('apps/web/src/pages/research-workspace/ui/research-workspace-page.tsx'),
      read('apps/web/src/routes/_authenticated/workspace.tsx'),
      read('packages/api-client/src/index.ts'),
      read('apps/web/src/routes/api/records/$recordKey.ts'),
      read('apps/web/src/routes/api/entities/$entityKey/relations.ts'),
    ]);

    assert.match(readModel, /version:\s*2/);
    assert.match(readModel, /analysisRunId:\s*cursor\.analysisRunId/);
    assert.match(readModel, /analysisRevision:\s*cursor\.analysisRevision/);
    assert.match(page, /analysisRunId:\s*snapshot\?\.analysisRunId/);

    assert.match(
      page,
      /if \(mobileNavOpen\)[\s\S]+requestAnimationFrame\(commitSectionSelection\)/,
    );
    assert.match(page, /researchRecord\(recordKey, snapshot\)/);
    assert.match(page, /entityRelations\(entityKey,\s*1,\s*nextDetail\.meta\.contentSnapshot\)/);
    assert.doesNotMatch(page, /recordKey\s*===\s*detail\?\.recordKey[\s\S]+return/);
    assert.match(page, /setRelation\(null\);[\s\S]+setRelationState\('loading'\)/);
    assert.match(page, /setDetailState\('loading'\)/);
    assert.match(page, /urlState\.record \? 'loading' : 'error'/);
    assert.match(
      page,
      /const recordKey = urlState\.record[\s\S]+setDetailState\('loading'\)[\s\S]+setRelationState\('loading'\)/,
    );
    assert.match(page, /actualSnapshot\.analysisRunId\s*!==\s*expectedSnapshot\.analysisRunId/);
    assert.match(
      page,
      /cursor:\s*currentLane\.nextCursor,[\s\S]+analysisRunId:\s*snapshot\.analysisRunId,[\s\S]+analysisRevision:\s*snapshot\.analysisRevision/,
    );
    assert.match(
      page,
      /requestNavigation\('lane',[\s\S]+record:\s*undefined,[\s\S]+analysisRunId:\s*undefined,[\s\S]+analysisRevision:\s*undefined/,
    );
    assert.match(route, /snapshot:[\s\S]+analysisRunId:\s*deps\.analysisRunId/);
    assert.match(
      route,
      /deps\.record\s*!==\s*undefined\s*\|\|\s*deps\.analysisRunId\s*!==\s*undefined[\s\S]+deps\.view\s*===\s*'today'[\s\S]+\?\s*undefined[\s\S]+:\s*deps\.cursor/,
    );
    assert.match(route, /lane:\s*null/);
    assert.match(
      route,
      /deps\.record \?\? null,[\s\S]+deps\.analysisRevision \?\? null,[\s\S]+deps\.cursor \?\? null/,
    );
    assert.match(client, /analysisRunId:\s*snapshot\?\.analysisRunId/g);
    assert.match(recordRoute, /loadResearchRecord\(params\.recordKey, snapshot\)/);
    assert.match(relationRoute, /loadEntityRelationGraph\(params\.entityKey, depth, snapshot\)/);
  });
});
