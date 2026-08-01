import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

import { Button } from '@/shared/ui/button';
export { Switch } from '@/shared/ui/switch';
export type { SwitchProps } from '@/shared/ui/switch';

export type ToggleProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-pressed' | 'children'
> & {
  children: ReactNode;
  onPressedChange: (pressed: boolean) => void;
  pending?: boolean;
  pressed: boolean;
};

export function Toggle({
  children,
  disabled,
  onClick,
  onPressedChange,
  pending = false,
  pressed,
  ...props
}: ToggleProps) {
  const unavailable = disabled || pending;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented && !unavailable) onPressedChange(!pressed);
  };

  return (
    <Button
      {...props}
      aria-busy={pending || undefined}
      aria-pressed={pressed}
      data-motion="toggle"
      data-slot="toggle-control"
      disabled={unavailable}
      variant="secondary"
      onClick={handleClick}
    >
      {children}
    </Button>
  );
}
