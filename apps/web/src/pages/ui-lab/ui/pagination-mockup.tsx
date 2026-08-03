import { useState } from 'react';

import styles from './location-navigation-catalog.module.css';

import {
  CursorPagination,
  CursorPaginationAction,
  CursorPaginationMessage,
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  PaginationStatus,
  type PaginationVariant as SharedPaginationVariant,
} from '@/shared/ui/pagination';
import { Select } from '@/shared/ui/select';

export type PaginationVariant = SharedPaginationVariant;

type CursorPreviewState = 'idle' | 'loading' | 'complete';
type PageWindowItem = number | 'ellipsis' | 'ellipsis-end';

interface PaginationMockupProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  variant: PaginationVariant;
}

const totalPages = 12;

function pageWindow(currentPage: number): readonly PageWindowItem[] {
  if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', totalPages];
}

function omittedPages(items: readonly PageWindowItem[], index: number): readonly number[] {
  const previousPage = items
    .slice(0, index)
    .reverse()
    .find((item): item is number => typeof item === 'number');
  const nextPage = items.slice(index + 1).find((item): item is number => typeof item === 'number');

  if (previousPage === undefined || nextPage === undefined) return [];

  return Array.from(
    { length: nextPage - previousPage - 1 },
    (_, offset) => previousPage + offset + 1,
  );
}

export function PaginationMockup({ currentPage, onPageChange, variant }: PaginationMockupProps) {
  const [cursorState, setCursorState] = useState<CursorPreviewState>('idle');
  const visiblePages = pageWindow(currentPage);

  async function loadCursorPreview() {
    if (cursorState !== 'idle') return;
    setCursorState('loading');
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setCursorState('complete');
  }

  return (
    <div className={styles.paginationFixture} data-pagination-variant={variant}>
      <Pagination aria-label={`Pagination 비교 · ${variant}`} variant={variant}>
        <PaginationList>
          <PaginationItem>
            <PaginationPrevious asChild disabled={currentPage === 1}>
              <button
                aria-label="이전 페이지"
                onClick={() => onPageChange(currentPage - 1)}
                type="button"
              >
                <span aria-hidden="true">←</span>
              </button>
            </PaginationPrevious>
          </PaginationItem>

          {variant === 'ledger' ? (
            <PaginationItem>
              <PaginationStatus
                aria-current="page"
                aria-label={`현재 ${currentPage}페이지, 전체 ${totalPages}페이지`}
              >
                {String(currentPage).padStart(2, '0')} / {totalPages}
              </PaginationStatus>
            </PaginationItem>
          ) : (
            visiblePages.map((item, index) => {
              if (typeof item !== 'number') {
                const hiddenPages = omittedPages(visiblePages, index);
                const firstHiddenPage = hiddenPages.at(0);
                const lastHiddenPage = hiddenPages.at(-1);
                const pageOptions = hiddenPages.map((page) => ({
                  label: `${page}페이지`,
                  value: String(page),
                }));

                return (
                  <PaginationItem key={item}>
                    <PaginationEllipsis>
                      <Select
                        aria-label={`${firstHiddenPage}~${lastHiddenPage}페이지 바로 이동`}
                        onValueChange={(value) => {
                          const nextPage = Number(value);
                          if (Number.isInteger(nextPage)) onPageChange(nextPage);
                        }}
                        options={pageOptions}
                        placeholder="…"
                        popupMinWidth={120}
                        value=""
                      />
                    </PaginationEllipsis>
                  </PaginationItem>
                );
              }

              return (
                <PaginationItem key={item}>
                  <PaginationLink asChild current={item === currentPage}>
                    <button
                      aria-label={`${item}페이지`}
                      data-pagination-page={item}
                      onClick={() => onPageChange(item)}
                      type="button"
                    >
                      <span className={styles.paginationNumber}>
                        {String(item).padStart(2, '0')}
                      </span>
                    </button>
                  </PaginationLink>
                </PaginationItem>
              );
            })
          )}

          <PaginationItem>
            <PaginationNext asChild disabled={currentPage === totalPages}>
              <button
                aria-label="다음 페이지"
                onClick={() => onPageChange(currentPage + 1)}
                type="button"
              >
                <span aria-hidden="true">→</span>
              </button>
            </PaginationNext>
          </PaginationItem>
        </PaginationList>
      </Pagination>

      {variant === 'ledger' ? (
        <CursorPagination data-cursor-preview>
          <CursorPaginationMessage aria-live="polite">
            {cursorState === 'idle'
              ? '다음 기록 준비'
              : cursorState === 'loading'
                ? '불러오는 중'
                : '마지막 기록'}
          </CursorPaginationMessage>
          {cursorState !== 'complete' ? (
            <CursorPaginationAction
              aria-label="다음 기록"
              disabled={cursorState === 'loading'}
              onClick={loadCursorPreview}
            >
              {cursorState === 'loading' ? (
                <span className={styles.cursorSpinner} aria-hidden="true" data-cursor-spinner />
              ) : null}
              {cursorState === 'loading' ? '불러오는 중' : '다음 기록'}
            </CursorPaginationAction>
          ) : null}
        </CursorPagination>
      ) : null}
    </div>
  );
}
