import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('stock briefing inspector UI structure', () => {
  it('opens one shared inspector from priority, holding, and watchlist rows', async () => {
    const [view, sections] = await Promise.all([
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/stock-briefing-sections.tsx'),
    ]);

    assert.equal((view.match(/onSelect=\{\(entityKey, opener\)/g) ?? []).length, 4);
    assert.match(view, /<StockBriefingInspector/);
    assert.match(sections, /aria-label=\{`\$\{stock\.displayName\} 종목 브리핑 열기`\}/);
    assert.match(sections, /onSelect\(stock\.entityKey, event\.currentTarget\)/);
    assert.match(sections, /aria-current=\{selected \? 'true' : undefined\}/);
  });

  it('loads detail, depth-two relations, and impact together with stale-request gating', async () => {
    const view = await read('pages/research-workspace/ui/views/stocks-view.tsx');

    assert.match(view, /loadStockBriefingData/);
    assert.match(view, /api\.stockDetail\(key\)/);
    assert.match(view, /api\.entityRelations\(key, 2\)/);
    assert.match(view, /api\.impactBrief\(key\)/);
    assert.match(view, /createLatestRequestGate/);
    assert.match(view, /requestGateRef\.current\.invalidate\(\)/);
    assert.match(view, /requestGateRef\.current\.isCurrent\(sequence\)/);
  });

  it('keeps mobile presentation and desktop presentation controls owned by the shared frame', async () => {
    const [view, inspector, frame] = await Promise.all([
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/stock-briefing-inspector.tsx'),
      read('pages/research-workspace/ui/detail-inspector-frame.tsx'),
    ]);

    assert.match(view, /window\.matchMedia\('\(max-width: 767px\)'\)/);
    assert.match(inspector, /mobile=\{mobile\}/);
    assert.match(frame, /!mobile && desktopPresentation === 'drawer'/);
    assert.match(frame, /!mobile && \(/);
    assert.match(frame, /mobile \? 'mobile' : desktopPresentation/);
  });
});
