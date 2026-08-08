import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import type { HistoryBriefingModel } from '../src/pages/research-workspace/model/history-briefing.ts';

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

async function renderScenario(scenario: string) {
  const [{ resolveHistoryPreview }, { HistoryBriefingContent }] = await Promise.all([
    loadWorkspaceModule<{
      resolveHistoryPreview: (scenario: string) => { briefing: HistoryBriefingModel };
    }>('/src/pages/dev-preview/model/history-preview-fixture.ts'),
    loadWorkspaceModule<{
      HistoryBriefingContent: ComponentType<{
        briefing: HistoryBriefingModel;
        interactive: boolean;
        onSelectHistory: () => void;
        selectedHistoryId?: string;
      }>;
    }>('/src/pages/research-workspace/ui/views/history-view.tsx'),
  ]);
  const preview = resolveHistoryPreview(scenario);
  return renderToStaticMarkup(
    createElement(HistoryBriefingContent, {
      briefing: preview.briefing,
      interactive: true,
      onSelectHistory: () => undefined,
    }),
  );
}

describe('history briefing structure', () => {
  it('renders honest summary labels followed by the four approved sections in fixed order', async () => {
    const html = await renderScenario('default');
    const labels = [
      '전체 기록 범위',
      '불러온 기록 중 오늘 확인',
      '불러온 자동 관찰',
      '기준 시각',
      '오늘 다시 볼 판단',
      '진행 중 판단',
      '자동 시장 관찰',
      '지난 복기',
    ];

    for (const label of labels) assert.match(html, new RegExp(label));
    for (let index = 1; index < labels.length; index += 1) {
      assert.ok(html.indexOf(labels[index - 1]!) < html.indexOf(labels[index]!));
    }
    assert.equal((html.match(/data-testid="history-priority-item"/g) ?? []).length, 3);
    assert.doesNotMatch(html, /전체 7건|총 7건/);
  });

  it('shows the exact no-due state without promoting an active judgment', async () => {
    const html = await renderScenario('no-due');

    assert.match(html, /오늘 예정된 복기가 없습니다/);
    assert.equal((html.match(/data-testid="history-priority-item"/g) ?? []).length, 0);
    assert.match(html, /data-testid="history-active-item"/);
  });

  it('treats a zero-record missing response as a normal no-record state', async () => {
    const html = await renderScenario('empty');

    assert.match(html, /아직 복기 기록이 없습니다/);
    assert.doesNotMatch(html, /데이터 없음|오류|불러오지 못/);
  });

  it('keeps past entries collapsed by default and selectable through the same surface', async () => {
    const html = await renderScenario('default');
    const details = html.match(/<details[^>]*data-testid="history-past-entries"[^>]*>/)?.[0];

    assert.ok(details);
    assert.doesNotMatch(details, /\sopen(?:=|\s|>)/);
    assert.match(html, /data-testid="history-select-surface"/);
    assert.match(html, /aria-current=/);
  });

  it('never renders advisory, performance, or success-failure verdict copy', async () => {
    const html = [
      await renderScenario('default'),
      await renderScenario('no-due'),
      await renderScenario('empty'),
    ].join(' ');

    assert.doesNotMatch(
      html,
      /지금 사세요|매도하세요|목표가|손절가|익절가|내일 오를 종목|수익률|성공한 판단|실패한 판단/,
    );
  });

  it('stacks at 1240px and gives the shared selection surface stable containment', async () => {
    const css = await readFile(
      new URL('../src/pages/research-workspace/ui/views/history-view.module.css', import.meta.url),
      'utf8',
    );

    assert.match(css, /@media \(max-width: 1240px\)/);
    assert.match(css, /\.briefingColumns[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /\.selectionSurface[\s\S]*?border:\s*1px solid/);
    assert.match(css, /\.selectionSurface[\s\S]*?background:/);
    assert.match(css, /\.selectionSurface[\s\S]*?box-shadow:/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /overflow:\s*(?:hidden|auto)/);
  });
});
