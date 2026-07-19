import type { ReactNode } from 'react';

export type NotifyOptions = {
  action?: {
    label: string;
    onClick: () => void;
  };
  description?: ReactNode;
  duration?: number;
};

function importToastModule() {
  return import('./motion-toast');
}

let toastModule: ReturnType<typeof importToastModule> | undefined;

function waitForToastHost() {
  if (typeof window === 'undefined' || window.__stockInsightToastReady) return Promise.resolve();
  return new Promise<void>((resolve) => {
    window.addEventListener('app-toast-ready', () => resolve(), { once: true });
  });
}

function activateToastHost() {
  if (typeof window === 'undefined') return;
  window.__stockInsightToastActivated = true;
  window.dispatchEvent(new Event('app-toast-activate'));
}

function loadToastModule() {
  activateToastHost();
  toastModule ??= importToastModule();
  return toastModule;
}

async function withToastModule<Result>(
  action: (module: Awaited<ReturnType<typeof importToastModule>>) => Result,
) {
  const module = await loadToastModule();
  await waitForToastHost();
  return action(module);
}

export const notify = {
  message: (title: ReactNode, options?: NotifyOptions) =>
    withToastModule((module) => module.notify.message(title, options)),
  success: (title: ReactNode, options?: NotifyOptions) =>
    withToastModule((module) => module.notify.success(title, options)),
  info: (title: ReactNode, options?: NotifyOptions) =>
    withToastModule((module) => module.notify.info(title, options)),
  warning: (title: ReactNode, options?: NotifyOptions) =>
    withToastModule((module) => module.notify.warning(title, options)),
  error: (title: ReactNode, options?: NotifyOptions) =>
    withToastModule((module) => module.notify.error(title, options)),
  loading: (title: ReactNode, options?: Omit<NotifyOptions, 'duration'>) =>
    withToastModule((module) => module.notify.loading(title, options)),
  dismiss: (id?: number | string) => withToastModule((module) => module.notify.dismiss(id)),
};

declare global {
  interface Window {
    __stockInsightToastActivated?: boolean;
    __stockInsightToastReady?: boolean;
  }
}
