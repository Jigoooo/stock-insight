import { useEffect, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';

import styles from './toast.module.css';
import { AppToast } from './app-toast';
import {
  createToastId,
  type ActionToastOptions,
  type NotifyOptions,
  type ProgressToastController,
  type ProgressToastOptions,
  type ToastKind,
  type ToastTone,
} from './toast-controller';

const statusDuration = 4600;
const persistentDuration = Number.POSITIVE_INFINITY;

type RenderToastOptions = NotifyOptions & {
  id?: string | number;
  kind: ToastKind;
  title: ReactNode;
  tone: ToastTone;
};

function renderToast({
  action,
  description,
  duration,
  id = createToastId(),
  kind,
  retry,
  title,
  tone,
}: RenderToastOptions) {
  const resolvedDuration =
    duration ?? (kind === 'status' || kind === 'action' ? statusDuration : persistentDuration);

  toast.custom(
    () => (
      <AppToast
        action={action}
        description={description}
        id={id}
        kind={kind}
        retry={retry}
        title={title}
        tone={tone}
        onDismiss={() => toast.dismiss(id)}
      />
    ),
    {
      id,
      duration: resolvedDuration,
      unstyled: true,
    },
  );

  return id;
}

function createStatusToast(tone: ToastTone, title: ReactNode, options: NotifyOptions = {}) {
  return renderToast({ kind: tone === 'error' ? 'critical' : 'status', title, tone, ...options });
}

function createProgressToast(
  title: ReactNode,
  options: ProgressToastOptions = {},
): ProgressToastController {
  const id = createToastId();
  renderToast({ ...options, id, kind: 'progress', title, tone: 'loading' });

  return {
    id,
    success: (nextTitle, description) => {
      renderToast({
        id,
        kind: 'status',
        title: nextTitle,
        tone: 'success',
        description,
        duration: statusDuration,
      });
    },
    error: (nextTitle, description) => {
      renderToast({
        id,
        kind: 'critical',
        title: nextTitle,
        tone: 'error',
        description,
        duration: persistentDuration,
      });
    },
    dismiss: () => toast.dismiss(id),
  };
}

function dismiss(id?: number | string) {
  toast.dismiss(id);
  return id ?? 'all';
}

export const notify = {
  message: (title: ReactNode, options?: NotifyOptions) =>
    createStatusToast('default', title, options),
  success: (title: ReactNode, options?: NotifyOptions) =>
    createStatusToast('success', title, options),
  info: (title: ReactNode, options?: NotifyOptions) => createStatusToast('info', title, options),
  warning: (title: ReactNode, options?: NotifyOptions) =>
    createStatusToast('warning', title, options),
  error: (title: ReactNode, options?: NotifyOptions) => createStatusToast('error', title, options),
  loading: (title: ReactNode, options?: Omit<NotifyOptions, 'duration'>) =>
    renderToast({ ...options, kind: 'progress', title, tone: 'loading' }),
  action: (title: ReactNode, options: ActionToastOptions) =>
    renderToast({ ...options, kind: 'action', title, tone: 'default' }),
  progress: createProgressToast,
  dismiss,
};

export function AppToaster() {
  useEffect(() => {
    window.__stockInsightToastReady = true;
    window.dispatchEvent(new Event('app-toast-ready'));
    return () => {
      window.__stockInsightToastReady = false;
    };
  }, []);

  return (
    <Toaster
      className={styles.toastViewport}
      closeButton={false}
      containerAriaLabel="알림"
      expand
      gap={10}
      mobileOffset={16}
      offset={20}
      position="top-right"
      swipeDirections={['right', 'top']}
      theme="system"
      toastOptions={{ unstyled: true }}
      visibleToasts={4}
    />
  );
}

declare global {
  interface Window {
    __stockInsightToastReady?: boolean;
  }
}
