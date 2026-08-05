'use client';

import {
  ContextMenu as ContextMenuPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
  Popover as PopoverPrimitive,
} from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import styles from './menu-overlay.module.css';

import { cn } from '@/shared/lib/utils';

export type MenuOverlayVariant = 'hairline' | 'soft-surface';

export type DropdownMenuProps = ComponentProps<typeof DropdownMenuPrimitive.Root>;

export function DropdownMenu({ modal = false, ...props }: DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root modal={modal} {...props} />;
}

export type DropdownMenuTriggerProps = ComponentProps<typeof DropdownMenuPrimitive.Trigger>;

export function DropdownMenuTrigger(props: DropdownMenuTriggerProps) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

export type DropdownMenuContentProps = ComponentProps<typeof DropdownMenuPrimitive.Content> & {
  variant?: MenuOverlayVariant;
};

export function DropdownMenuContent({
  align = 'start',
  className,
  sideOffset = 8,
  variant = 'hairline',
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        {...props}
        align={align}
        className={cn(styles.menuContent, className)}
        data-slot="dropdown-menu-content"
        data-variant={variant}
        sideOffset={sideOffset}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export type DropdownMenuItemProps = ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  shortcut?: ReactNode;
};

export function DropdownMenuItem({
  children,
  className,
  shortcut,
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item className={cn(styles.menuItem, className)} {...props}>
      <span className={styles.itemContent}>{children}</span>
      {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
    </DropdownMenuPrimitive.Item>
  );
}

export type DropdownMenuSeparatorProps = ComponentProps<typeof DropdownMenuPrimitive.Separator>;

export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return <DropdownMenuPrimitive.Separator className={cn(styles.separator, className)} {...props} />;
}

export type ContextMenuProps = ComponentProps<typeof ContextMenuPrimitive.Root>;

export function ContextMenu({ modal = false, ...props }: ContextMenuProps) {
  return <ContextMenuPrimitive.Root modal={modal} {...props} />;
}

export type ContextMenuTriggerProps = ComponentProps<typeof ContextMenuPrimitive.Trigger>;

export function ContextMenuTrigger(props: ContextMenuTriggerProps) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />;
}

export type ContextMenuContentProps = ComponentProps<typeof ContextMenuPrimitive.Content> & {
  variant?: MenuOverlayVariant;
};

export function ContextMenuContent({
  className,
  variant = 'hairline',
  ...props
}: ContextMenuContentProps) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        {...props}
        className={cn(styles.menuContent, className)}
        data-slot="context-menu-content"
        data-variant={variant}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export type ContextMenuItemProps = ComponentProps<typeof ContextMenuPrimitive.Item> & {
  shortcut?: ReactNode;
};

export function ContextMenuItem({ children, className, shortcut, ...props }: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item className={cn(styles.menuItem, className)} {...props}>
      <span className={styles.itemContent}>{children}</span>
      {shortcut ? <kbd className={styles.shortcut}>{shortcut}</kbd> : null}
    </ContextMenuPrimitive.Item>
  );
}

export type ContextMenuSeparatorProps = ComponentProps<typeof ContextMenuPrimitive.Separator>;

export function ContextMenuSeparator({ className, ...props }: ContextMenuSeparatorProps) {
  return <ContextMenuPrimitive.Separator className={cn(styles.separator, className)} {...props} />;
}

export type PopoverProps = ComponentProps<typeof PopoverPrimitive.Root>;

export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

export type PopoverTriggerProps = ComponentProps<typeof PopoverPrimitive.Trigger>;

export function PopoverTrigger(props: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content> & {
  showArrow?: boolean;
  variant?: MenuOverlayVariant;
};

export function PopoverContent({
  align = 'start',
  children,
  className,
  showArrow = true,
  sideOffset = 8,
  variant = 'hairline',
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        {...props}
        align={align}
        className={cn(styles.popoverContent, className)}
        data-slot="popover-content"
        data-variant={variant}
        sideOffset={sideOffset}
      >
        {children}
        {showArrow ? <PopoverPrimitive.Arrow className={styles.popoverArrow} /> : null}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
