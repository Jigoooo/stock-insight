'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { useId, useState, type ReactNode } from 'react';

import styles from './split-button.module.css';

import { cn } from '@/shared/lib/utils';
import { Button, type ButtonProps, type ButtonSize } from '@/shared/ui/button';

export type SplitButtonVariant = 'solid' | 'tonal' | 'twin';

export type SplitButtonAction = {
  disabled?: boolean;
  icon?: ReactNode;
  label: ReactNode;
  onSelect?: () => void;
  value: string;
};

export type SplitButtonProps = Omit<ButtonProps, 'children' | 'size' | 'variant'> & {
  actions: readonly SplitButtonAction[];
  children: ReactNode;
  defaultOpen?: boolean;
  disableMenuWhilePending?: boolean;
  menuAlign?: 'start' | 'center' | 'end';
  menuDisabled?: boolean;
  menuLabel?: string;
  onActionSelect?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  size?: Exclude<ButtonSize, 'icon'>;
  triggerLabel: string;
  variant?: SplitButtonVariant;
};

export function SplitButton({
  actions,
  children,
  className,
  defaultOpen = false,
  disabled = false,
  disableMenuWhilePending = false,
  menuAlign = 'end',
  menuDisabled = false,
  menuLabel = '대체 액션',
  onActionSelect,
  onOpenChange,
  open,
  pending = false,
  size = 'md',
  triggerLabel,
  variant = 'solid',
  ...primaryProps
}: SplitButtonProps) {
  const menuId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const currentOpen = open ?? uncontrolledOpen;
  const triggerDisabled = disabled || menuDisabled || (pending && disableMenuWhilePending);

  const updateOpen = (nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <DropdownMenuPrimitive.Root modal={false} open={currentOpen} onOpenChange={updateOpen}>
      <div
        className={cn(styles.root, className)}
        data-open={currentOpen || undefined}
        data-slot="split-button"
        data-variant={variant}
      >
        <Button
          {...primaryProps}
          className={styles.primary}
          disabled={disabled}
          pending={pending}
          size={size}
          variant={variant === 'tonal' ? 'secondary' : 'primary'}
        >
          <span className={styles.primaryContent} data-slot="split-button-primary">
            {children}
          </span>
        </Button>

        <DropdownMenuPrimitive.Trigger asChild>
          <Button
            aria-controls={menuId}
            aria-expanded={currentOpen}
            aria-haspopup="menu"
            aria-label={triggerLabel}
            className={styles.trigger}
            disabled={triggerDisabled}
            motion="quiet"
            size="icon"
            variant={variant === 'solid' ? 'primary' : 'secondary'}
          >
            <ChevronDown
              aria-hidden="true"
              className={styles.chevron}
              data-slot="split-button-trigger"
              size={16}
              strokeWidth={1.8}
            />
          </Button>
        </DropdownMenuPrimitive.Trigger>
      </div>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={menuAlign}
          aria-label={menuLabel}
          aria-labelledby={undefined}
          className={styles.menu}
          data-slot="split-button-menu"
          id={menuId}
          sideOffset={6}
        >
          {actions.map((action) => (
            <DropdownMenuPrimitive.Item
              className={styles.menuItem}
              disabled={action.disabled}
              key={action.value}
              onSelect={() => {
                action.onSelect?.();
                onActionSelect?.(action.value);
              }}
            >
              {action.icon ? (
                <span className={styles.menuIcon} aria-hidden="true">
                  {action.icon}
                </span>
              ) : null}
              <span>{action.label}</span>
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
