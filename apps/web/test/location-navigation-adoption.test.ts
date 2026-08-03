import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('location navigation shared UI adoption', () => {
  it('builds the UI Lab breadcrumb and pagination previews from public compositions', async () => {
    const [breadcrumb, pagination, styles] = await Promise.all([
      read('pages/ui-lab/ui/breadcrumb-mockup.tsx'),
      read('pages/ui-lab/ui/pagination-mockup.tsx'),
      read('pages/ui-lab/ui/location-navigation-catalog.module.css'),
    ]);

    assert.match(breadcrumb, /from '@\/shared\/ui\/breadcrumb'/);
    for (const anatomy of [
      'Breadcrumb',
      'BreadcrumbList',
      'BreadcrumbItem',
      'BreadcrumbLink',
      'BreadcrumbPage',
      'BreadcrumbSeparator',
      'BreadcrumbEllipsis',
    ]) {
      assert.match(breadcrumb, new RegExp(`<${anatomy}\\b`));
    }

    assert.match(pagination, /from '@\/shared\/ui\/pagination'/);
    for (const anatomy of [
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
    ]) {
      assert.match(pagination, new RegExp(`<${anatomy}\\b`));
    }
    assert.match(pagination, /from '@\/shared\/ui\/select'/);
    assert.match(pagination, /popupMinWidth=\{120\}/);
    assert.doesNotMatch(pagination, /from 'motion\/react'/);

    for (const removedStateSelector of [
      'breadcrumbCurrent',
      'breadcrumbLink',
      'paginationAction',
      'paginationIndicator',
      'cursorAction',
      'cursorStatus',
    ]) {
      assert.doesNotMatch(styles, new RegExp(`\\.${removedStateSelector}\\b`));
    }
  });

  it('uses shared cursor pagination without changing product cursor contracts', async () => {
    const views = await Promise.all(
      ['today-view.tsx', 'radar-view.tsx', 'history-view.tsx'].map((file) =>
        read(`pages/research-workspace/ui/views/${file}`),
      ),
    );

    for (const source of views) {
      assert.match(source, /from '@\/shared\/ui\/pagination'/);
      assert.match(source, /<CursorPagination\b/);
      assert.match(source, /<CursorPaginationMessage\b/);
      assert.match(source, /<CursorPaginationAction\b/);
      assert.doesNotMatch(source, /className=\{styles\.feedPager\}/);
    }

    const [today, radar, history] = views;
    assert.match(today, /disabled=\{!interactive \|\| cursorLoading \|\| !nextCursor\}/);
    assert.match(today, /onClick=\{onLoadMore\}/);
    assert.match(radar, /data-testid="radar-load-more"/);
    assert.match(
      radar,
      /disabled=\{!interactive \|\| pageState === 'loading' \|\| !data\.nextCursor\}/,
    );
    assert.match(radar, /onClick=\{onLoadMore\}/);
    assert.match(history, /data-testid="history-load-more"/);
    assert.match(
      history,
      /disabled=\{!interactive \|\| pageState === 'loading' \|\| !data\.nextCursor\}/,
    );
    assert.match(history, /onClick=\{onLoadMore\}/);
  });
});
