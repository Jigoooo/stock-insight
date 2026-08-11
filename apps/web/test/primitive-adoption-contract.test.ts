import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

const productControlUrls = [
  new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/research-workspace-page.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/relation-sigma-graph.tsx', import.meta.url),
  new URL('../src/pages/research-workspace/ui/evidence-inspector.tsx', import.meta.url),
  new URL('../src/pages/auth/signup-page.tsx', import.meta.url),
  new URL('../src/pages/auth/login-page.tsx', import.meta.url),
  new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url),
  // `entities/stock/ui/stock-detail.tsx` 가 여기 있었다. 2026-08-11 에 지웠다 —
  // 어떤 라우트도 렌더하지 않는 502줄짜리 죽은 화면이었고, 학습 카드 렌더 패턴만
  // `pages/asset-deep-dive/ui/asset-learning-cards.tsx` 로 들어올렸다. 목록에
  // 남겨 두면 `readFile` 이 던져 이 테스트가 없는 파일을 지키게 된다.
];

const researchWorkspaceUrls = [
  'pages/research-workspace/ui/research-workspace-page.tsx',
  'pages/research-workspace/ui/market-exploration.tsx',
  'pages/research-workspace/ui/stock-briefing-inspector.tsx',
  'pages/research-workspace/ui/evidence-inspector.tsx',
  'pages/research-workspace/ui/geo-market-map.tsx',
  'pages/research-workspace/ui/workspace-search.tsx',
  'pages/research-workspace/ui/views/today-view.tsx',
  'pages/research-workspace/ui/views/market-connections-view.tsx',
  'pages/research-workspace/ui/views/stocks-view.tsx',
  'pages/research-workspace/ui/views/history-view.tsx',
  'pages/research-workspace/ui/views/status-view.tsx',
  'shared/ui/workspace/data-table.tsx',
  'shared/ui/workspace/panel.tsx',
  'shared/ui/workspace/structured-list.tsx',
];

function missingMotionRecipes(source: string, fileName: string) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const components = new Set(['Button', 'IconButton', 'TextLink']);
  const missing: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const component = node.tagName.getText(sourceFile);
      if (components.has(component)) {
        const motion = node.attributes.properties.find(
          (attribute): attribute is ts.JsxAttribute =>
            ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'motion',
        );
        if (!motion?.initializer) missing.push(`${fileName}:${component}`);
      }
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  return missing;
}

describe('shared UI adoption contract', () => {
  it('keeps research workspace composition on canonical shared UI boundaries', async () => {
    const sources = await Promise.all(researchWorkspaceUrls.map(read));
    for (const source of sources) {
      assert.doesNotMatch(source, /@\/shared\/ui\/(?:primitives|animate-ui)(?:\/|['"])/);
    }
  });

  it('exposes explicit canonical anatomy and local Motion ownership', async () => {
    const [button, input, field, switchSource, checkbox, toggleGroup, select, combobox, link] =
      await Promise.all([
        read('shared/ui/button/button.tsx'),
        read('shared/ui/input/input.tsx'),
        read('shared/ui/field/field.tsx'),
        read('shared/ui/switch/switch.tsx'),
        read('shared/ui/checkbox/checkbox.tsx'),
        read('shared/ui/toggle-group/toggle-group.tsx'),
        read('shared/ui/select/select.tsx'),
        read('shared/ui/combobox/combobox.tsx'),
        read('shared/ui/link/link.tsx'),
      ]);

    assert.match(button, /data-slot="button-control"/);
    assert.match(input, /data-slot="input-shell"/);
    assert.match(field, /data-slot="field-label"/);
    assert.match(switchSource, /data-slot="switch-control"/);
    assert.match(checkbox, /data-slot="checkbox-control"/);
    assert.match(toggleGroup, /layoutId="toggle-group-indicator"/);
    assert.doesNotMatch(toggleGroup, /whileTap|scale/);
    for (const source of [select, combobox]) {
      assert.match(source, /data-slot="select-root"/);
      assert.match(source, /data-slot="select-option"/);
    }
    assert.match(link, /data-slot="text-link-control"/);
    assert.match(link, /<motion\.span\b/);
  });

  it('removes raw native controls from the bounded product-control inventory', async () => {
    const sources = await Promise.all(productControlUrls.map((url) => readFile(url, 'utf8')));
    const rawControls = sources.flatMap((source, index) =>
      [...source.matchAll(/<(button|a|input|select|textarea)\b/g)].map(
        (match) => `${productControlUrls[index]?.pathname}:${match[1]}`,
      ),
    );

    assert.deepEqual(rawControls, []);
  });

  it('requires explicit interaction recipes at bounded Motion-capable call sites', async () => {
    const urls = productControlUrls.filter((url) => !url.pathname.includes('/src/pages/auth/'));
    const sources = await Promise.all(urls.map((url) => readFile(url, 'utf8')));
    const missing = sources.flatMap((source, index) =>
      missingMotionRecipes(source, urls[index]?.pathname ?? `target-${index}.tsx`),
    );

    assert.deepEqual(missing, []);
  });

  it('keeps page styles out of canonical control state ownership', async () => {
    const styles = await Promise.all([
      read('pages/auth/auth-page.module.css'),
      read('pages/research-workspace/ui/research-workspace-page.module.css'),
    ]);
    for (const source of styles) {
      assert.doesNotMatch(
        source,
        /\.button:active|input:focus(?:-visible|-within)?|\[role=['"]option['"]\]|\[data-slot=['"](?:toast|dialog)/,
      );
    }
  });
});
