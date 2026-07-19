import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import {
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { FieldMotionHalo } from './field-motion-halo';
import styles from './primitives.module.css';
import { readProfileMotionSeconds, readProfileMotionValue } from '../motion/profile-motion';

export { FieldMotionHalo } from './field-motion-halo';

gsap.registerPlugin(useGSAP);

type FieldProps = {
  children: ReactNode;
  label?: string;
  hint?: string;
};

type InputVariant = 'chrome' | 'bare';

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  variant?: InputVariant;
};

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: InputVariant;
};

type SearchFieldProps = {
  icon: ReactNode;
  inputProps: InputHTMLAttributes<HTMLInputElement> & {
    'aria-label': string;
    'data-testid'?: string;
  };
  className?: string;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function useFieldShellMotion<ElementType extends HTMLElement>() {
  const shellRef = useRef<ElementType>(null);

  useGSAP((_context, contextSafe) => {
    if (!contextSafe) return;
    const shell = shellRef.current;
    const halo = shell?.querySelector<HTMLElement>('[data-field-motion-halo]');
    if (!shell || !halo) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const normalizeHalo = () => {
      gsap.killTweensOf(halo);
      gsap.set(halo, { opacity: shell.matches(':focus-within') ? 1 : 0 });
    };
    const setFocused = (focused: boolean) => {
      gsap.killTweensOf(halo);
      if (motionPreference.matches) {
        gsap.set(halo, { opacity: focused ? 1 : 0 });
        return;
      }
      gsap.to(halo, {
        opacity: focused ? 1 : 0,
        duration: readProfileMotionSeconds('--duration-press'),
        ease: readProfileMotionValue('--motion-ease-out'),
        overwrite: 'auto',
      });
    };
    const onFocusIn = contextSafe(() => setFocused(true));
    const onFocusOut = contextSafe((event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && shell.contains(event.relatedTarget)) return;
      setFocused(false);
    });
    const onMotionPreferenceChange = contextSafe(normalizeHalo);

    shell.addEventListener('focusin', onFocusIn);
    shell.addEventListener('focusout', onFocusOut);
    motionPreference.addEventListener('change', onMotionPreferenceChange);
    normalizeHalo();

    return () => {
      shell.removeEventListener('focusin', onFocusIn);
      shell.removeEventListener('focusout', onFocusOut);
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      gsap.killTweensOf(halo);
      gsap.set(halo, { clearProps: 'opacity' });
    };
  }, []);

  return shellRef;
}

export function Field({ children, hint, label }: FieldProps) {
  return (
    <label className={styles.field}>
      {label ? <span className={styles.fieldLabel}>{label}</span> : null}
      {children}
      {hint ? <span className={styles.fieldHint}>{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, variant = 'chrome', ...props }: TextInputProps) {
  return (
    <input
      className={classNames(styles.textInput, className)}
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
}

export function Textarea({ className, variant = 'chrome', ...props }: TextareaProps) {
  return (
    <textarea
      className={classNames(styles.textarea, className)}
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
}

export function SearchField({ className, icon, inputProps }: SearchFieldProps) {
  const shellRef = useFieldShellMotion<HTMLLabelElement>();

  return (
    <label
      ref={shellRef}
      className={classNames(styles.searchField, className)}
      data-motion="field-shell"
    >
      <FieldMotionHalo />
      {icon}
      <TextInput variant="bare" {...inputProps} />
    </label>
  );
}
