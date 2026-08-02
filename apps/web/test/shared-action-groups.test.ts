import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('shared action groups', () => {
  it('publishes ButtonGroup as an action container without owning selection state', async () => {
    const [source, styles, publicIndex] = await Promise.all([
      read('shared/ui/button-group/button-group.tsx'),
      read('shared/ui/button-group/button-group.module.css'),
      read('shared/ui/index.ts'),
    ]);

    assert.match(source, /type ButtonGroupVariant = 'hairline' \| 'inset'/);
    assert.match(source, /role=\{role \?\? 'group'\}/);
    assert.match(source, /data-slot="button-group"/);
    assert.match(source, /data-orientation=\{orientation\}/);
    assert.match(source, /data-variant=\{variant\}/);
    assert.doesNotMatch(source, /value: string|onValueChange|aria-pressed/);
    assert.match(styles, /\[data-slot='button-control'\]/);
    assert.match(styles, /@media \(max-width: 480px\)/);
    assert.match(publicIndex, /export \* from '\.\/button-group'/);
  });

  it('publishes SplitButton with one primary action and a Radix-managed alternative-action menu', async () => {
    const [source, styles, publicIndex] = await Promise.all([
      read('shared/ui/split-button/split-button.tsx'),
      read('shared/ui/split-button/split-button.module.css'),
      read('shared/ui/index.ts'),
    ]);

    assert.match(source, /DropdownMenu as DropdownMenuPrimitive/);
    assert.match(source, /type SplitButtonVariant = 'solid' \| 'tonal' \| 'twin'/);
    assert.match(source, /DropdownMenuPrimitive\.Root/);
    assert.match(source, /DropdownMenuPrimitive\.Root modal=\{false\}/);
    assert.match(source, /DropdownMenuPrimitive\.Trigger asChild/);
    assert.match(source, /DropdownMenuPrimitive\.Portal/);
    assert.match(source, /DropdownMenuPrimitive\.Content/);
    assert.match(source, /DropdownMenuPrimitive\.Item/);
    assert.match(source, /data-slot="split-button"/);
    assert.match(source, /data-slot="split-button-primary"/);
    assert.match(source, /data-slot="split-button-trigger"/);
    assert.match(source, /data-slot="split-button-menu"/);
    assert.match(source, /aria-haspopup="menu"/);
    assert.match(source, /aria-controls=\{menuId\}/);
    assert.match(source, /aria-labelledby=\{undefined\}/);
    assert.match(source, /disableMenuWhilePending/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(styles, /animation: none/);
    assert.match(styles, /min-width: 44px/);
    assert.match(publicIndex, /export \* from '\.\/split-button'/);
  });

  it('adopts ButtonGroup for the relation camera actions without page-owned control states', async () => {
    const [relationGraph, relationStyles] = await Promise.all([
      read('pages/research-workspace/ui/relation-sigma-graph.tsx'),
      read('pages/research-workspace/ui/relation-detail.module.css'),
    ]);

    assert.match(relationGraph, /import \{ ButtonGroup \} from '@\/shared\/ui\/button-group'/);
    assert.match(
      relationGraph,
      /<ButtonGroup[\s\S]*aria-label="관계 지도 카메라 제어"[\s\S]*variant="inset"/,
    );
    assert.doesNotMatch(relationStyles, /\.graphControls button/);
    assert.doesNotMatch(relationStyles, /\.graphControls\s*\{[^}]*backdrop-filter/);
  });

  it('keeps undefined Motion props out of the upstream primitive', async () => {
    const canonicalButton = await read('shared/ui/button/button.tsx');

    assert.match(canonicalButton, /const hasComponentMotion =/);
    assert.match(canonicalButton, /const componentMotionProps: ButtonMotionProps/);
    assert.match(canonicalButton, /transition === undefined \? \{\} : \{ transition \}/);
    assert.match(canonicalButton, /\.\.\.componentMotionProps/);
    assert.doesNotMatch(canonicalButton, /whileHover=\{unavailable \? undefined/);
  });
});
