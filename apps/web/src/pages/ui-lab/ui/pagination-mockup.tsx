import { Link } from '@tanstack/react-router';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';

import type { BreadcrumbPreviewId } from './location-navigation-catalog';
import styles from './location-navigation-catalog.module.css';
import type { RouteTabId } from './navigation-tabs-catalog';
import type { SideRouteId } from './side-navigation-catalog';

export type PaginationVariant = 'hairline' | 'soft-inset' | 'ledger';

type CursorPreviewState = 'idle' | 'loading' | 'complete';
type PageWindowItem = number | 'ellipsis' | 'ellipsis-end';

interface PaginationMockupProps {
  currentPage: number;
  searchContext: {
    breadcrumb: BreadcrumbPreviewId;
    routeTab: RouteTabId;
    sideRoute: SideRouteId;
  };
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

export function PaginationMockup({ currentPage, searchContext, variant }: PaginationMockupProps) {
  const reducedMotion = useReducedMotion();
  const [cursorState, setCursorState] = useState<CursorPreviewState>('idle');

  const searchForPage = (page: number) => ({
    'route-tab': searchContext.routeTab,
    'side-route': searchContext.sideRoute,
    breadcrumb: searchContext.breadcrumb,
    page,
  });

  async function loadCursorPreview() {
    if (cursorState !== 'idle') return;
    setCursorState('loading');
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    setCursorState('complete');
  }

  return (
    <div className={styles.paginationFixture} data-pagination-variant={variant}>
      <nav className={styles.paginationViewport} aria-label={`Pagination 비교 · ${variant}`}>
        {variant === 'ledger' ? (
          <div className={styles.ledgerControls}>
            {currentPage === 1 ? (
              <span
                className={styles.paginationAction}
                aria-disabled="true"
                aria-label="이전 페이지"
                tabIndex={-1}
              >
                <span aria-hidden="true">←</span>
              </span>
            ) : (
              <Link
                className={styles.paginationAction}
                search={searchForPage(currentPage - 1)}
                to="/__ui-lab"
              >
                <span aria-hidden="true">←</span>
                <span className="sr-only">이전 페이지</span>
              </Link>
            )}
            <span
              className={styles.ledgerPosition}
              aria-label={`현재 ${currentPage}페이지, 전체 ${totalPages}페이지`}
              aria-current="page"
            >
              {String(currentPage).padStart(2, '0')} / {totalPages}
            </span>
            {currentPage === totalPages ? (
              <span
                className={styles.paginationAction}
                aria-disabled="true"
                aria-label="다음 페이지"
                tabIndex={-1}
              >
                <span aria-hidden="true">→</span>
              </span>
            ) : (
              <Link
                className={styles.paginationAction}
                search={searchForPage(currentPage + 1)}
                to="/__ui-lab"
              >
                <span className="sr-only">다음 페이지</span>
                <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
        ) : (
          <ol className={styles.paginationList}>
            <li>
              {currentPage === 1 ? (
                <span
                  className={styles.paginationAction}
                  aria-disabled="true"
                  aria-label="이전 페이지"
                  tabIndex={-1}
                >
                  <span aria-hidden="true">←</span>
                </span>
              ) : (
                <Link
                  className={styles.paginationAction}
                  search={searchForPage(currentPage - 1)}
                  to="/__ui-lab"
                >
                  <span aria-hidden="true">←</span>
                  <span className="sr-only">이전 페이지</span>
                </Link>
              )}
            </li>

            {pageWindow(currentPage).map((item) => {
              if (typeof item !== 'number') {
                return (
                  <li className={styles.paginationEllipsis} key={item} aria-hidden="true">
                    …
                  </li>
                );
              }

              const isCurrent = item === currentPage;
              return (
                <li key={item}>
                  <Link
                    className={styles.paginationLink}
                    aria-current={isCurrent ? 'page' : undefined}
                    aria-label={`${item}페이지`}
                    data-pagination-page={item}
                    search={searchForPage(item)}
                    to="/__ui-lab"
                  >
                    {variant === 'soft-inset' && isCurrent ? (
                      <motion.span
                        className={styles.paginationIndicator}
                        aria-hidden="true"
                        data-pagination-indicator
                        layoutId="pagination-soft-inset-indicator"
                        transition={
                          reducedMotion
                            ? { duration: 0 }
                            : { type: 'spring', stiffness: 320, damping: 32 }
                        }
                      />
                    ) : null}
                    <span className={styles.paginationNumber}>{String(item).padStart(2, '0')}</span>
                  </Link>
                </li>
              );
            })}

            <li>
              {currentPage === totalPages ? (
                <span
                  className={styles.paginationAction}
                  aria-disabled="true"
                  aria-label="다음 페이지"
                  tabIndex={-1}
                >
                  <span aria-hidden="true">→</span>
                </span>
              ) : (
                <Link
                  className={styles.paginationAction}
                  search={searchForPage(currentPage + 1)}
                  to="/__ui-lab"
                >
                  <span className="sr-only">다음 페이지</span>
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </li>
          </ol>
        )}
      </nav>

      {variant === 'ledger' ? (
        <div className={styles.cursorRow}>
          <div className={styles.cursorPreview} data-cursor-preview>
            <span className={styles.cursorStatus} aria-live="polite">
              {cursorState === 'idle'
                ? '다음 기록 준비'
                : cursorState === 'loading'
                  ? '불러오는 중'
                  : '마지막 기록'}
            </span>
            {cursorState !== 'complete' ? (
              <button
                className={styles.cursorAction}
                aria-label="다음 기록"
                disabled={cursorState === 'loading'}
                onClick={loadCursorPreview}
                type="button"
              >
                {cursorState === 'loading' ? (
                  <span className={styles.cursorSpinner} aria-hidden="true" data-cursor-spinner />
                ) : null}
                {cursorState === 'loading' ? '불러오는 중' : '다음 기록'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
