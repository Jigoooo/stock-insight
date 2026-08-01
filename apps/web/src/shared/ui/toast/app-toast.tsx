'use client';

import { Bell, CircleCheck, CircleX, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type {
  ToastActionOptions,
  ToastKind,
  ToastRetryOptions,
  ToastTone,
} from './toast-controller';
import styles from './toast.module.css';

import { Button, IconButton } from '@/shared/ui/button';

type RetryState = 'idle' | 'pending' | 'success' | 'error';

export type AppToastProps = {
  action?: ToastActionOptions;
  description?: ReactNode;
  id: string | number;
  kind: ToastKind;
  onDismiss: () => void;
  retry?: ToastRetryOptions;
  title: ReactNode;
  tone: ToastTone;
};

const toneLabels: Record<ToastTone, string> = {
  default: '알림',
  success: '완료',
  info: '안내',
  warning: '주의',
  error: '오류',
  loading: '진행 중',
};

function ToastIcon({ tone }: { tone: ToastTone }) {
  const Icon =
    tone === 'success'
      ? CircleCheck
      : tone === 'info'
        ? Info
        : tone === 'warning'
          ? TriangleAlert
          : tone === 'error'
            ? CircleX
            : tone === 'loading'
              ? LoaderCircle
              : Bell;

  return (
    <span className={styles.icon} data-slot="toast-icon" data-tone={tone} aria-hidden="true">
      <Icon className={tone === 'loading' ? styles.spinner : undefined} />
    </span>
  );
}

export function AppToast({
  action,
  description,
  id,
  kind,
  onDismiss,
  retry,
  title,
  tone,
}: AppToastProps) {
  const [retryState, setRetryState] = useState<RetryState>('idle');
  const [retryMessage, setRetryMessage] = useState<ReactNode>();
  const resolvedTone =
    retryState === 'success' ? 'success' : retryState === 'error' ? 'error' : tone;
  const resolvedTitle =
    retryState === 'success'
      ? (retry?.successTitle ?? title)
      : retryState === 'error'
        ? (retry?.errorTitle ?? title)
        : title;
  const resolvedDescription =
    retryState === 'success'
      ? (retry?.successDescription ?? description)
      : (retryMessage ?? description);

  const runRetry = async () => {
    if (!retry || retryState === 'pending') return;
    setRetryState('pending');
    setRetryMessage(undefined);
    try {
      await retry.onRetry();
      setRetryState('success');
    } catch (error) {
      setRetryState('error');
      setRetryMessage(error instanceof Error ? error.message : '다시 시도하지 못했습니다.');
    }
  };

  return (
    <article
      aria-label={toneLabels[resolvedTone]}
      className={styles.toast}
      data-kind={kind}
      data-retry-state={retry ? retryState : undefined}
      data-slot="toast-root"
      data-toast-id={String(id)}
      data-tone={resolvedTone}
      role={kind === 'critical' ? 'alert' : 'status'}
    >
      <ToastIcon tone={retryState === 'pending' ? 'loading' : resolvedTone} />
      <div className={styles.content} data-slot="toast-content">
        <span className={styles.status} data-slot="toast-status">
          {toneLabels[retryState === 'pending' ? 'loading' : resolvedTone]}
        </span>
        <strong className={styles.title} data-slot="toast-title">
          {resolvedTitle}
        </strong>
        {resolvedDescription ? (
          <p className={styles.description} data-slot="toast-description">
            {resolvedDescription}
          </p>
        ) : null}
      </div>

      {action ? (
        <Button
          className={styles.action}
          data-slot="toast-action"
          motion="quiet"
          size="sm"
          variant="outline"
          onClick={() => {
            action.onClick();
            onDismiss();
          }}
        >
          {action.label}
        </Button>
      ) : null}

      {retry ? (
        <Button
          className={styles.action}
          data-slot="toast-action"
          disabled={retryState === 'success'}
          motion="quiet"
          pending={retryState === 'pending'}
          pendingLabel={retry.pendingLabel ?? '다시 시도 중'}
          size="sm"
          variant={retryState === 'error' ? 'danger' : 'outline'}
          onClick={runRetry}
        >
          {retryState === 'success' ? '완료' : (retry.label ?? '다시 시도')}
        </Button>
      ) : null}

      <IconButton
        aria-label="알림 닫기"
        className={styles.close}
        data-slot="toast-close"
        motion="quiet"
        variant="ghost"
        onClick={onDismiss}
      >
        <X aria-hidden="true" />
      </IconButton>
    </article>
  );
}

export type { ToastKind };
