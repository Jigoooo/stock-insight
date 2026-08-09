import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('workspace detail briefing V2 routing', () => {
  it('exposes authenticated one-hop BFF routes', async () => {
    const [entityRoute, recordRoute] = await Promise.all([
      read('routes/api/entities/$entityKey/briefing.ts'),
      read('routes/api/records/$recordKey/briefing.ts'),
    ]);
    for (const source of [entityRoute, recordRoute]) {
      assert.match(source, /authRequestMiddleware/);
      assert.match(source, /resolveRequestUserId/);
      assert.match(source, /brainRequest/);
    }
  });

  it('uses one aggregate client request for stock, market, and Today detail entry', async () => {
    const [client, stocks, market, page] = await Promise.all([
      readFile(new URL('../../../packages/api-client/src/index.ts', import.meta.url), 'utf8'),
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/views/market-connections-view.tsx'),
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
    ]);
    assert.match(client, /async entityBriefing/);
    assert.match(client, /async recordBriefing/);
    assert.match(stocks, /api\.entityBriefing\(entityKey, 'stocks'\)/);
    assert.match(market, /api\.entityBriefing\(entityKey, 'market_connections'\)/);
    assert.match(page, /api\.recordBriefing\(recordKey\)/);
  });
});
