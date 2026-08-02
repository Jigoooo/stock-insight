import { useId, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

import styles from './feedback.module.css';
import {
  buildDataQualitySummary,
  buildStatusText,
  getAvailabilityTone,
  shouldShowDelayedFeedback,
  type DataQualitySummaryOptions,
  type StatusTextOptions,
} from './status';

import { Effect, PresenceRegion } from '@/shared/ui/motion';

export type StatusBadgeProps = StatusTextOptions & {
  className?: string;
  testId?: string;
};

export type DataQualityPopoverProps = DataQualitySummaryOptions & {
  className?: string;
  placement?: 'above' | 'below';
  testId?: string;
};

export type FeedbackStateProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  testId?: string;
};

export type InlineFeedbackTone = 'pending' | 'error' | 'success';

export type InlineFeedbackState = {
  id?: string;
  key: string;
  message?: string;
  tone?: InlineFeedbackTone;
};

export type InlineFeedbackRegionProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  density?: 'compact' | 'default';
  reserveSpace?: boolean;
  state: InlineFeedbackState;
};

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

function resolveInlineFeedbackTone(state: InlineFeedbackState) {
  if (state.tone) return state.tone;
  if (state.key === 'pending' || state.key === 'error' || state.key === 'success') {
    return state.key;
  }
  return undefined;
}

export function InlineFeedbackRegion({
  className,
  density = 'default',
  reserveSpace = false,
  state,
  ...props
}: InlineFeedbackRegionProps) {
  const tone = resolveInlineFeedbackTone(state);
  const message = state.message ?? '';
  const active = message.length > 0;
  const role = active ? (tone === 'error' ? 'alert' : 'status') : undefined;
  const live = active ? (tone === 'error' ? 'assertive' : 'polite') : undefined;

  return (
    <div
      {...props}
      className={classNames(styles.inlineFeedback, className)}
      data-density={density}
      data-reserve-space={reserveSpace || undefined}
      data-slot="inline-feedback-root"
      data-tone={tone}
    >
      <div
        id={state.id}
        className={styles.inlineFeedbackAnnouncement}
        data-slot="inline-feedback-announcement"
        role={role}
        aria-live={live}
        aria-atomic="true"
      >
        {message}
      </div>
      <PresenceRegion
        className={styles.inlineFeedbackVisual}
        mode="sync"
        presenceKey={state.key}
        present={active}
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        aria-hidden="true"
        data-slot="inline-feedback-visual"
      >
        {message}
      </PresenceRegion>
    </div>
  );
}

export function StatusBadge({ availability, className, label, source, testId }: StatusBadgeProps) {
  return (
    <span
      className={classNames(styles.statusBadge, className)}
      data-availability={availability}
      data-slot="status-badge-root"
      data-source={source}
      data-testid={testId}
      data-tone={getAvailabilityTone(availability)}
    >
      <Effect as="span" className={styles.feedbackInlineVisual} data-slot="feedback-visual" fade>
        <span data-slot="status-badge-label">
          {buildStatusText({ availability, label, source })}
        </span>
      </Effect>
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
  const [open, setOpen] = useState(false);
  const contentId = useId();
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
      data-slot="data-quality-root"
      data-source={source}
      data-testid={testId}
      data-tone={summary.tone}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-controls={contentId} data-slot="data-quality-trigger">
        데이터 품질
      </summary>
      <PresenceRegion
        animate={{ opacity: 1, y: 0 }}
        className={styles.dataQualityContent}
        exit={{ opacity: 0, y: -3 }}
        id={contentId}
        initial={{ opacity: 0, y: -3 }}
        presenceKey="data-quality-content"
        present={open}
        transition={{ duration: 0.16 }}
        data-slot="data-quality-content"
      >
        <b data-slot="data-quality-title">{summary.title}</b>
        <p data-slot="data-quality-description">{summary.summary}</p>
        <dl data-slot="data-quality-metadata">
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
      </PresenceRegion>
    </details>
  );
}

export function EmptyState({ children, className, testId, ...props }: FeedbackStateProps) {
  return (
    <div
      {...props}
      className={classNames(styles.emptyState, className)}
      data-slot="feedback-root"
      data-testid={testId}
      data-tone="empty"
      aria-live="polite"
    >
      <Effect className={styles.feedbackVisual} data-slot="feedback-visual" fade>
        <div className={styles.feedbackContent} data-slot="feedback-content">
          {children}
        </div>
      </Effect>
    </div>
  );
}

export function ErrorState({ children, className, testId, ...props }: FeedbackStateProps) {
  return (
    <div
      {...props}
      className={classNames(styles.errorState, className)}
      data-slot="feedback-root"
      data-testid={testId}
      data-tone="error"
      role="alert"
    >
      <Effect className={styles.feedbackVisual} data-slot="feedback-visual" fade>
        <div className={styles.feedbackContent} data-slot="feedback-content">
          {children}
        </div>
      </Effect>
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
      {...props}
      aria-hidden="true"
      className={classNames(styles.skeleton, className)}
      data-slot="skeleton-root"
      style={{ width, height, ...style }}
    >
      <Effect className={styles.skeletonVisual} data-slot="skeleton-visual" fade />
    </div>
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
