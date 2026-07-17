import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';
import {
  buildDataQualitySummary,
  buildStatusText,
  getAvailabilityTone,
  shouldShowDelayedFeedback,
  type DataQualitySummaryOptions,
  type StatusTextOptions,
} from './status';

export type StatusBadgeProps = StatusTextOptions & {
  className?: string;
  testId?: string;
};

export type DataQualityPopoverProps = DataQualitySummaryOptions & {
  className?: string;
  placement?: 'above' | 'below';
  testId?: string;
};

export type FeedbackStateProps = {
  children: ReactNode;
  className?: string;
  testId?: string;
};

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function StatusBadge({ availability, className, label, source, testId }: StatusBadgeProps) {
  return (
    <span
      className={classNames(styles.statusBadge, className)}
      data-availability={availability}
      data-source={source}
      data-testid={testId}
      data-tone={getAvailabilityTone(availability)}
      data-motion-enter="status"
    >
      {buildStatusText({ availability, label, source })}
    </span>
  );
}

export function DataQualityPopover({
  availability,
  className,
  label,
  placement = 'below',
  source,
  testId,
  updatedAt,
}: DataQualityPopoverProps) {
  const summary = buildDataQualitySummary({
    availability,
    label,
    source,
    ...(updatedAt ? { updatedAt } : {}),
  });

  return (
    <details
      className={classNames(styles.dataQualityPopover, className)}
      data-availability={availability}
      data-placement={placement}
      data-source={source}
      data-testid={testId}
      data-tone={summary.tone}
    >
      <summary>데이터 품질</summary>
      <div>
        <b>{summary.title}</b>
        <p>{summary.summary}</p>
        <dl>
          <div>
            <dt>원천</dt>
            <dd>{summary.sourceLabel}</dd>
          </div>
          <div>
            <dt>갱신</dt>
            <dd>{summary.freshnessLabel}</dd>
          </div>
          <div>
            <dt>다음 행동</dt>
            <dd>{summary.nextAction}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}

export function EmptyState({ children, className, testId }: FeedbackStateProps) {
  return (
    <div
      className={classNames(styles.emptyState, className)}
      data-testid={testId}
      data-motion-enter="feedback"
    >
      {children}
    </div>
  );
}

export function ErrorState({ children, className, testId }: FeedbackStateProps) {
  return (
    <div
      className={classNames(styles.errorState, className)}
      data-testid={testId}
      data-motion-enter="feedback"
    >
      {children}
    </div>
  );
}

export function Skeleton({
  className,
  height = 16,
  style,
  width = '100%',
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={classNames(styles.skeleton, className)}
      style={{ width, height, ...style }}
      {...props}
      data-motion-loop="skeleton"
    />
  );
}

export function SkeletonLines({ count = 3 }: Readonly<{ count?: number }>) {
  return Array.from({ length: count }, (_, index) => (
    <Skeleton height={12} key={index} width={index === count - 1 ? '62%' : '100%'} />
  ));
}

export function useDelayedFeedbackDecision(active: boolean, elapsedMs: number, delayMs = 300) {
  return shouldShowDelayedFeedback({ active, elapsedMs, delayMs });
}
