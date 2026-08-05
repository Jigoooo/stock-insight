/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Custom segmented progress and compact status visuals require styled div anatomy. */
import { Database, Layers3 } from 'lucide-react';
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
  announcement?: 'inherit' | 'self';
  children: ReactNode;
  testId?: string;
  variant?: FeedbackStateVariant;
};

export type FeedbackStateVariant =
  | 'default'
  | 'quiet-empty'
  | 'guided-empty'
  | 'inline-empty'
  | 'quiet-alert'
  | 'recovery-panel'
  | 'inline-critical';

export type ProgressVariant = 'hairline-progress' | 'soft-meter' | 'segmented-track';

export type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  value: number;
  variant?: ProgressVariant;
};

export type SpinnerVariant = 'orbit' | 'three-dot' | 'signal-sweep';

export type SpinnerProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  label: string;
  variant?: SpinnerVariant;
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
  variant?: SkeletonVariant;
};

export type SkeletonVariant = 'plain' | 'block-pulse' | 'surface-sweep' | 'staggered-blocks';

export type LoadingStateValue = 'idle' | 'pending' | 'complete';
export type LoadingStateVariant = 'skeleton-first' | 'progress-panel' | 'staged-ledger';

export type LoadingStateProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  action?: ReactNode;
  description: ReactNode;
  state: LoadingStateValue;
  title: ReactNode;
  variant?: LoadingStateVariant;
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

export function Progress({
  'aria-label': ariaLabel,
  className,
  label,
  value,
  variant = 'hairline-progress',
  ...props
}: ProgressProps) {
  const resolvedValue = Math.max(0, Math.min(100, value));
  const segments = [20, 40, 60, 80, 100];

  return (
    <div
      {...props}
      aria-label={ariaLabel ?? `${label} ${resolvedValue}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={resolvedValue}
      className={classNames(styles.progress, className)}
      data-slot="feedback-progress"
      data-variant={variant}
      role="progressbar"
    >
      {variant === 'segmented-track' ? (
        segments.map((segment) => (
          <span
            aria-hidden="true"
            data-complete={resolvedValue >= segment || undefined}
            key={segment}
          />
        ))
      ) : (
        <span
          aria-hidden="true"
          className={styles.progressFill}
          data-motion-indicator
          style={{ width: `${resolvedValue}%` }}
        />
      )}
    </div>
  );
}

export function Spinner({
  'aria-label': ariaLabel,
  className,
  label,
  variant = 'orbit',
  ...props
}: SpinnerProps) {
  return (
    <div
      {...props}
      aria-label={ariaLabel ?? label}
      className={classNames(styles.spinner, className)}
      data-motion-indicator
      data-slot="feedback-spinner"
      data-variant={variant}
      role="status"
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
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

export function EmptyState({
  announcement = 'self',
  children,
  className,
  testId,
  variant = 'default',
  ...props
}: FeedbackStateProps) {
  return (
    <div
      {...props}
      className={classNames(styles.emptyState, className)}
      data-slot="feedback-root"
      data-testid={testId}
      data-tone="empty"
      data-variant={variant}
      aria-live={announcement === 'self' ? 'polite' : undefined}
    >
      <Effect className={styles.feedbackVisual} data-slot="feedback-visual" fade>
        <div className={styles.feedbackContent} data-slot="feedback-content">
          {children}
        </div>
      </Effect>
    </div>
  );
}

export function ErrorState({
  announcement = 'self',
  children,
  className,
  testId,
  variant = 'default',
  ...props
}: FeedbackStateProps) {
  return (
    <div
      {...props}
      className={classNames(styles.errorState, className)}
      data-slot="feedback-root"
      data-testid={testId}
      data-tone="error"
      data-variant={variant}
      role={announcement === 'self' ? 'alert' : undefined}
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
  variant = 'plain',
  width = '100%',
  ...props
}: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden="true"
      className={classNames(styles.skeleton, className)}
      data-slot="skeleton-root"
      data-variant={variant}
      style={{ width, height, ...style }}
    >
      {variant === 'plain' ? (
        <Effect className={styles.skeletonVisual} data-slot="skeleton-visual" fade />
      ) : (
        <div
          className={styles.skeletonPattern}
          data-motion-indicator
          data-skeleton-animation={variant}
        >
          <span data-size="eyebrow" />
          <span data-size="title" />
          <span />
          <span />
          <span data-size="short" />
        </div>
      )}
    </div>
  );
}

export function LoadingState({
  action,
  className,
  description,
  state,
  title,
  variant = 'skeleton-first',
  ...props
}: LoadingStateProps) {
  return (
    <div
      {...props}
      aria-live="polite"
      className={classNames(styles.loadingState, className)}
      data-slot="feedback-loading"
      data-state={state}
      data-variant={variant}
      role="status"
    >
      <LoadingVisual state={state} variant={variant} />
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div className={styles.loadingAction}>{action}</div> : null}
    </div>
  );
}

function LoadingVisual({
  state,
  variant,
}: {
  state: LoadingStateValue;
  variant: LoadingStateVariant;
}) {
  if (variant === 'skeleton-first') {
    return (
      <div aria-hidden="true" className={styles.loadingSkeleton} data-motion-indicator>
        <span />
        <span />
        <span />
      </div>
    );
  }

  if (variant === 'progress-panel') {
    return (
      <div aria-hidden="true" className={styles.loadingProgress} data-motion-indicator>
        <Database />
        <span>
          <i data-complete={state === 'complete' || undefined} />
        </span>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className={styles.loadingLedger} data-motion-indicator>
      <Layers3 />
      <span data-active={state !== 'idle' || undefined}>출처 수집</span>
      <span data-active={state === 'complete' || undefined}>영향 연결</span>
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
