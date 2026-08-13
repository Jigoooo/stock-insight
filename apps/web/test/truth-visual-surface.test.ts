import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';

import { DEPTH_MODES, type DepthMode } from '../src/shared/depth/depth-mode.ts';
import { TRUTH_CLASS_COPY } from '../src/shared/ui/truth/truth-class-labels.ts';
import { truthClassSchema } from '@stock-insight/contracts/truth-visual-language';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

const CLAIM_MARKER = 'TRUTH_CLAIM_BODY_MARKER';

/**
 * 진술 종류를 화면에 붙인 표면. 이 목록이 곧 "실제로 뜨는 종류"의 출처다.
 *
 * **손목록을 두지 않는다.** 원래 세 줄짜리 리터럴이었는데, 네 번째 표면
 * (`asset-tab-panel.tsx`)이 붙는 동안 목록은 그대로였다. 그래서 그 표면의
 * 분류 근거 문장·enum 노출·깊이 분기가 어느 테스트에도 걸리지 않았고,
 * 아래 `basisTexts.length === 4` 단언은 "세 파일의 문장이 4개" 라서 통과하며
 * 다섯 번째를 세지 않았다. 목록이 조용히 표류하는 동안 게이트는 초록이었다.
 *
 * 배럴 렌더러 목록에 이미 적용한 규율을 그대로 옮긴다 — src 를 훑어 truth
 * 모듈을 import 하는 파일 집합을 구한다. 새 표면이 붙는 순간 목록이 스스로
 * 늘어나고, 그 표면이 규율을 어기면 바로 이 테스트가 잡는다.
 */
async function collectTsx(dir: URL, found: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await collectTsx(new URL(`${entry.name}/`, dir), found);
    else if (entry.name.endsWith('.tsx')) found.push(new URL(entry.name, dir).pathname);
  }
  return found;
}

async function appliedSurfaces(): Promise<string[]> {
  const srcRoot = new URL('../src/', import.meta.url);
  const files = await collectTsx(srcRoot);
  const applied: string[] = [];
  for (const path of files) {
    // 모듈 자신은 제외한다 — 그것을 쓰는 쪽만 표면이다.
    if (path.includes('/shared/ui/truth/')) continue;
    const source = await readFile(path, 'utf8');
    if (source.includes("from '@/shared/ui/truth'")) {
      applied.push(path.slice(fileURLToPath(srcRoot).length));
    }
  }
  return applied.sort();
}

type TruthModule = {
  TruthChip: ComponentType<{ binding: unknown }>;
  TruthClaimRow: ComponentType<{
    basis?: string;
    binding: unknown;
    children: ReactNode;
    itemCount?: number;
  }>;
  TruthExplanation: ComponentType<{ basis?: string; binding: unknown; itemCount?: number }>;
  TruthLegend: ComponentType<{ entries: readonly unknown[]; title?: string }>;
  boundTruth: (truthClass: string) => unknown;
};

/**
 * 배럴이 내보내는 렌더러 전부. 목록이 곧 "화면에 도달할 수 있는 표면" 이고,
 * 아래 fail-closed 프로브가 이 목록을 훑는다.
 *
 * 손으로 적은 목록이 아니라 배럴의 실제 export 와 대조된다 — 새 렌더러를
 * 배럴에 얹고 여기 안 적으면 대조 단언이 먼저 깨진다. 2026-08-11 에
 * `TruthExplanation` 이 정확히 그 상태(가드 없이 배럴에 노출)였다.
 */
const BARREL_RENDERERS = ['TruthChip', 'TruthClaimRow', 'TruthExplanation', 'TruthLegend'] as const;

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

async function renderAtEveryMode(): Promise<Record<DepthMode, string>> {
  return withViteServer(async (server) => {
    const truth = (await server.ssrLoadModule(
      '/src/shared/ui/truth/index.ts',
    )) as unknown as TruthModule;
    const binding = (await server.ssrLoadModule(
      '/src/shared/ui/truth/truth-binding-state.ts',
    )) as unknown as {
      truthBindingForContentPackItem: (kind: string, subkind?: string | null) => unknown;
    };
    const context = (await server.ssrLoadModule(
      '/src/shared/depth/depth-context.tsx',
    )) as unknown as {
      DepthModeProvider: ComponentType<{ children: ReactNode; pinnedMode?: DepthMode }>;
    };

    const rendered = {} as Record<DepthMode, string>;
    for (const mode of DEPTH_MODES) {
      rendered[mode] = renderToStaticMarkup(
        createElement(
          context.DepthModeProvider,
          { pinnedMode: mode },
          createElement(
            truth.TruthClaimRow,
            {
              basis: '규칙으로 도출된 경로입니다.',
              binding: binding.truthBindingForContentPackItem('impact_path'),
              itemCount: 7,
            },
            createElement('p', null, CLAIM_MARKER),
          ),
          createElement(truth.TruthLegend, {
            entries: [
              {
                basis: '사람이 확인한 관계만 그립니다.',
                binding: binding.truthBindingForContentPackItem('relation'),
                itemCount: 3,
              },
              { binding: binding.truthBindingForContentPackItem('evidence') },
            ],
          }),
        ),
      );
    }
    return rendered;
  });
}

describe('진술 종류 시각 언어 — 렌더', () => {
  it('세 모드 어디에도 내부 enum 이 화면에 나오지 않는다 (UX 헌법 7번)', async () => {
    const markup = await renderAtEveryMode();

    for (const [mode, html] of Object.entries(markup)) {
      // 마크업에서 data-* 속성값(내부 상태 hook)은 제외하고 사람이 읽는 텍스트만 본다.
      const visible = html.replaceAll(/<[^>]*>/g, ' ').replaceAll(CLAIM_MARKER, '(본문)');
      for (const truthClass of truthClassSchema.options) {
        assert.ok(!visible.includes(truthClass), `${mode}: ${truthClass} 가 화면 텍스트에 있다`);
      }
      for (const state of ['not_a_truth_object', 'undecided', 'impact_path', 'source_revision']) {
        assert.ok(!visible.includes(state), `${mode}: ${state} 가 화면 텍스트에 있다`);
      }
      assert.doesNotMatch(visible, /[A-Z]{3,}/, `${mode}: 대문자 식별자가 보인다`);
    }
  });

  it('한국어 칩 라벨이 세 모드 모두에서 그대로 보인다 — 깊이는 칩을 지우지 않는다', async () => {
    const markup = await renderAtEveryMode();
    for (const [mode, html] of Object.entries(markup)) {
      assert.match(html, /data-slot="truth-chip"/, `${mode}: 칩이 없다`);
      assert.ok(html.includes(TRUTH_CLASS_COPY.HYPOTHESIS.label), `${mode}: 가설 라벨이 없다`);
      assert.ok(html.includes(TRUTH_CLASS_COPY.RELATION.label), `${mode}: 관계 라벨이 없다`);
      assert.ok(html.includes(CLAIM_MARKER), `${mode}: 감싼 내용이 사라졌다`);
    }
  });

  it('구분자는 dash 패턴이다 — 가설은 파선, 관계는 실선, 비상태는 선 없음', async () => {
    const markup = await renderAtEveryMode();
    const html = markup.standard;
    assert.match(html, /data-slot="truth-claim-row"[^>]*data-truth-rule="dashed"/);
    assert.match(html, /data-truth-rule="solid"/);
    assert.match(html, /data-truth-rule="none"/);
  });

  it('설명은 어느 모드에서도 DOM 에 남는다 — 접힘이지 삭제가 아니다', async () => {
    const markup = await renderAtEveryMode();
    for (const [mode, html] of Object.entries(markup)) {
      assert.ok(
        html.includes(TRUTH_CLASS_COPY.HYPOTHESIS.description),
        `${mode}: 한 줄 설명이 DOM 에서 사라졌다`,
      );
      assert.doesNotMatch(html, /display:\s*none/i, `${mode}: display:none 으로 숨겼다`);
      assert.doesNotMatch(html, /\shidden(?:=|\s|>)/, `${mode}: hidden 속성으로 숨겼다`);
    }
  });

  it('깊이 3모드가 설명의 양만 바꾼다 — 초보는 접고 표준은 펼친다', async () => {
    const markup = await renderAtEveryMode();

    // 초보: 한 줄 설명과 분류 근거가 둘 다 접힌다(트리거로 도달 가능).
    assert.match(markup.beginner, /data-depth-gate="collapsed" data-depth-level="standard"/);
    assert.match(markup.beginner, /data-depth-gate="collapsed" data-depth-level="research"/);
    assert.match(markup.beginner, /<button[^>]+aria-expanded="false"/);

    // 표준: 한 줄 설명은 펼쳐지고 분류 근거는 접힌다.
    assert.match(markup.standard, /data-depth-gate="expanded" data-depth-level="standard"/);
    assert.match(markup.standard, /data-depth-gate="collapsed" data-depth-level="research"/);

    // 연구: 둘 다 펼쳐진다.
    assert.match(markup.research, /data-depth-gate="expanded" data-depth-level="standard"/);
    assert.match(markup.research, /data-depth-gate="expanded" data-depth-level="research"/);
  });

  it('배럴의 렌더러는 하나도 빠짐없이 개인 범위 진술에서 던진다 (REQ-REC-001)', async () => {
    await withViteServer(async (server) => {
      const truth = (await server.ssrLoadModule(
        '/src/shared/ui/truth/index.ts',
      )) as unknown as TruthModule & Record<string, unknown>;

      // 목록이 배럴을 따라오는지 먼저 본다. 컴포넌트는 PascalCase `Truth*` 라는
      // 이 폴더의 규칙을 그대로 판별식으로 쓴다.
      const exported = Object.keys(truth)
        .filter((name) => /^Truth[A-Z]/.test(name) && typeof truth[name] === 'function')
        .sort();
      assert.deepEqual(exported, [...BARREL_RENDERERS], '배럴 렌더러 목록이 어긋났다');

      const personal = truth.boundTruth('PERSONAL_DECISION');
      const props: Record<(typeof BARREL_RENDERERS)[number], Record<string, unknown>> = {
        TruthChip: { binding: personal },
        TruthClaimRow: { binding: personal, children: createElement('p', null, CLAIM_MARKER) },
        TruthExplanation: { basis: '개인 기록입니다.', binding: personal, itemCount: 1 },
        TruthLegend: { entries: [{ basis: '개인 기록입니다.', binding: personal }] },
      };

      for (const name of BARREL_RENDERERS) {
        assert.throws(
          () =>
            renderToStaticMarkup(
              createElement(
                truth[name] as ComponentType<Record<string, unknown>>,
                props[name] as Record<string, unknown>,
              ),
            ),
          /REQ-REC-001/,
          `${name} 이 개인 범위 진술을 렌더한다`,
        );
      }
    });
  });

  it('숫자는 어느 모드에서도 같다', async () => {
    const markup = await renderAtEveryMode();
    for (const [mode, html] of Object.entries(markup)) {
      assert.ok(html.includes('항목 7건'), `${mode}: 가설 항목 수가 다르다`);
      assert.ok(html.includes('항목 3건'), `${mode}: 관계 항목 수가 다르다`);
    }
  });
});

describe('진술 종류 시각 언어 — 배선', () => {
  it('진술 종류를 붙인 표면은 전부 바인딩을 통해 붙인다', async () => {
    const surfaces = await appliedSurfaces();
    const sources = await Promise.all(surfaces.map(read));
    // 개수는 리터럴로 못 박지 않는다 — 목록이 소스에서 유도되므로 숫자를
    // 고정하면 표면이 늘 때마다 여기가 깨지고, 그 수리는 규율 확인이 아니라
    // 숫자 맞추기가 된다. 재는 것은 "하나도 없지는 않은가" 다.
    // 2026-08-13 측정: 5개(stock-briefing-inspector · evidence-inspector ·
    // relation-sigma-graph · asset-tab-panel · market-connection-inspector).
    // 네 번째는 손목록이 세 줄로 굳어 있는 동안 어느 테스트에도 걸리지 않았고,
    // 다섯 번째는 목록이 유도형이 된 뒤 붙어서 **곧바로** 이 검사에 들어왔다.
    assert.ok(sources.length > 0, '진술 종류를 붙인 표면이 하나도 없다');
    for (const [index, source] of sources.entries()) {
      assert.match(
        source,
        /from '@\/shared\/ui\/truth'/,
        `${surfaces[index]}: 진술 종류 모듈을 쓰지 않는다`,
      );
      assert.match(
        source,
        /truthBindingForContentPackItem\(/,
        `${surfaces[index]}: 바인딩을 통하지 않고 붙였다`,
      );
    }
  });

  it('연구 깊이에 나가는 분류 근거 문장에도 내부 어휘가 없다', async () => {
    const surfaces = await appliedSurfaces();
    const sources = await Promise.all(surfaces.map(read));
    const basisTexts = sources.flatMap((source) => [
      ...source.matchAll(/const \w*_BASIS =\s*\n?\s*'([^']*)'/g),
    ]);

    // 정규식이 조용히 0개를 매치하면 이 테스트는 장식이 된다. 다만 개수를
    // 리터럴로 못 박지 않는다 — 표면 목록이 스스로 늘어나는데 개수만 고정하면
    // 새 표면을 추가할 때마다 여기가 깨지고, 그 수리는 규율 확인이 아니라
    // 숫자 맞추기가 된다. 재는 것은 "표면마다 최소 하나는 있는가" 다.
    assert.ok(
      basisTexts.length >= surfaces.length,
      `분류 근거 문장이 표면 수(${surfaces.length})보다 적다: ${basisTexts.length}`,
    );
    for (const match of basisTexts) {
      const text = match[1] as string;
      assert.doesNotMatch(text, /[A-Z]{3,}/, `대문자 식별자 노출: ${text}`);
      for (const truthClass of truthClassSchema.options) {
        assert.ok(!text.includes(truthClass), `내부 enum 노출: ${truthClass} in ${text}`);
      }
    }
  });

  it('뷰가 진술 종류를 직접 문자열로 그리지 않는다', async () => {
    const sources = await Promise.all([
      ...(await appliedSurfaces()).map(read),
      read('shared/ui/truth/truth-chip.tsx'),
      read('shared/ui/truth/truth-claim-row.tsx'),
      read('shared/ui/truth/truth-legend.tsx'),
      read('shared/ui/truth/truth-explanation.tsx'),
    ]);
    for (const source of sources) {
      // JSX 안에서 클래스 이름을 그대로 출력하는 형태를 막는다.
      assert.doesNotMatch(source, /\{\s*[\w.]*truthClass\s*\}/i, '진술 종류 원문을 렌더한다');
    }
  });

  it('깊이 모드 API 를 직접 읽지 않는다 — 소비자는 게이트와 토글 둘뿐이다', async () => {
    const sources = await Promise.all([
      read('shared/ui/truth/truth-chip.tsx'),
      read('shared/ui/truth/truth-claim-row.tsx'),
      read('shared/ui/truth/truth-legend.tsx'),
      read('shared/ui/truth/truth-explanation.tsx'),
      ...(await appliedSurfaces()).map(read),
    ]);
    for (const source of sources) {
      for (const forbidden of [/\buseDepthMode\b/, /\bisExpandedAt\b/, /\bDEPTH_MODES\b/]) {
        assert.doesNotMatch(source, forbidden);
      }
    }
  });
});
