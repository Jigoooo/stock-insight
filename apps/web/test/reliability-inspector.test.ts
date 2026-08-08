import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import type { ReliabilityBriefingItem } from '../src/pages/research-workspace/model/reliability-briefing.ts';
import type { DetailInspectorPresentation } from '../src/pages/research-workspace/ui/detail-inspector-frame.tsx';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadInspector() {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });

  try {
    return (await server.ssrLoadModule(
      '/src/pages/research-workspace/ui/reliability-inspector.tsx',
    )) as {
      ReliabilityInspectorContent: ComponentType<{
        item: ReliabilityBriefingItem;
        presentation: DetailInspectorPresentation;
      }>;
    };
  } finally {
    await server.close();
  }
}

function item(): ReliabilityBriefingItem {
  return {
    surface: 'market_connections',
    title: '시장 연결',
    level: 'limited',
    summary: '시장 연결 정보는 이용할 수 있지만 일부 제한이 있습니다.',
    availableNow: ['시장 변화 신호', '거시 지표'],
    limitations: ['일부 연결 관계는 근거 원문을 바로 확인할 수 없습니다.'],
    cautions: ['연결 관계는 근거가 확인된 범위 안에서만 해석해야 합니다.'],
    evidence: [
      {
        id: 'market_signals',
        label: '시장 변화 신호',
        availability: 'available',
        checkedAt: '2026-08-08T01:00:00.000Z',
      },
      {
        id: 'graph_edges',
        label: '기업·테마 연결 관계',
        availability: 'stale',
        checkedAt: null,
      },
    ],
    sourceTraceability: { linked: 7, clickable: 5, total: 10 },
  };
}

async function render(presentation: DetailInspectorPresentation = 'drawer') {
  const { ReliabilityInspectorContent } = await loadInspector();
  return renderToStaticMarkup(
    createElement(ReliabilityInspectorContent, { item: item(), presentation }),
  );
}

function assertOrder(html: string, labels: string[]) {
  for (const label of labels) assert.match(html, new RegExp(label));
  for (let index = 1; index < labels.length; index += 1) {
    assert.ok(html.indexOf(labels[index - 1]!) < html.indexOf(labels[index]!));
  }
}

describe('reliability inspector', () => {
  it('renders the approved detail order with plain user-facing evidence labels', async () => {
    const html = await render();

    assertOrder(html, [
      '상태 요약',
      '최근 확인된 데이터',
      '출처 근거 수준',
      '부족한 범위',
      '이용 시 주의점',
    ]);
    assert.match(html, /시장 변화 신호/);
    assert.match(html, /기업·테마 연결 관계/);
    assert.doesNotMatch(html, /시장 연결 데이터 신뢰도/);
    assert.doesNotMatch(html, /market_signals|graph_edges|rowCount|analysisRunId/);
  });

  it('defines a compact drawer hierarchy without nesting every section in a card', async () => {
    const css = await readFile(
      new URL(
        '../src/pages/research-workspace/ui/reliability-inspector.module.css',
        import.meta.url,
      ),
      'utf8',
    );

    assert.match(css, /\.content h2,[\s\S]*\.content h3[\s\S]*font-size:\s*13px/);
    assert.match(css, /\.content p,[\s\S]*\.content li[\s\S]*font-size:\s*12px/);
    assert.match(css, /\.content > section[\s\S]*border-bottom:/);
    assert.doesNotMatch(css, /\.content section[\s\S]*border:\s*1px solid/);
  });

  it('shows only linked and original-checkable counts without inventing source identities or links', async () => {
    const html = await render();

    assert.match(html, /<dt>전체<\/dt><dd>10건<\/dd>/);
    assert.match(html, /<dt>연결<\/dt><dd>7건<\/dd>/);
    assert.match(html, /<dt>원문 확인 가능<\/dt><dd>5건<\/dd>/);
    assert.doesNotMatch(html, /<a\b|href=/);
  });

  it('omits an unavailable traceability section instead of fabricating zero counts', async () => {
    const sparse = item();
    sparse.sourceTraceability = null;
    const { ReliabilityInspectorContent } = await loadInspector();
    const html = renderToStaticMarkup(
      createElement(ReliabilityInspectorContent, { item: sparse, presentation: 'drawer' }),
    );

    assert.doesNotMatch(html, /출처 근거 수준|전체 0건|연결 0건/);
    assert.match(html, /최근 확인된 데이터/);
  });

  it('uses the same item in a two-column modal comparison without a loader effect', async () => {
    const [html, css, source] = await Promise.all([
      render('modal'),
      readFile(
        new URL(
          '../src/pages/research-workspace/ui/reliability-inspector.module.css',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/reliability-inspector.tsx', import.meta.url),
        'utf8',
      ),
    ]);

    assert.match(html, /data-presentation="modal"/);
    assertOrder(html, ['확인 가능한 근거', '제한과 영향']);
    assert.match(css, /\[data-presentation='modal'\][\s\S]*grid-template-columns:/);
    assert.doesNotMatch(source, /useEffect|fetch\(|createApiClient/);
  });

  it('uses the shared frame with independent width memory and exact page-owned opener focus', async () => {
    const [layoutSource, inspectorSource, pageSource, viewSource] = await Promise.all([
      readFile(
        new URL(
          '../src/pages/research-workspace/model/detail-inspector-layout.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/reliability-inspector.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/views/status-view.tsx', import.meta.url),
        'utf8',
      ),
    ]);

    assert.match(layoutSource, /reliabilityInspectorWidthStorageKey/);
    assert.match(inspectorSource, /<DetailInspectorFrame/);
    assert.match(inspectorSource, /storageKey=\{reliabilityInspectorWidthStorageKey\}/);
    assert.match(viewSource, /event\.currentTarget/);
    assert.match(pageSource, /reliabilityInspectorOpenerRef\.current = opener/);
    assert.match(pageSource, /requestAnimationFrame\(\(\) => opener\.focus\(\)\)/);
  });
});
