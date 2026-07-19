import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';

import {
  applyControlStateMotion,
  clearControlStateMotion,
  shouldCommitControlChange,
  type ControlMotionKind,
} from './control-motion-controller';
import styles from './primitives.module.css';
import { readProfileMotionSeconds, readProfileMotionValue } from '../motion/profile-motion';

gsap.registerPlugin(useGSAP);

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

function useControlStateMotion(active: boolean, kind: ControlMotionKind) {
  const targetRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(active);
  const previousActiveRef = useRef(active);
  const runMotionRef = useRef<(nextActive: boolean) => void>(() => undefined);

  useGSAP((_context, contextSafe) => {
    if (!contextSafe) return;
    const target = targetRef.current;
    if (!target) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const adapter = {
      killTweensOf: (target: object) => gsap.killTweensOf(target),
      set: (target: object, vars: object) => {
        gsap.set(target, vars);
      },
      to: (target: object, vars: object) => {
        gsap.to(target, vars);
      },
    };
    const runMotion = contextSafe((nextActive: boolean, reduced = motionPreference.matches) => {
      applyControlStateMotion({
        active: nextActive,
        adapter,
        duration: readProfileMotionSeconds('--duration-fast'),
        ease: readProfileMotionValue('--motion-ease-out'),
        kind,
        reducedMotion: reduced,
        target,
      });
    });
    const onMotionPreferenceChange = contextSafe(() => {
      if (motionPreference.matches) runMotion(activeRef.current, true);
    });

    runMotionRef.current = runMotion;
    runMotion(activeRef.current, true);
    motionPreference.addEventListener('change', onMotionPreferenceChange);

    return () => {
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      runMotionRef.current = () => undefined;
      clearControlStateMotion({ adapter, kind, target });
    };
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (previousActiveRef.current === active) return;
    previousActiveRef.current = active;
    runMotionRef.current(active);
  }, [active]);

  return targetRef;
}

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> & {
  checked: boolean;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
  pending?: boolean;
};

export function Switch({
  checked,
  className,
  disabled,
  label,
  onCheckedChange,
  onClick,
  pending = false,
  type = 'button',
  ...props
}: SwitchProps) {
  const thumbRef = useControlStateMotion(checked, 'switch');
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (
      shouldCommitControlChange({ defaultPrevented: event.defaultPrevented, disabled, pending })
    ) {
      onCheckedChange(!checked);
    }
  };

  return (
    <button
      aria-busy={pending || undefined}
      aria-checked={checked}
      className={classNames(styles.switchControl, className)}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled || pending}
      role="switch"
      type={type}
      {...props}
      data-motion="switch"
      onClick={handleClick}
    >
      <span className={styles.switchTrack} aria-hidden="true">
        <span ref={thumbRef} className={styles.switchThumb} data-switch-motion-thumb />
      </span>
      <span className={styles.controlLabel}>{label}</span>
    </button>
  );
}

type ToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & {
  children: ReactNode;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  pending?: boolean;
};

export function Toggle({
  children,
  className,
  disabled,
  onClick,
  onPressedChange,
  pending = false,
  pressed,
  type = 'button',
  ...props
}: ToggleProps) {
  const railRef = useControlStateMotion(pressed, 'toggle');
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (
      shouldCommitControlChange({ defaultPrevented: event.defaultPrevented, disabled, pending })
    ) {
      onPressedChange(!pressed);
    }
  };

  return (
    <button
      aria-busy={pending || undefined}
      aria-pressed={pressed}
      className={classNames(styles.toggleControl, className)}
      data-state={pressed ? 'on' : 'off'}
      disabled={disabled || pending}
      type={type}
      {...props}
      data-motion="toggle"
      onClick={handleClick}
    >
      <span
        ref={railRef}
        className={styles.toggleRail}
        data-toggle-motion-rail
        aria-hidden="true"
      />
      <span className={styles.controlLabel}>{children}</span>
    </button>
  );
}
