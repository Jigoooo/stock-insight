import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = async (path: string) =>
  readFile(new URL(`../src/${path}`, import.meta.url), 'utf8').catch(() => '');

describe('shared location navigation', () => {
  it('publishes the approved Breadcrumb anatomy and semantic current-page contract', async () => {
    const [source, publicIndex] = await Promise.all([
      read('shared/ui/breadcrumb/breadcrumb.tsx'),
      read('shared/ui/breadcrumb/index.ts'),
    ]);

    for (const publicName of [
      'Breadcrumb',
      'BreadcrumbList',
      'BreadcrumbItem',
      'BreadcrumbLink',
      'BreadcrumbPage',
      'BreadcrumbSeparator',
      'BreadcrumbEllipsis',
      'BreadcrumbVariant',
    ]) {
      assert.match(publicIndex, new RegExp(`\\b${publicName}\\b`));
    }

    assert.match(source, /type BreadcrumbVariant = 'hairline' \| 'soft-inset' \| 'ledger'/);
    assert.match(source, /data-slot="breadcrumb"/);
    assert.match(source, /data-slot="breadcrumb-list"/);
    assert.match(source, /data-slot="breadcrumb-item"/);
    assert.match(source, /data-slot="breadcrumb-link"/);
    assert.match(source, /aria-current="page"/);
    assert.match(source, /const Comp = asChild \? Slot\.Root : 'a'/);
  });

  it('publishes page and cursor pagination with a scoped reduced-motion indicator', async () => {
    const [source, styles, publicIndex] = await Promise.all([
      read('shared/ui/pagination/pagination.tsx'),
      read('shared/ui/pagination/pagination.module.css'),
      read('shared/ui/pagination/index.ts'),
    ]);

    for (const publicName of [
      'Pagination',
      'PaginationList',
      'PaginationItem',
      'PaginationLink',
      'PaginationPrevious',
      'PaginationNext',
      'PaginationEllipsis',
      'PaginationStatus',
      'CursorPagination',
      'CursorPaginationMessage',
      'CursorPaginationAction',
      'PaginationVariant',
    ]) {
      assert.match(publicIndex, new RegExp(`\\b${publicName}\\b`));
    }

    assert.match(source, /type PaginationVariant = 'hairline' \| 'soft-inset' \| 'ledger'/);
    assert.match(source, /<LayoutGroup id=\{layoutScopeId\}>/);
    assert.match(source, /layoutId="pagination-soft-inset-indicator"/);
    assert.match(source, /reducedMotion \? \{ duration: 0 \}/);
    assert.match(source, /const isCurrent = current \|\| ariaCurrent === 'page'/);
    assert.match(source, /aria-current=\{isCurrent \? 'page' : ariaCurrent\}/);
    assert.match(source, /const Comp = asChild \? Slot\.Root : 'a'/);
    assert.match(source, /const Comp = asChild \? Slot\.Root : 'button'/);
    assert.match(source, /data-slot="pagination-ellipsis"[\s\S]*?\{children \?\?/);
    assert.match(styles, /\.ellipsis \[data-slot='select-control'\]/);
    assert.match(styles, /min-height: 34px/);
    assert.match(styles, /@media \(max-width: 520px\)/);
    assert.match(styles, /min-width: 44px/);
    assert.match(styles, /min-height: 44px/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
