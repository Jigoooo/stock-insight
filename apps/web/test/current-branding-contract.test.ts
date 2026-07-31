import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('current application branding', () => {
  it('uses Stock Insight in live metadata, route fallback, and map metadata', async () => {
    const [root, notFound, map] = await Promise.all([
      read('routes/__root.tsx'),
      read('pages/root/ui/not-found.tsx'),
      read('pages/research-workspace/ui/geo-market-map.tsx'),
    ]);

    assert.match(root, /title: 'Stock Insight - Research Feed'/);
    assert.match(root, /Stock Insight는 보유종목과 시장 이슈를 연결/);
    assert.match(root, /property: 'og:title', content: 'Stock Insight - Research Feed'/);
    assert.match(notFound, /Stock Insight에서 제공하지 않는 경로입니다/);
    assert.match(map, /name: 'Stock Insight local geo plane'/);
    for (const source of [root, notFound, map]) assert.doesNotMatch(source, /Futur Insight/);
  });
});
