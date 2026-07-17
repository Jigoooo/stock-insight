import { gsap } from 'gsap';
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Toaster, toast } from 'sonner';

import styles from './motion-toast.module.css';

import {
  readProfileMotionNumber,
  readProfileMotionSeconds,
  readProfileMotionValue,
} from '@/shared/ui/motion/profile-motion';

type ToastTone = 'default' | 'success' | 'info' | 'warning' | 'error' | 'loading';

type NotifyOptions = {
  action?: {
    label: string;
    onClick: () => void;
  };
  description?: ReactNode;
  duration?: number;
};

type MotionToastProps = NotifyOptions & {
  id: number | string;
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

const sonnerOuterDuration = 2_147_000_000;

function reduceMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function MotionToast({ action, description, duration = 4600, id, title, tone }: MotionToastProps) {
  const elementRef = useRef<HTMLElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const remainingRef = useRef(duration);
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    const element = elementRef.current;
    if (!element || reduceMotion()) {
      toast.dismiss(id);
      return;
    }
    gsap.to(element, {
      opacity: 0,
      y: readProfileMotionNumber('--motion-toast-exit-y'),
      scale: readProfileMotionNumber('--motion-toast-exit-scale'),
      duration: readProfileMotionSeconds('--motion-toast-exit-duration'),
      ease: readProfileMotionValue('--motion-toast-exit-ease'),
      overwrite: 'auto',
      onComplete: () => toast.dismiss(id),
    });
  }, [id]);

  const resumeTimer = useCallback(() => {
    if (!Number.isFinite(remainingRef.current) || closingRef.current) return;
    startedAtRef.current = performance.now();
    timerRef.current = setTimeout(close, remainingRef.current);
  }, [close]);

  const pauseTimer = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(
      0,
      remainingRef.current - (performance.now() - startedAtRef.current),
    );
  }, []);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (reduceMotion()) {
      gsap.fromTo(
        element,
        { opacity: readProfileMotionNumber('--motion-toast-reduced-opacity') },
        {
          opacity: 1,
          duration: readProfileMotionSeconds('--motion-toast-reduced-duration'),
          ease: readProfileMotionValue('--motion-toast-reduced-ease'),
        },
      );
      return;
    }
    gsap.fromTo(
      element,
      {
        opacity: 0,
        y: readProfileMotionNumber('--motion-toast-enter-y'),
        scale: readProfileMotionNumber('--motion-toast-enter-scale'),
      },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: readProfileMotionSeconds('--motion-toast-enter-duration'),
        ease: readProfileMotionValue('--motion-toast-enter-ease'),
        clearProps: 'transform,opacity',
      },
    );
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (tone !== 'loading') resumeTimer();
    const onVisibilityChange = () => {
      if (document.hidden) pauseTimer();
      else resumeTimer();
    };
    const onDismiss = (event: Event) => {
      const detail = (event as CustomEvent<number | string | undefined>).detail;
      if (detail === undefined || String(detail) === String(id)) close();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('app-toast-dismiss', onDismiss);
    element?.addEventListener('mouseenter', pauseTimer);
    element?.addEventListener('mouseleave', resumeTimer);
    return () => {
      pauseTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('app-toast-dismiss', onDismiss);
      element?.removeEventListener('mouseenter', pauseTimer);
      element?.removeEventListener('mouseleave', resumeTimer);
      if (element) gsap.killTweensOf(element);
    };
  }, [close, id, pauseTimer, resumeTimer, tone]);

  return (
    <article
      ref={elementRef}
      className={styles.motionToast}
      data-tone={tone}
      data-toast-id={String(id)}
      aria-label={toneLabels[tone]}
    >
      <span className={styles.toneRail} aria-hidden="true" />
      <div className={styles.toastBody}>
        <span className={styles.toastEyebrow}>{toneLabels[tone]}</span>
        <strong className={styles.toastTitle}>{title}</strong>
        {description ? <p className={styles.toastDescription}>{description}</p> : null}
        {action ? (
          <button
            className={styles.toastAction}
            data-motion="pressable"
            type="button"
            onClick={() => {
              action.onClick();
              close();
            }}
          >
            {action.label}
          </button>
        ) : null}
      </div>
      <button
        className={styles.toastClose}
        data-motion="pressable"
        type="button"
        onClick={close}
        aria-label="알림 닫기"
      >
        닫기
      </button>
    </article>
  );
}

function createToast(tone: ToastTone, title: ReactNode, options: NotifyOptions = {}) {
  return toast.custom((id) => <MotionToast id={id} title={title} tone={tone} {...options} />, {
    duration: sonnerOuterDuration,
    unstyled: true,
  });
}

function dismiss(id?: number | string) {
  if (typeof window === 'undefined') return toast.dismiss(id);
  window.dispatchEvent(new CustomEvent('app-toast-dismiss', { detail: id }));
  return id ?? 'all';
}

export const notify = {
  message: (title: ReactNode, options?: NotifyOptions) => createToast('default', title, options),
  success: (title: ReactNode, options?: NotifyOptions) => createToast('success', title, options),
  info: (title: ReactNode, options?: NotifyOptions) => createToast('info', title, options),
  warning: (title: ReactNode, options?: NotifyOptions) => createToast('warning', title, options),
  error: (title: ReactNode, options?: NotifyOptions) => createToast('error', title, options),
  loading: (title: ReactNode, options?: Omit<NotifyOptions, 'duration'>) =>
    createToast('loading', title, { ...options, duration: Number.POSITIVE_INFINITY }),
  dismiss,
};

export function AppToaster() {
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
      toastOptions={{ unstyled: true, duration: sonnerOuterDuration }}
      visibleToasts={4}
    />
  );
}
