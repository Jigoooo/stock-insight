import type { AnchorHTMLAttributes, ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

import styles from './primitives.module.css';

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'muted';
};

export function TextLink({ children, className, tone = 'default', ...props }: TextLinkProps) {
  return (
    <a
      className={classNames(styles.textLink, className)}
      data-tone={tone}
      {...props}
      data-motion="pressable"
    >
      {children}
    </a>
  );
}

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'onChange'> & {
  checked: boolean;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  className,
  disabled,
  label,
  onCheckedChange,
  onClick,
  type = 'button',
  ...props
}: SwitchProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onCheckedChange(!checked);
  };

  return (
    <button
      aria-checked={checked}
      className={classNames(styles.switchControl, className)}
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      role="switch"
      type={type}
      {...props}
      data-motion="switch"
      onClick={handleClick}
    >
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.controlLabel}>{label}</span>
    </button>
  );
}

type ToggleProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> & {
  children: ReactNode;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
};

export function Toggle({
  children,
  className,
  onClick,
  onPressedChange,
  pressed,
  type = 'button',
  ...props
}: ToggleProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onPressedChange(!pressed);
  };

  return (
    <button
      aria-pressed={pressed}
      className={classNames(styles.toggleControl, className)}
      data-state={pressed ? 'on' : 'off'}
      type={type}
      {...props}
      data-motion="toggle"
      onClick={handleClick}
    >
      {children}
    </button>
  );
}
