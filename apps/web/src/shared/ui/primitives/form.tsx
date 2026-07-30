import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import {
  cloneElement,
  Fragment,
  isValidElement,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactElement,
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
  description?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  label?: ReactNode;
};

type FieldControlProps = {
  'aria-describedby'?: string;
  'aria-errormessage'?: string;
  'aria-invalid'?: boolean | 'false' | 'true';
  id?: string;
  type?: string;
};

const fieldControlMarker = Symbol('field-control');
const intrinsicFieldControls = new Set([
  'button',
  'input',
  'meter',
  'output',
  'progress',
  'select',
  'textarea',
]);

type ExplicitFieldControl = {
  [fieldControlMarker]?: true;
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

function joinIdRefs(...values: Array<string | undefined>) {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return [...new Set(ids)].join(' ') || undefined;
}

function isDirectFieldControl(children: ReactNode): children is ReactElement<FieldControlProps> {
  if (!isValidElement<FieldControlProps>(children) || children.type === Fragment) return false;
  if (typeof children.type === 'string') {
    return (
      intrinsicFieldControls.has(children.type) &&
      !(children.type === 'input' && children.props.type === 'hidden')
    );
  }
  return (children.type as ExplicitFieldControl)[fieldControlMarker] === true;
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

export function Field({ children, description, error, hint, label }: FieldProps) {
  const generatedId = useId();
  const supportingDescription = description ?? hint;
  const control = isDirectFieldControl(children) ? children : null;
  const controlId = control?.props.id ?? `${generatedId}-control`;
  const descriptionId = supportingDescription ? `${controlId}-description` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const connectedChildren = control
    ? cloneElement(control, {
        'aria-describedby': joinIdRefs(control.props['aria-describedby'], descriptionId),
        'aria-errormessage': joinIdRefs(control.props['aria-errormessage'], errorId),
        'aria-invalid': error ? true : control.props['aria-invalid'],
        id: controlId,
      })
    : children;

  return (
    <label
      className={styles.field}
      data-invalid={Boolean(error) || undefined}
      data-slot="field-root"
      htmlFor={control ? controlId : undefined}
    >
      {label ? (
        <span className={styles.fieldLabel} data-slot="field-label">
          {label}
        </span>
      ) : null}
      {connectedChildren}
      {supportingDescription ? (
        <span id={descriptionId} className={styles.fieldHint} data-slot="field-description">
          {supportingDescription}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.fieldError} data-slot="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function TextInput({ className, variant = 'chrome', ...props }: TextInputProps) {
  return (
    <input
      className={classNames(styles.textInput, className)}
      data-slot="text-input-control"
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
}

export function Textarea({ className, variant = 'chrome', ...props }: TextareaProps) {
  return (
    <textarea
      className={classNames(styles.textarea, className)}
      data-slot="textarea-control"
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
}

(TextInput as typeof TextInput & ExplicitFieldControl)[fieldControlMarker] = true;
(Textarea as typeof Textarea & ExplicitFieldControl)[fieldControlMarker] = true;

export function SearchField({ className, icon, inputProps }: SearchFieldProps) {
  const shellRef = useFieldShellMotion<HTMLLabelElement>();

  return (
    <label
      ref={shellRef}
      className={classNames(styles.searchField, className)}
      data-motion="field-shell"
      data-slot="search-field-root"
    >
      <FieldMotionHalo />
      <span className={styles.searchFieldIndicator} data-slot="search-field-indicator">
        {icon}
      </span>
      <TextInput variant="bare" {...inputProps} />
    </label>
  );
}
