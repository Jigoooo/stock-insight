import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('Today personal briefing structure', () => {
  it('renders the approved five sections in order', async () => {
    const source = await read('pages/research-workspace/ui/views/today-view.tsx');
    const ids = [
      'today-market-summary',
      'today-headline-news',
      'today-curated-news',
      'today-news-list',
      'today-connection-summary',
    ];
    const offsets = ids.map((id) => source.indexOf(`data-testid="${id}"`));

    assert.ok(offsets.every((offset) => offset >= 0));
    assert.deepEqual(
      offsets,
      [...offsets].sort((a, b) => a - b),
    );
    assert.match(source, /샘플 데이터/);
    assert.match(source, /deriveTodayBriefing/);
  });

  it('keeps every news surface connected to evidence selection and truthful empty states', async () => {
    const source = await read('pages/research-workspace/ui/views/today-view.tsx');

    assert.match(source, /headlineItems\.map/);
    assert.match(source, /curatedItems\.map/);
    assert.match(source, /listItems\.map/);
    assert.match(source, /onSelectRecord\(item\)/);
    assert.match(source, /관심종목과 직접 연결된 뉴스가 아직 없습니다/);
    assert.match(source, /연결 경로가 아직 계산되지 않았습니다/);
    assert.match(source, /nextCursor \|\| cursorLoading \|\| cursorError/);
  });
});
