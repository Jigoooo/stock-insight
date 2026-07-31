import { AlertCircle, CircleDot, CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Skeleton } from '@/shared/ui/skeleton';

export type WorkspaceStateKind =
  | 'loading'
  | 'empty'
  | 'error'
  | 'stale'
  | 'partial'
  | 'unavailable';

const liveMode: Record<WorkspaceStateKind, 'off' | 'polite' | 'assertive'> = {
  loading: 'polite',
  empty: 'off',
  error: 'assertive',
  stale: 'polite',
  partial: 'polite',
  unavailable: 'polite',
};

const visual = {
  empty: CircleDot,
  error: AlertCircle,
  loading: LoaderCircle,
  partial: TriangleAlert,
  stale: TriangleAlert,
  unavailable: CloudOff,
} satisfies Record<WorkspaceStateKind, typeof CircleDot>;

export function WorkspaceState({
  action,
  className,
  delayMs = 300,
  description,
  kind,
  title,
}: Readonly<{
  action?: ReactNode;
  className?: string;
  delayMs?: number;
  description: string;
  kind: WorkspaceStateKind;
  title: string;
}>) {
  if (kind === 'loading' && delayMs > 0) {
    return (
      <DelayedLoadingState
        action={action}
        className={className}
        delayMs={delayMs}
        description={description}
        title={title}
      />
    );
  }

  return (
    <WorkspaceStateSurface
      action={action}
      className={className}
      description={description}
      kind={kind}
      title={title}
    />
  );
}

function DelayedLoadingState({
  action,
  className,
  delayMs,
  description,
  title,
}: Readonly<{
  action?: ReactNode;
  className?: string;
  delayMs: number;
  description: string;
  title: string;
}>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs]);
  return visible ? (
    <WorkspaceStateSurface
      action={action}
      className={className}
      description={description}
      kind="loading"
      title={title}
    />
  ) : null;
}

function WorkspaceStateSurface({
  action,
  className,
  description,
  kind,
  title,
}: Readonly<{
  action?: ReactNode;
  className?: string;
  description: string;
  kind: WorkspaceStateKind;
  title: string;
}>) {
  const Visual = visual[kind];
  return (
    <ScrollArea className={styles.stateScrollArea}>
      <div
        className={cn(styles.stateSurface, className)}
        data-kind={kind}
        role={kind === 'error' ? 'alert' : 'status'}
        aria-atomic="true"
        aria-live={liveMode[kind]}
      >
        <div className={styles.stateVisual} aria-hidden="true">
          {kind === 'loading' ? <Skeleton className={styles.stateIconSkeleton} /> : <Visual />}
        </div>
        <div className={styles.stateContent}>
          <strong>{title}</strong>
          <p>{description}</p>
          {action ? <div className={styles.stateAction}>{action}</div> : null}
        </div>
      </div>
    </ScrollArea>
  );
}
