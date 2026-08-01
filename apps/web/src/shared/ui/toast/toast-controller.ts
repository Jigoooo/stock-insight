import type { ReactNode } from 'react';

export type ToastKind = 'status' | 'action' | 'progress' | 'critical';
export type ToastTone = 'default' | 'success' | 'info' | 'warning' | 'error' | 'loading';

export type ToastActionOptions = {
  label: string;
  onClick: () => void;
};

export type ToastRetryOptions = {
  errorTitle?: ReactNode;
  label?: string;
  onRetry: () => Promise<void> | void;
  pendingLabel?: string;
  successDescription?: ReactNode;
  successTitle?: ReactNode;
};

export type NotifyOptions = {
  action?: ToastActionOptions;
  description?: ReactNode;
  duration?: number;
  retry?: ToastRetryOptions;
};

export type ActionToastOptions = Omit<NotifyOptions, 'action' | 'retry'> & {
  action: ToastActionOptions;
};

export type ProgressToastOptions = Omit<NotifyOptions, 'action' | 'duration' | 'retry'>;

export type ProgressToastController = {
  id: string | number;
  success: (title: ReactNode, description?: ReactNode) => void;
  error: (title: ReactNode, description?: ReactNode) => void;
  dismiss: () => void;
};

let toastSequence = 0;

export function createToastId() {
  toastSequence += 1;
  return `app-toast-${toastSequence}`;
}
