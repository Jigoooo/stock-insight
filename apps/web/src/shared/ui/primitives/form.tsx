import {
  cloneElement,
  forwardRef,
  Fragment,
  isValidElement,
  useId,
  useEffect,
  useRef,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { FieldMotionHalo } from './field-motion-halo';
import styles from './primitives.module.css';
import { createMotionDomAdapter } from '../motion/dom-motion-adapter';
import { readProfileMotionSeconds, readProfileMotionValue } from '../motion/profile-motion';
import { Textarea as CanonicalTextarea } from '@/shared/ui/textarea';

export { FieldMotionHalo } from './field-motion-halo';

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

  useEffect(() => {
    const shell = shellRef.current;
    const halo = shell?.querySelector<HTMLElement>('[data-field-motion-halo]');
    if (!shell || !halo) return;

    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const adapter = createMotionDomAdapter();
    const normalizeHalo = () => {
      adapter.killTweensOf(halo);
      adapter.set(halo, { opacity: shell.matches(':focus-within') ? 1 : 0 });
    };
    const setFocused = (focused: boolean) => {
      adapter.killTweensOf(halo);
      if (motionPreference.matches) {
        adapter.set(halo, { opacity: focused ? 1 : 0 });
        return;
      }
      adapter.to(halo, {
        opacity: focused ? 1 : 0,
        duration: readProfileMotionSeconds('--duration-press'),
        ease: readProfileMotionValue('--motion-ease-out'),
        overwrite: 'auto',
      });
    };
    const onFocusIn = () => setFocused(true);
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && shell.contains(event.relatedTarget)) return;
      setFocused(false);
    };
    const onMotionPreferenceChange = normalizeHalo;

    shell.addEventListener('focusin', onFocusIn);
    shell.addEventListener('focusout', onFocusOut);
    motionPreference.addEventListener('change', onMotionPreferenceChange);
    normalizeHalo();

    return () => {
      shell.removeEventListener('focusin', onFocusIn);
      shell.removeEventListener('focusout', onFocusOut);
      motionPreference.removeEventListener('change', onMotionPreferenceChange);
      adapter.killTweensOf(halo);
      adapter.set(halo, { clearProps: 'opacity' });
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

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, variant = 'chrome', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={classNames(styles.textInput, className)}
      data-slot="text-input-control"
      data-variant={variant === 'bare' ? 'bare' : 'chrome'}
      {...props}
    />
  );
});

export function Textarea({ className, variant = 'chrome', ...props }: TextareaProps) {
  return (
    <CanonicalTextarea
      className={classNames(styles.textarea, className)}
      data-slot="textarea-control"
      variant={variant === 'bare' ? 'plain' : 'plain'}
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
