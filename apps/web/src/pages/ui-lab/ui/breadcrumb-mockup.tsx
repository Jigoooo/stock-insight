import type { BreadcrumbPreviewId } from './location-navigation-catalog';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  type BreadcrumbVariant as SharedBreadcrumbVariant,
} from '@/shared/ui/breadcrumb';

const breadcrumbItems = [
  { id: 'workspace', label: '워크스페이스' },
  { id: 'stocks', label: '종목' },
  { id: 'nvda', label: 'NVDA' },
  { id: 'evidence', label: '근거 기록' },
] as const;

export type BreadcrumbVariant = SharedBreadcrumbVariant;

export interface BreadcrumbMockupProps {
  active: BreadcrumbPreviewId;
  onSelect: (item: BreadcrumbPreviewId) => void;
  variant: BreadcrumbVariant;
}

export function BreadcrumbMockup({ active, onSelect, variant }: BreadcrumbMockupProps) {
  const activeIndex = breadcrumbItems.findIndex((item) => item.id === active);
  const visibleItems = breadcrumbItems.slice(0, activeIndex + 1);
  const collapsedItems =
    variant === 'ledger' && visibleItems.length > 2
      ? visibleItems.filter((_, index) => index !== 1)
      : visibleItems;
  const hasCollapsedItem = collapsedItems.length !== visibleItems.length;

  return (
    <Breadcrumb
      aria-label={`Breadcrumb 비교 · ${variant}`}
      data-breadcrumb-variant={variant}
      variant={variant}
    >
      <BreadcrumbList>
        {collapsedItems.map((item, index) => {
          const isCurrent = item.id === active;
          const pathItem = (
            <BreadcrumbItem key={item.id}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              {isCurrent ? (
                <BreadcrumbPage>{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <button onClick={() => onSelect(item.id)} type="button">
                    {item.label}
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          );

          if (hasCollapsedItem && index === 1) {
            return [
              <BreadcrumbItem key="collapsed-path">
                <BreadcrumbSeparator />
                <BreadcrumbEllipsis label="중간 경로 1개 생략" />
              </BreadcrumbItem>,
              pathItem,
            ];
          }

          return pathItem;
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
