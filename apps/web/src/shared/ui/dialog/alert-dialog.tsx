'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import type { ComponentProps, HTMLAttributes } from 'react';

import {
  dialogExitTransition,
  dialogTransition,
  dialogOverlayTransition,
  type DialogActionTone,
  type DialogComposition,
  type DialogSize,
} from './dialog';
import styles from './dialog.module.css';

import { getStrictContext } from '@/shared/lib/get-strict-context';
import { useControlledState } from '@/shared/lib/use-controlled-state';
import { cn } from '@/shared/lib/utils';
import { Button, type ButtonProps } from '@/shared/ui/button';

type AlertDialogContextValue = {
  open: boolean;
};

const [AlertDialogProvider, useAlertDialogContext] =
  getStrictContext<AlertDialogContextValue>('AlertDialogContext');

export type AlertDialogProps = ComponentProps<typeof AlertDialogPrimitive.Root>;

export function AlertDialog({ defaultOpen, onOpenChange, open, ...props }: AlertDialogProps) {
  const [resolvedOpen, setResolvedOpen] = useControlledState({
    value: open,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  return (
    <AlertDialogProvider value={{ open: resolvedOpen }}>
      <AlertDialogPrimitive.Root {...props} open={resolvedOpen} onOpenChange={setResolvedOpen} />
    </AlertDialogProvider>
  );
}

export type AlertDialogTriggerProps = ComponentProps<typeof AlertDialogPrimitive.Trigger>;

export function AlertDialogTrigger(props: AlertDialogTriggerProps) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

export type AlertDialogContentProps = Omit<
  ComponentProps<typeof AlertDialogPrimitive.Content>,
  'asChild' | 'forceMount'
> & {
  composition?: DialogComposition;
  size?: DialogSize;
};

export function AlertDialogContent({
  children,
  className,
  composition = 'decision',
  onEscapeKeyDown,
  size = 'sm',
  ...props
}: AlertDialogContentProps) {
  const { open } = useAlertDialogContext();
  const reducedMotion = useReducedMotion();
  const initial = reducedMotion ? false : { x: 72, opacity: 0 };
  const exit = reducedMotion
    ? { opacity: 0, pointerEvents: 'none' as const, transition: { duration: 0 } }
    : {
        x: 24,
        opacity: 0,
        pointerEvents: 'none' as const,
        transition: dialogExitTransition,
      };

  return (
    <AnimatePresence>
      {open ? (
        <AlertDialogPrimitive.Portal forceMount>
          <AlertDialogPrimitive.Overlay asChild forceMount>
            <motion.div
              animate={{ opacity: 1 }}
              className={styles.overlay}
              data-motion-owner="motion"
              data-slot="dialog-overlay"
              exit={{ opacity: 0, pointerEvents: 'none' }}
              initial={reducedMotion ? false : { opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : dialogOverlayTransition}
            />
          </AlertDialogPrimitive.Overlay>
          <AlertDialogPrimitive.Content
            asChild
            forceMount
            {...props}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              onEscapeKeyDown?.(event);
            }}
          >
            <motion.div
              animate={{ x: 0, opacity: 1 }}
              className={cn(styles.content, className)}
              data-composition={composition}
              data-size={size}
              data-slot="alert-dialog-content"
              exit={exit}
              initial={initial}
              transition={dialogTransition}
            >
              {children}
            </motion.div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function AlertDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.header, className)} data-slot="dialog-header" {...props} />;
}

export type AlertDialogTitleProps = ComponentProps<typeof AlertDialogPrimitive.Title>;

export function AlertDialogTitle({ className, ...props }: AlertDialogTitleProps) {
  return (
    <AlertDialogPrimitive.Title
      className={cn(styles.title, className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

export type AlertDialogDescriptionProps = ComponentProps<typeof AlertDialogPrimitive.Description>;

export function AlertDialogDescription({ className, ...props }: AlertDialogDescriptionProps) {
  return (
    <AlertDialogPrimitive.Description
      className={cn(styles.description, className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export function AlertDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.body, className)} data-slot="dialog-body" {...props} />;
}

export function AlertDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.footer, className)} data-slot="dialog-footer" {...props} />;
}

export type AlertDialogCancelProps = ComponentProps<typeof AlertDialogPrimitive.Cancel> & {
  buttonProps?: Omit<ButtonProps, 'children'>;
};

export function AlertDialogCancel({ buttonProps, children, ...props }: AlertDialogCancelProps) {
  return (
    <AlertDialogPrimitive.Cancel asChild {...props}>
      <Button {...buttonProps} data-slot="dialog-action" data-tone="secondary" variant="secondary">
        {children}
      </Button>
    </AlertDialogPrimitive.Cancel>
  );
}

export type AlertDialogActionProps = ComponentProps<typeof AlertDialogPrimitive.Action> & {
  buttonProps?: Omit<ButtonProps, 'children'>;
  tone?: Exclude<DialogActionTone, 'secondary'>;
};

export function AlertDialogAction({
  buttonProps,
  children,
  tone = 'primary',
  ...props
}: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Action asChild {...props}>
      <Button
        {...buttonProps}
        data-slot="dialog-action"
        data-tone={tone}
        variant={tone === 'danger' ? 'danger' : 'primary'}
      >
        {children}
      </Button>
    </AlertDialogPrimitive.Action>
  );
}
