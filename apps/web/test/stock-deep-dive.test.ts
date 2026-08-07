import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) => {
  try {
    return await readFile(
      new URL(`../src/pages/research-workspace/${path}`, import.meta.url),
      'utf8',
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
};

describe('stock briefing inspector', () => {
  it('renders the six briefing sections in the approved order', async () => {
    const source = await read('ui/stock-briefing-inspector.tsx');
    const headings = [
      '종목 요약',
      '왜 지금 확인하나요',
      '영향 경로',
      '관련 뉴스',
      '확인할 리스크와 체크포인트',
      '보유 논지 복기',
    ];
    const offsets = headings.map((heading) => source.indexOf(heading));

    assert.ok(offsets.every((offset) => offset >= 0));
    assert.deepEqual(
      offsets,
      [...offsets].sort((left, right) => left - right),
    );
    assert.doesNotMatch(source, /DEEP_DIVE_SECTION_IDS|분석 축|12개/);
  });

  it('omits optional sections when their data is absent and limits news to three', async () => {
    const source = await read('ui/stock-briefing-inspector.tsx');

    assert.match(source, /detail\.whyNow\s*&&/);
    assert.match(source, /detail\.paths\.length > 0\s*&&/);
    assert.match(source, /detail\.news\.length > 0\s*&&/);
    assert.match(source, /detail\.primaryThesis\s*&&/);
    assert.match(source, /detail\.news\.slice\(0, 3\)/);
  });

  it('renders safe source links and semantic timestamps', async () => {
    const source = await read('ui/stock-briefing-inspector.tsx');

    assert.match(source, /target="_blank"/);
    assert.match(source, /rel="noreferrer"/);
    assert.match(source, /<time dateTime=/);
    assert.doesNotMatch(source, /지금 사세요|매도하세요|목표가|손절가|익절가/);
  });

  it('renders stock identity, linked-news count, and an honest evidence-level fallback', async () => {
    const source = await read('ui/stock-briefing-inspector.tsx');

    assert.match(source, /stockBriefingStatusLabel\(detail\.stock\)/);
    assert.match(source, /stockBriefingEvidenceLevelLabel\(detail\.evidenceLevel\)/);
    assert.match(source, /연결 뉴스/);
    assert.match(source, /근거 수준/);
    assert.match(source, /명시적 데이터 없음/);
  });

  it('localizes relation and impact failures without hiding the base detail', async () => {
    const source = await read('ui/stock-briefing-inspector.tsx');
    const readyOffset = source.indexOf("state === 'ready' && detail");
    const relationFailureOffset = source.indexOf('detail.partialFailures.relation');
    const impactFailureOffset = source.indexOf('detail.partialFailures.impact');

    assert.ok(readyOffset >= 0);
    assert.ok(relationFailureOffset > readyOffset);
    assert.ok(impactFailureOffset > readyOffset);
    assert.match(source, /<WorkspaceState/);
  });

  it('reuses one loaded result across presentations and restores the connected opener', async () => {
    const [inspector, view] = await Promise.all([
      read('ui/stock-briefing-inspector.tsx'),
      read('ui/views/stocks-view.tsx'),
    ]);

    assert.match(inspector, /\{\(presentation\) =>/);
    assert.match(inspector, /presentation === 'modal'/);
    assert.doesNotMatch(inspector, /StockBriefingLoader|loadStockBriefingData|createApiClient/);
    assert.match(view, /loadStockBriefingDetail/);
    assert.match(view, /loadStockBriefingData/);
    assert.match(view, /api\.stockDetail\(key\)/);
    assert.match(view, /api\.entityRelations\(key, 2\)/);
    assert.match(view, /api\.impactBrief\(key\)/);
    assert.match(view, /inspectorOpenerRef\.current = opener/);
    assert.match(view, /opener\?\.isConnected/);
    assert.match(view, /requestAnimationFrame\(\(\) => opener\.focus\(\)\)/);
    assert.match(view, /setInspectorOpen\(false\)/);
    assert.doesNotMatch(view, /setSelectedStockKey\(undefined\)/);
  });

  it('uses the shared frame with the selected key, stock width storage, and modal-only extras', async () => {
    const source = await read('ui/stock-briefing-inspector.tsx');

    assert.match(source, /<DetailInspectorFrame/);
    assert.match(source, /detailKey=\{detailKey\}/);
    assert.match(source, /storageKey=\{stockInspectorWidthStorageKey\}/);
    assert.match(source, /presentation === 'modal'[\s\S]*?<RelationSigmaGraph/);
    assert.match(source, /presentation === 'modal'[\s\S]*?companyProfile/);
    assert.match(source, /presentation === 'modal'[\s\S]*?companyMetrics/);
  });
});
