import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
const readNotices = () =>
  readFile(new URL('../../../THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');

const animateRevision = 'efeb96ffd7a3b7a4868667e4ac3c346620fb3044';
const shadcnRevision = 'cb2bcd88d93b2f9bddb030e9136f1f8773e7eac4';

const expectedSources = [
  ...[
    'sidebar',
    'sheet',
    'tabs',
    'tooltip',
    'accordion',
    'popover',
  ].map((name) => ({
    path: `shared/ui/animate-ui/components/radix/${name}.tsx`,
    upstream: `https://animate-ui.com/docs/components/radix/${name}`,
    item: `@animate-ui/components-radix-${name}`,
    revision: animateRevision,
    license: 'MIT + Commons Clause License Condition',
  })),
  ...[
    ['effects/auto-height', 'primitives-effects-auto-height'],
    ['effects/highlight', 'primitives-effects-highlight'],
    ['radix/accordion', 'primitives-radix-accordion'],
    ['radix/checkbox', 'primitives-radix-checkbox'],
    ['radix/popover', 'primitives-radix-popover'],
    ['radix/sheet', 'primitives-radix-sheet'],
    ['radix/tabs', 'primitives-radix-tabs'],
    ['radix/tooltip', 'primitives-radix-tooltip'],
  ].map(([path, item]) => ({
    path: `shared/ui/animate-ui/primitives/${path}.tsx`,
    upstream: `https://github.com/imskyleen/animate-ui/blob/${animateRevision}/apps/www/registry/primitives/${path}/index.tsx`,
    item: `@animate-ui/${item}`,
    revision: animateRevision,
    license: 'MIT + Commons Clause License Condition',
  })),
  {
    path: 'shared/lib/get-strict-context.tsx',
    upstream: `https://github.com/imskyleen/animate-ui/blob/${animateRevision}/apps/www/registry/lib/get-strict-context/index.tsx`,
    item: '@animate-ui/lib-get-strict-context',
    revision: animateRevision,
    license: 'MIT + Commons Clause License Condition',
  },
  {
    path: 'shared/lib/use-auto-height.tsx',
    upstream: `https://github.com/imskyleen/animate-ui/blob/${animateRevision}/apps/www/registry/hooks/use-auto-height/index.tsx`,
    item: '@animate-ui/hooks-use-auto-height',
    revision: animateRevision,
    license: 'MIT + Commons Clause License Condition',
  },
  {
    path: 'shared/lib/use-controlled-state.tsx',
    upstream: `https://github.com/imskyleen/animate-ui/blob/${animateRevision}/apps/www/registry/hooks/use-controlled-state/index.tsx`,
    item: '@animate-ui/hooks-use-controlled-state',
    revision: animateRevision,
    license: 'MIT + Commons Clause License Condition',
  },
  {
    path: 'shared/lib/use-mobile.ts',
    upstream: `https://github.com/shadcn-ui/ui/blob/${shadcnRevision}/apps/v4/registry/new-york-v4/hooks/use-mobile.ts`,
    item: 'use-mobile',
    revision: shadcnRevision,
    license: 'MIT License',
  },
] as const;

describe('workspace registry source', () => {
  it('keeps every imported registry source local and exactly attributed', async () => {
    const notices = await readNotices();

    for (const expected of expectedSources) {
      const source = await read(expected.path);
      const header = [
        `// Upstream: ${expected.upstream}`,
        `// Registry item: ${expected.item}`,
        `// Revision: ${expected.revision}`,
      ].join('\n');
      const notice = `| \`${expected.item}\` | ${expected.upstream} | \`${expected.revision}\` | ${expected.license} |`;

      assert.equal(source.includes(header), true, `${expected.path} exact provenance header`);
      assert.equal(notices.includes(notice), true, `${expected.item} exact notice entry`);
    }
  });

  it('keeps registry state styling out of page CSS', async () => {
    const pageCss = await read(
      'pages/research-workspace/ui/research-workspace-page.module.css',
    );
    assert.doesNotMatch(pageCss, /data-\[state=|focus-visible:ring-|whileHover|whileTap/);
  });
});
