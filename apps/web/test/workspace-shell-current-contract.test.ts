import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { validateWorkspaceSearch } from '../src/pages/research-workspace/model/workspace-search.ts';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('current workspace shell behavior', () => {
  it('round-trips every supported URL field without inventing invalid state', () => {
    const current = {
      cursor: 'cursor:current',
      lane: 'explore',
      query: 'NVDA',
      record: 'record:current',
      view: 'themes',
    } as const;

    assert.deepEqual(validateWorkspaceSearch(current), current);
    assert.deepEqual(
      validateWorkspaceSearch({ cursor: '', lane: 'invalid', record: ' ', view: 'invalid' }),
      {},
    );
  });

  it('keeps URL authority and real navigation links', async () => {
    const [page, navigation, route, sections] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('widgets/workspace-shell/ui/workspace-navigation.tsx'),
      read('pages/research-workspace/ui/workspace-view-route.tsx'),
      read('features/workspace-navigation/model/sections.ts'),
    ]);
    assert.match(navigation, /<Link[\s\S]*?to=\{item\.href\}/);
    assert.match(navigation, /data-testid=\{`workspace-nav-\$\{item\.id\}`\}/);
    assert.match(navigation, /onFocus=\{\(\) => onPrefetch\?\.\(item\.id\)\}/);
    assert.match(navigation, /onPointerEnter=\{\(\) => onPrefetch\?\.\(item\.id\)\}/);
    assert.match(sections, /href: '\/workspace\/today'/);
    assert.match(route, /await navigate\(/);
    assert.match(
      page,
      /const section = onUrlStateChange \? \(viewLoadError \?\? data\.view\) : localSection/,
    );
    assert.match(page, /const lane = onUrlStateChange/);
    assert.match(page, /void onUrlStateChange\?\.\(\{ record: undefined \}\)/);
  });

  it('presents the workspace as a four-step research journey', async () => {
    const [navigation, page, sections] = await Promise.all([
      read('widgets/workspace-shell/ui/workspace-navigation.tsx'),
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('features/workspace-navigation/model/sections.ts'),
    ]);

    assert.match(sections, /id: 'today',[\s\S]*?label: '오늘',[\s\S]*?navigationGroup: 'primary'/);
    assert.match(
      sections,
      /id: 'stocks',[\s\S]*?label: '내 종목',[\s\S]*?navigationGroup: 'primary'/,
    );
    assert.match(
      sections,
      /id: 'radar',[\s\S]*?label: '시장 연결',[\s\S]*?navigationGroup: 'primary'/,
    );
    assert.match(
      sections,
      /id: 'research',[\s\S]*?label: '복기',[\s\S]*?navigationGroup: 'primary'/,
    );
    assert.match(
      sections,
      /id: 'status',[\s\S]*?label: '데이터 신뢰도',[\s\S]*?navigationGroup: 'utility'/,
    );
    assert.match(sections, /id: 'crypto',[\s\S]*?navigationGroup: 'hidden'/);
    assert.match(navigation, /item\.navigationGroup !== 'hidden'/);
    assert.match(navigation, /data-navigation-group=\{item\.navigationGroup\}/);
    const primaryOffsets = ["id: 'today'", "id: 'stocks'", "id: 'radar'", "id: 'research'"].map(
      (id) => sections.indexOf(id),
    );
    assert.deepEqual(
      primaryOffsets,
      [...primaryOffsets].sort((a, b) => a - b),
    );
    assert.match(page, /item\.id === 'stocks' \? \{ count: data\.shell\.watchlistCount \}/);
    assert.doesNotMatch(
      page,
      /item\.id === 'research' \? \{ count: data\.shell\.watchlistCount \}/,
    );
  });

  it('keeps mobile navigation and evidence focus ownership explicit', async () => {
    const [page, inspector, inspectorFrame, shell, sheet, e2e] = await Promise.all([
      read('pages/research-workspace/ui/research-workspace-page.tsx'),
      read('pages/research-workspace/ui/evidence-inspector.tsx'),
      read('pages/research-workspace/ui/detail-inspector-frame.tsx'),
      read('widgets/workspace-shell/ui/workspace-shell.tsx'),
      read('shared/ui/sheet/sheet.tsx'),
      readFile(new URL('../../../e2e/research-workspace-v3.spec.ts', import.meta.url), 'utf8'),
    ]);
    assert.match(shell, /<Sheet open=\{mobileOpen\}/);
    assert.match(shell, /<SheetContent[\s\S]*?side="left"/);
    assert.match(shell, /inert=\{mobileOpen \|\| mobileModalInert \|\| undefined\}/);
    assert.match(sheet, /SheetPrimitive\.Content asChild forceMount/);
    assert.match(sheet, /<motion\.div/);
    assert.doesNotMatch(shell, /useFocusTrap|previousFocus|event\.key !== 'Escape'/);
    assert.match(inspector, /<DetailInspectorFrame/);
    assert.match(inspectorFrame, /<Dialog\s+modal\s/);
    assert.match(inspectorFrame, /<DialogContent[\s\S]*?portalled/);
    assert.match(inspectorFrame, /\bshowOverlay\s/);
    assert.match(
      inspectorFrame,
      /mobile\s*\?\s*'bottom-sheet'\s*:\s*desktopPresentation === 'modal'[\s\S]*?\?\s*'modal'[\s\S]*?:\s*'inspector'/,
    );
    assert.doesNotMatch(inspectorFrame, /useFocusTrap|event\.key !== 'Escape'/);
    assert.match(page, /opener\?\.isConnected/);
    assert.match(e2e, /supports mobile navigation and keyboard-visible controls/);
    assert.match(e2e, /await page\.keyboard\.press\('Escape'\)/);
    assert.match(e2e, /workspace-nav-today'\)\)\.toBeFocused/);
    assert.match(e2e, /menuButton\)\.toBeFocused/);
  });
});
