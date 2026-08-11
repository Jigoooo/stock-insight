import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

import { DEPTH_MODES, type DepthLevel, type DepthMode } from '../src/shared/depth/depth-mode.ts';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const gateUrl = new URL('../src/shared/depth/depth-gate.tsx', import.meta.url);

const DEEP_MARKER = 'DEPTH_GATE_DEEP_CONTENT_MARKER';

type DepthModule = {
  DepthGate: ComponentType<{ at: DepthLevel; children: ReactNode; label: string }>;
  DepthModeProvider: ComponentType<{ children: ReactNode; pinnedMode?: DepthMode }>;
};

async function withViteServer<T>(run: (server: ViteDevServer) => Promise<T>): Promise<T> {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    root: webRoot,
    server: { hmr: false, middlewareMode: true, watch: null, ws: false },
  });
  try {
    return await run(server);
  } finally {
    await server.close();
  }
}

function renderGate(module: DepthModule, mode: DepthMode, at: DepthLevel): string {
  return renderToStaticMarkup(
    createElement(
      module.DepthModeProvider,
      { pinnedMode: mode },
      createElement(
        module.DepthGate,
        { at, label: '자세한 근거' },
        createElement('p', null, DEEP_MARKER),
      ),
    ),
  );
}

describe('깊이 3모드 — 도달성', () => {
  it('어느 모드에서도 깊은 내용이 DOM 에 남고 접힘은 accordion 으로 도달 가능하다', async () => {
    const markup = await withViteServer(async (server) => {
      const module = (await server.ssrLoadModule(
        '/src/shared/depth/depth-gate.tsx',
      )) as unknown as { DepthGate: DepthModule['DepthGate'] };
      const context = (await server.ssrLoadModule(
        '/src/shared/depth/depth-context.tsx',
      )) as unknown as { DepthModeProvider: DepthModule['DepthModeProvider'] };
      const depth: DepthModule = {
        DepthGate: module.DepthGate,
        DepthModeProvider: context.DepthModeProvider,
      };

      const rendered: Record<string, string> = {};
      for (const mode of DEPTH_MODES) {
        for (const level of ['essential', 'standard', 'research'] as const) {
          rendered[`${mode}:${level}`] = renderGate(depth, mode, level);
        }
      }
      return rendered;
    });

    for (const [key, html] of Object.entries(markup)) {
      // IA 36줄: 도달 경로가 없으면 그건 삭제다. 어떤 모드에서도 내용은 DOM 에 있다.
      assert.ok(html.includes(DEEP_MARKER), `${key}: 깊은 내용이 DOM 에서 사라졌다`);
      assert.doesNotMatch(html, /display:\s*none/i, `${key}: display:none 으로 숨겼다`);
      // Radix 는 forceMount 없이 닫힌 Collapsible 에 hidden 속성을 붙인다.
      assert.doesNotMatch(html, /\shidden(?:=|\s|>)/, `${key}: hidden 속성으로 숨겼다`);
    }

    // 접힌 자리에는 반드시 펼치는 트리거(버튼)가 있다.
    const collapsed = Object.entries(markup).filter(([, html]) =>
      html.includes('data-depth-gate="collapsed"'),
    );
    assert.ok(collapsed.length > 0, '접힌 조합이 하나도 없다 — 게이트가 동작하지 않는다');
    for (const [key, html] of collapsed) {
      assert.match(html, /data-slot="accordion-trigger"/, `${key}: 펼치는 트리거가 없다`);
      assert.match(html, /<button[^>]+aria-expanded="false"/, `${key}: 접힘 상태 고지가 없다`);
    }

    // beginner 에서 research 내용은 접혀야 하고, research 모드에서는 펼쳐져야 한다.
    assert.match(markup['beginner:research'] ?? '', /data-depth-gate="collapsed"/);
    assert.match(markup['research:research'] ?? '', /data-depth-gate="expanded"/);
    assert.match(markup['beginner:essential'] ?? '', /data-depth-gate="expanded"/);
  });

  it('게이트가 콘텐츠를 언마운트하거나 조건부로 버리지 않는다', async () => {
    const source = await readFile(gateUrl, 'utf8');
    // 주석은 계약이 아니다. 설명문에 적힌 `display: none` 을 위반으로 세지 않는다.
    const code = source.replaceAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

    assert.match(code, /keepRendered/, '접힘은 언마운트가 아니라 keepRendered 여야 한다');
    assert.doesNotMatch(code, /return null/, '게이트는 절대 null 을 돌려주지 않는다');
    assert.doesNotMatch(code, /display:\s*['"]?none/i);
    assert.doesNotMatch(code, /\bhidden\b\s*[=}]/);
    assert.match(code, /shared\/ui\/accordion/, '기존 공용 accordion 을 쓴다');
  });
});
