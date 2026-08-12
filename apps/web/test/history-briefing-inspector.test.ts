import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import type {
  HistoryBriefingDetail,
  HistoryBriefingItem,
} from '../src/pages/research-workspace/model/history-briefing.ts';
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
      '/src/pages/research-workspace/ui/history-briefing-inspector.tsx',
    )) as {
      HistoryBriefingInspectorContent: ComponentType<{
        detail: HistoryBriefingDetail | null;
        onRetry: () => void;
        presentation: DetailInspectorPresentation;
        state: 'error' | 'loading' | 'ready';
      }>;
    };
  } finally {
    await server.close();
  }
}

function item(kind: HistoryBriefingItem['kind']): HistoryBriefingItem {
  return {
    historyId: `history-${kind}`,
    entityKey: kind === 'judgment' ? 'KR:005930' : 'MACRO:FX',
    kind,
    entryType: kind === 'judgment' ? 'manual_note' : 'alert_review',
    status: 'open',
    title: kind === 'judgment' ? '메모리 수요 판단' : '환율 변화 자동 관찰',
    thesis: kind === 'judgment' ? '수요와 재고 조건을 확인합니다.' : '환율 변화가 감지됐습니다.',
    evidenceCount: 2,
    occurredAt: '2026-08-01T00:00:00.000Z',
    reviewDueAt: kind === 'judgment' ? '2026-08-08T00:00:00.000Z' : null,
    createdAt: '2026-08-01T00:00:00.000Z',
    sourceKind: '공시',
    sourceRef: 'https://example.com/source',
  };
}

function detail(kind: HistoryBriefingItem['kind']): HistoryBriefingDetail {
  return {
    item: item(kind),
    availability: 'available',
    evidenceState: kind === 'judgment' ? 'maintained' : 'review_required',
    originalEvidence: [
      { id: 'valid', label: '유효한 근거', url: 'https://example.com/evidence' },
      { id: 'invalid-http', label: 'HTTP 근거', url: 'http://example.com/evidence' },
      { id: 'invalid-script', label: '스크립트 근거', url: 'javascript:alert(1)' },
    ],
    changeSummary: '기준 시점 이후 수요 지표가 일부 달라졌습니다.',
    relatedNews: [
      { id: 'news-valid', title: '유효한 뉴스', url: 'https://example.com/news' },
      { id: 'news-invalid', title: '유효하지 않은 뉴스', url: 'data:text/plain,unsafe' },
    ],
    marketPaths: [{ id: 'path', label: '환율 → 비용 경로', summary: '비용 조건을 확인합니다.' }],
    checkpoints: ['다음 공개 자료에서 재고 확인'],
    partialFailures: {},
  };
}

async function render(
  nextDetail: HistoryBriefingDetail | null,
  options: {
    presentation?: DetailInspectorPresentation;
    state?: 'error' | 'loading' | 'ready';
  } = {},
) {
  const { HistoryBriefingInspectorContent } = await loadInspector();
  return renderToStaticMarkup(
    createElement(HistoryBriefingInspectorContent, {
      detail: nextDetail,
      onRetry: () => undefined,
      presentation: options.presentation ?? 'drawer',
      state: options.state ?? 'ready',
    }),
  );
}

function assertOrder(html: string, labels: string[]) {
  for (const label of labels) assert.match(html, new RegExp(label));
  for (let index = 1; index < labels.length; index += 1) {
    assert.ok(html.indexOf(labels[index - 1]!) < html.indexOf(labels[index]!));
  }
}

describe('history briefing inspector', () => {
  it('renders judgment detail in the approved review order', async () => {
    const html = await render(detail('judgment'));

    // "다음 확인 조건" 이 이 목록의 마지막이었다. `detail.checkpoints` 가 라이브
    // 경로에서 영원히 비어 프로덕션에서는 그려진 적이 없고 프리뷰 픽스처만
    // 채우고 있었다 — 순서 단언이 그 섹션을 승인된 것처럼 고정하고 있었던 셈이다.
    assertOrder(html, ['요약', '당시 판단', '당시 근거', '지금 달라진 점', '근거 상태']);
    // 섹션 id 로 못을 박는다. 문구로 단언하면 제거를 설명하는 위 주석이 단언을 깬다.
    assert.doesNotMatch(html, /history-inspector-checkpoints/);
  });

  it('renders observations in the reduced order without calling them user judgments', async () => {
    const html = await render(detail('observation'));

    assertOrder(html, ['감지된 변화', '연결 근거', '확인 상태']);
    assert.doesNotMatch(html, /당시 판단|사용자 판단|다음 확인 조건/);
  });

  it('omits unavailable optional sections instead of inventing empty content', async () => {
    const sparse = detail('judgment');
    sparse.originalEvidence = [];
    sparse.changeSummary = undefined;
    sparse.checkpoints = [];
    sparse.relatedNews = [];
    sparse.marketPaths = [];
    sparse.evidenceState = null;

    const html = await render(sparse);

    assert.match(html, /요약/);
    assert.match(html, /당시 판단/);
    assert.doesNotMatch(html, /당시 근거|지금 달라진 점|근거 상태|다음 확인 조건/);
  });

  it('keeps evidence and change failures localized while preserving base detail', async () => {
    const partial = detail('judgment');
    partial.originalEvidence = [];
    partial.changeSummary = undefined;
    partial.partialFailures = {
      changes: '현재 변화 요약을 불러오지 못했습니다.',
      evidence: '연결 근거를 불러오지 못했습니다.',
    };

    const html = await render(partial);

    assert.match(html, /메모리 수요 판단/);
    assert.match(html, /현재 변화 요약을 불러오지 못했습니다/);
    assert.match(html, /연결 근거를 불러오지 못했습니다/);
  });

  it('creates anchors only for valid HTTPS evidence and news URLs', async () => {
    const html = await render(detail('judgment'));

    assert.match(html, /href="https:\/\/example.com\/evidence"/);
    assert.match(html, /href="https:\/\/example.com\/news"/);
    assert.doesNotMatch(html, /href="http:\/\//);
    assert.doesNotMatch(html, /href="javascript:/);
    assert.doesNotMatch(html, /href="data:/);
  });

  it('preserves the selected detail in an error state and provides retry', async () => {
    const html = await render(detail('judgment'), { state: 'error' });

    assert.match(html, /메모리 수요 판단/);
    assert.match(html, /상세를 불러오지 못했습니다/);
    assert.match(html, /다시 불러오기/);
  });

  it('uses the shared frame with independent width memory and page-owned selection/loading', async () => {
    const [layoutSource, inspectorSource, pageSource, viewSource] = await Promise.all([
      readFile(
        new URL(
          '../src/pages/research-workspace/model/detail-inspector-layout.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../src/pages/research-workspace/ui/history-briefing-inspector.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../src/pages/research-workspace/ui/views/history-view.tsx', import.meta.url),
        'utf8',
      ),
    ]);

    assert.match(layoutSource, /historyInspectorWidthStorageKey/);
    assert.match(inspectorSource, /<DetailInspectorFrame/);
    assert.match(inspectorSource, /storageKey=\{historyInspectorWidthStorageKey\}/);
    assert.match(pageSource, /selectedHistoryId/);
    assert.match(pageSource, /historyInspectorOpenerRef/);
    assert.match(pageSource, /loadHistoryBriefingDetail/);
    assert.match(viewSource, /selectedHistoryId=\{selectedHistoryId\}/);
  });

  it('lays modal judgment/change content in two columns without a presentation loader effect', async () => {
    const [html, css, inspectorSource] = await Promise.all([
      render(detail('judgment'), { presentation: 'modal' }),
      readFile(
        new URL(
          '../src/pages/research-workspace/ui/history-briefing-inspector.module.css',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../src/pages/research-workspace/ui/history-briefing-inspector.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
    ]);

    assert.match(html, /data-presentation="modal"/);
    assert.match(css, /\[data-presentation='modal'\][\s\S]*grid-template-columns:/);
    assert.doesNotMatch(inspectorSource, /useEffect/);
  });
});
