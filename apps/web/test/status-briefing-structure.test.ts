import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import type { ReliabilityBriefingModel } from '../src/pages/research-workspace/model/reliability-briefing.ts';

const webRoot = fileURLToPath(new URL('..', import.meta.url));

async function loadWorkspaceModule<T>(path: string): Promise<T> {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });
  try {
    return (await server.ssrLoadModule(path)) as T;
  } finally {
    await server.close();
  }
}

async function renderScenario(scenario: string, selectedSurface?: string) {
  const [{ resolveStatusPreview }, { ReliabilityBriefingContent }] = await Promise.all([
    loadWorkspaceModule<{
      resolveStatusPreview: (scenario: string) => { briefing: ReliabilityBriefingModel };
    }>('/src/pages/dev-preview/model/status-preview-fixture.ts'),
    loadWorkspaceModule<{
      ReliabilityBriefingContent: ComponentType<{
        briefing: ReliabilityBriefingModel;
        interactive: boolean;
        onSelectSurface: () => void;
        selectedSurface?: string;
      }>;
    }>('/src/pages/research-workspace/ui/views/status-view.tsx'),
  ]);
  return renderToStaticMarkup(
    createElement(ReliabilityBriefingContent, {
      briefing: resolveStatusPreview(scenario).briefing,
      interactive: true,
      onSelectSurface: () => undefined,
      selectedSurface,
    }),
  );
}

describe('data reliability briefing structure', () => {
  it('renders the overall state, four surfaces, and common limitations in the approved order', async () => {
    const html = await renderScenario('default');
    const labels = ['전체 신뢰 상태', '오늘', '내 종목', '시장 연결', '복기', '공통 제한 사항'];

    for (const label of labels) assert.match(html, new RegExp(label));
    for (let index = 1; index < labels.length; index += 1) {
      assert.ok(html.indexOf(labels[index - 1]!) < html.indexOf(labels[index]!));
    }
    assert.equal((html.match(/data-testid="reliability-surface-card"/g) ?? []).length, 4);
    assert.match(html, /활용 가능|일부 제한|확인 필요/);
  });

  it('uses the same three-part information hierarchy and selected treatment for every surface', async () => {
    const html = await renderScenario('default', 'stocks');

    assert.equal((html.match(/<strong>현재 확인 가능<\/strong>/g) ?? []).length, 4);
    assert.equal((html.match(/<strong>부족한 정보<\/strong>/g) ?? []).length, 4);
    assert.equal((html.match(/<strong>이용 시 주의점<\/strong>/g) ?? []).length, 4);
    assert.match(html, /data-surface="stocks"[^>]*aria-current="true"/);
    assert.match(html, /data-surface="today"[^>]*aria-current="false"/);
  });

  it('renders zero evidence as an honest attention state instead of an outage', async () => {
    const html = await renderScenario('empty');

    assert.match(html, /확인 필요/);
    assert.match(html, /상태 정보가 아직 없습니다/);
    assert.doesNotMatch(html, /오류가 발생|불러오지 못했습니다|장애/);
  });

  it('shows a clear no-limitation message when there is no global limitation', async () => {
    const html = await renderScenario('all-ready');

    assert.match(html, /현재 확인된 공통 제한이 없습니다/);
  });

  it('never renders operator, score, advisory, or judgment-verdict copy', async () => {
    const html = [
      await renderScenario('default'),
      await renderScenario('all-ready'),
      await renderScenario('source-limited'),
      await renderScenario('empty'),
    ].join(' ');

    assert.doesNotMatch(
      html,
      /행 수|row count|파이프라인|잡 이름|analysis run|dataset|신뢰도\s*\d|\d+%|지금 사세요|매도하세요|목표가|손절가|익절가|성공한 판단|실패한 판단/i,
    );
  });

  it('stacks at 1240px and gives cards stable wrapping and selected containment', async () => {
    const css = await readFile(
      new URL('../src/pages/research-workspace/ui/views/status-view.module.css', import.meta.url),
      'utf8',
    );

    assert.match(css, /@media \(max-width: 1240px\)/);
    assert.match(css, /\.surfaceGrid[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /\.surfaceCard[\s\S]*?border:\s*1px solid/);
    assert.match(css, /\.surfaceCard[\s\S]*?background:/);
    assert.match(css, /\.surfaceCard[\s\S]*?box-shadow:/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
    assert.match(css, /overflow:\s*(?:hidden|auto)/);
  });
});
