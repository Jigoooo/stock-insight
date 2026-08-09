import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import type { HistoryBriefingModel } from '../src/pages/research-workspace/model/history-briefing.ts';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadWorkspaceModule<T>(path: string): Promise<T> {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('../src', import.meta.url)),
      },
    },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });

  try {
    return (await server.ssrLoadModule(path)) as T;
  } finally {
    await server.close();
  }
}

describe('workspace compositions', () => {
  it('preserves native data semantics', async () => {
    assert.match(await read('shared/ui/workspace/metric-strip.tsx'), /<dl/);
    assert.match(await read('shared/ui/workspace/property-list.tsx'), /<dl/);
    assert.match(await read('shared/ui/workspace/data-table.tsx'), /<Table/);
    assert.match(await read('shared/ui/workspace/structured-list.tsx'), /<ul/);
    assert.match(await read('shared/ui/workspace/timeline.tsx'), /<ol/);
  });

  it('owns shared visual states outside route CSS', async () => {
    const state = await read('shared/ui/workspace/workspace-state.tsx');
    const pageCss = await read('pages/research-workspace/ui/research-workspace-page.module.css');
    assert.match(state, /loading.*empty.*error.*stale.*partial.*unavailable/s);
    assert.doesNotMatch(pageCss, /\.panel\s*\{|\.pageHeader\s*\{|\.stateSurface\s*\{/);
  });

  it('keeps registry interaction states out of route-owned workspace CSS', async () => {
    for (const path of [
      'pages/research-workspace/ui/research-workspace-page.module.css',
      'pages/research-workspace/ui/feed-ledger.module.css',
      'pages/research-workspace/ui/relation-detail.module.css',
      'pages/research-workspace/ui/market-overview.module.css',
    ]) {
      const css = await read(path);
      assert.doesNotMatch(css, /focus-visible:ring-|data-\[state=|whileHover|whileTap/);
    }
  });

  it('renders empty history outside the ordered list and populated briefing entries as li', async () => {
    const { HistoryBriefingContent } = await loadWorkspaceModule<{
      HistoryBriefingContent: ComponentType<{
        briefing: HistoryBriefingModel;
        interactive: boolean;
        onSelectHistory: () => void;
      }>;
    }>('/src/pages/research-workspace/ui/views/history-view.tsx');
    const emptyBriefing: HistoryBriefingModel = {
      summary: {
        scopeTotal: 0,
        loadedDueCount: 0,
        loadedObservationCount: 0,
        generatedAt: '2026-07-16T14:01:00.000Z',
      },
      priorityJudgments: [],
      activeJudgments: [],
      observations: [],
      pastEntries: [],
    };
    const observation = {
      createdAt: '2026-07-16T14:01:00.000Z',
      entityKey: 'KR:005930',
      entryType: 'alert_review' as const,
      evidenceCount: 2,
      historyId: '5010c1ac-e77c-8986-a31e-5cca7c402bf2',
      kind: 'observation' as const,
      occurredAt: '2026-07-16T14:00:00.000Z',
      reviewDueAt: null,
      sourceKind: 'user_alert_events',
      sourceRef: 'portfolio-alert:feed:580',
      status: 'open' as const,
      thesis: '판단 조건을 다시 확인',
      title: '삼성전자 경보 검토',
    };
    const emptyHtml = renderToStaticMarkup(
      createElement(HistoryBriefingContent, {
        briefing: emptyBriefing,
        interactive: true,
        onSelectHistory: () => undefined,
      }),
    );
    const populatedHtml = renderToStaticMarkup(
      createElement(HistoryBriefingContent, {
        briefing: {
          ...emptyBriefing,
          summary: { ...emptyBriefing.summary, scopeTotal: 1, loadedObservationCount: 1 },
          observations: [observation],
        },
        interactive: true,
        onSelectHistory: () => undefined,
      }),
    );

    assert.match(emptyHtml, /아직 복기 기록이 없습니다/);
    assert.doesNotMatch(emptyHtml, /<ul\b/);
    assert.match(populatedHtml, /<ul[^>]*><li\b/);
  });

  it('puts table scroll instructions on the actual scroll owner', async () => {
    const { DataTable } = await loadWorkspaceModule<{
      DataTable: ComponentType<{
        caption: ReactNode;
        children: ReactNode;
        containerProps?: ComponentProps<'div'>;
      }>;
    }>('/src/shared/ui/workspace/data-table.tsx');
    const html = renderToStaticMarkup(
      createElement(
        DataTable,
        {
          caption: '기업 연결',
          containerProps: {
            'aria-describedby': 'company-scroll-hint',
            'aria-label': '기업 연결 표 가로 스크롤 영역',
            tabIndex: 0,
          },
        },
        createElement(
          'tbody',
          null,
          createElement('tr', null, createElement('td', null, '샘플 기업')),
        ),
      ),
    );
    const containers = html.match(/<div[^>]*data-slot="table-container"[^>]*>/g) ?? [];

    assert.equal(containers.length, 1);
    assert.match(containers[0], /aria-describedby="company-scroll-hint"/);
    assert.match(containers[0], /aria-label="기업 연결 표 가로 스크롤 영역"/);
    assert.match(containers[0], /tabindex="0"/);
    assert.doesNotMatch(html, /containerProps=/);
  });
});
