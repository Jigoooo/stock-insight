import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { createElement } from 'react';

const read = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

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
    assert.match(source, /data-slot="pagination-ellipsis"[\s\S]*?\{children \?\?/);
    assert.match(styles, /\.ellipsis \[data-slot='select-control'\]/);
    assert.match(styles, /min-height: 34px/);
    assert.match(styles, /@media \(max-width: 520px\)/);
    assert.match(styles, /min-width: 44px/);
    assert.match(styles, /min-height: 44px/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });

  it('normalizes native disabled and aria-disabled action states', async () => {
    const availability = await import('../src/shared/ui/pagination/pagination-availability.ts');

    assert.equal(availability.isPaginationActionDisabled({ disabled: true }), true);
    assert.equal(availability.isPaginationActionDisabled({ ariaDisabled: true }), true);
    assert.equal(availability.isPaginationActionDisabled({ ariaDisabled: 'true' }), true);
    assert.equal(availability.isPaginationActionDisabled({ ariaDisabled: 'false' }), false);

    assert.deepEqual(availability.paginationActionSemantics(true, false), {
      ariaDisabled: true,
      nativeDisabled: undefined,
      tabIndex: -1,
    });
    assert.deepEqual(availability.paginationActionSemantics(true, true), {
      ariaDisabled: true,
      nativeDisabled: true,
      tabIndex: -1,
    });
  });

  it('blocks disabled slotted handlers before TanStack links local buttons or cursor anchors run', async () => {
    const availability = await import('../src/shared/ui/pagination/pagination-availability.ts');

    for (const childKind of ['TanStack-like link', 'local button', 'cursor anchor']) {
      const calls: string[] = [];
      const event = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
          calls.push('preventDefault');
        },
        stopPropagation() {
          calls.push('stopPropagation');
        },
      };
      const handler = availability.composePaginationActionClick({
        childOnClick: () => calls.push(`child:${childKind}`),
        disabled: true,
        onClick: () => calls.push('parent'),
      });

      handler(event);
      assert.deepEqual(calls, ['preventDefault', 'stopPropagation']);
    }
  });

  it('sanitizes disabled slotted links anchors and native buttons before Radix merges handlers', async () => {
    const availability = await import('../src/shared/ui/pagination/pagination-availability.ts');
    assert.equal(typeof availability.prepareSlottedPaginationAction, 'function');

    function TanStackLikeLink() {
      return null;
    }

    for (const [childKind, child, nativeDisabled] of [
      [
        'TanStack-like link',
        createElement(TanStackLikeLink, { onClick: () => undefined }),
        undefined,
      ],
      ['cursor anchor', createElement('a', { href: '/next', onClick: () => undefined }), undefined],
      ['local button', createElement('button', { onClick: () => undefined }), true],
    ] as const) {
      const prepared = availability.prepareSlottedPaginationAction(child, { disabled: true });
      assert.equal(prepared.slottedChild.props['aria-disabled'], true, childKind);
      assert.equal(prepared.slottedChild.props.tabIndex, -1, childKind);
      assert.equal(prepared.slottedChild.props.disabled, nativeDisabled, childKind);
      assert.equal(prepared.slottedChild.props.onClick, undefined, childKind);
    }
  });

  it('preserves enabled slotted child and consumer activation order', async () => {
    const availability = await import('../src/shared/ui/pagination/pagination-availability.ts');

    const calls: string[] = [];
    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {},
    };
    const handler = availability.composePaginationActionClick({
      childOnClick: () => calls.push('child'),
      disabled: false,
      onClick: () => calls.push('parent'),
    });

    handler(event);
    assert.deepEqual(calls, ['child', 'parent']);
  });
});
