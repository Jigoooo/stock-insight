import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import ts from 'typescript';

const sourceRoot = new URL('../src/', import.meta.url);
const read = (path: string) => readFile(new URL(path, sourceRoot), 'utf8');

async function readTypeScriptTree(
  directory: URL,
): Promise<Array<{ path: string; source: string }>> {
  const files: Array<{ path: string; source: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) files.push(...(await readTypeScriptTree(child)));
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      files.push({ path: child.pathname, source: await readFile(child, 'utf8') });
    }
  }
  return files;
}

function importedModules(source: string, fileName: string) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  return sourceFile.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [],
  );
}

describe('Task 1 product shared UI adoption', () => {
  it('keeps product TypeScript consumers on public purpose entry points', async () => {
    const productFiles = (
      await Promise.all(
        ['pages', 'widgets', 'features', 'entities', 'routes'].map((layer) =>
          readTypeScriptTree(new URL(`${layer}/`, sourceRoot)),
        ),
      )
    )
      .flat()
      .filter(({ path }) => !path.includes('/pages/ui-lab/'));
    const deepImports = productFiles.flatMap(({ path, source }) =>
      importedModules(source, path)
        .filter((specifier) => /^@\/shared\/ui\/[^/]+\/.+/.test(specifier))
        .map((specifier) => `${path}:${specifier}`),
    );

    assert.deepEqual(deepImports, []);
  });

  it('uses the shared Dialog composition for the evidence inspector', async () => {
    const [inspector, inspectorFrame] = await Promise.all([
      read('pages/research-workspace/ui/evidence-inspector.tsx'),
      read('pages/research-workspace/ui/detail-inspector-frame.tsx'),
    ]);

    assert.match(inspector, /<DetailInspectorFrame\b/);
    assert.match(inspectorFrame, /from '@\/shared\/ui\/dialog'/);
    assert.match(inspectorFrame, /<Dialog\b/);
    assert.match(inspectorFrame, /<DialogContent\b/);
    assert.match(inspectorFrame, /<DialogHeader\b/);
    assert.match(inspectorFrame, /<DialogBody\b/);
    assert.match(inspectorFrame, /<Dialog\s+modal\s/);
    assert.match(inspectorFrame, /\bshowOverlay\s/);
    assert.doesNotMatch(inspectorFrame, /onPointerDownOutside=/);
    assert.doesNotMatch(inspectorFrame, /onFocusOutside=/);
    assert.doesNotMatch(inspectorFrame, /<dialog\b|useFocusTrap|focusableSelector/);
  });

  it('uses ToggleGroup for display modes and shared Button selection for stock rows', async () => {
    const [market, stocks, sections, marketCss, stockCss] = await Promise.all([
      read('pages/research-workspace/ui/market-exploration.tsx'),
      read('pages/research-workspace/ui/views/stocks-view.tsx'),
      read('pages/research-workspace/ui/stock-briefing-sections.tsx'),
      read('pages/research-workspace/ui/market-overview.module.css'),
      read('pages/research-workspace/ui/views/stocks-view.module.css'),
    ]);

    assert.match(market, /from '@\/shared\/ui\/toggle-group'/);
    assert.match(market, /<ToggleGroup\b/);
    assert.doesNotMatch(market, /from '@\/shared\/ui\/tabs'/);
    assert.doesNotMatch(marketCss, /\[aria-selected=['"]true['"]\]/);
    assert.match(stocks, /selectedStockKey/);
    assert.match(sections, /<Button\b/);
    assert.match(sections, /aria-current=\{selected \? 'true' : undefined\}/);
    assert.doesNotMatch(`${stocks}\n${sections}`, /aria-pressed=|data-selected=/);
    assert.doesNotMatch(stockCss, /\[aria-pressed=['"]true['"]\]|tr\[data-selected=['"]true['"]\]/);
  });

  it('publishes invitation issue, revoke, copy, and failure results through shared toasts', async () => {
    const admin = await read('pages/admin-invitations/ui/admin-invitation-page.tsx');

    assert.match(admin, /import \{ notify \} from '@\/shared\/ui\/toast'/);
    for (const title of [
      '가입 코드를 발급했습니다',
      '가입 코드를 폐기했습니다',
      '가입 코드를 복사했습니다',
      '요청을 완료하지 못했습니다',
      '가입 코드를 복사하지 못했습니다',
    ]) {
      assert.match(admin, new RegExp(`notify\\.(?:success|error)\\('${title}'`));
    }
    assert.match(admin, /<div[\s\S]*?data-testid="admin-invitation-status"/);
    assert.doesNotMatch(admin, /<output[\s\S]*?data-testid="admin-invitation-status"/);
    assert.match(admin, /<InlineFeedbackRegion/);
    assert.doesNotMatch(admin, /<output\b/);
    assert.match(admin, /<WorkspaceState[\s\S]*?announcement="inherit"[\s\S]*?kind="error"/);
  });

  it('locks the market ToggleGroup browser contract to Radix radio semantics', async () => {
    const e2e = await readFile(
      new URL('../../../e2e/research-workspace-v3.spec.ts', import.meta.url),
      'utf8',
    );

    assert.match(e2e, /getByRole\('radiogroup', \{ name: '시장 보조 탐색 선택' \}\)/);
    assert.match(e2e, /getByRole\('radio'\)/);
    assert.match(e2e, /toHaveAttribute\('aria-checked', 'true'\)/);
    assert.match(e2e, /press\('ArrowRight'\)[\s\S]*?toBeFocused\(\)[\s\S]*?aria-checked', 'false'/);
    assert.match(e2e, /press\('Space'\)[\s\S]*?aria-checked', 'true'/);
    assert.doesNotMatch(e2e, /getByRole\('group', \{ name: '시장 보조 탐색 선택' \}\)/);
  });
});
