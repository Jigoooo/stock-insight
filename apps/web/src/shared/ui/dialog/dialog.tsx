'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ComponentProps, HTMLAttributes } from 'react';

import styles from './dialog.module.css';

import { getStrictContext } from '@/shared/lib/get-strict-context';
import { useControlledState } from '@/shared/lib/use-controlled-state';
import { cn } from '@/shared/lib/utils';
import { Button, type ButtonProps } from '@/shared/ui/button';

export type DialogSize = 'sm' | 'md' | 'lg';
export type DialogComposition = 'form' | 'detail' | 'decision';
export type DialogActionTone = 'secondary' | 'primary' | 'danger';

type DialogContextValue = {
  open: boolean;
};

const [DialogProvider, useDialogContext] = getStrictContext<DialogContextValue>('DialogContext');

export const dialogTransition = {
  type: 'spring',
  stiffness: 150,
  damping: 25,
} as const;

export type DialogProps = ComponentProps<typeof DialogPrimitive.Root>;

export function Dialog({ defaultOpen, onOpenChange, open, ...props }: DialogProps) {
  const [resolvedOpen, setResolvedOpen] = useControlledState({
    value: open,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  return (
    <DialogProvider value={{ open: resolvedOpen }}>
      <DialogPrimitive.Root {...props} open={resolvedOpen} onOpenChange={setResolvedOpen} />
    </DialogProvider>
  );
}

export type DialogTriggerProps = ComponentProps<typeof DialogPrimitive.Trigger>;

export function DialogTrigger(props: DialogTriggerProps) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

export type DialogCloseProps = ComponentProps<typeof DialogPrimitive.Close>;

export function DialogClose(props: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close-control" {...props} />;
}

export type DialogContentProps = Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  'asChild' | 'forceMount'
> & {
  composition?: DialogComposition;
  showClose?: boolean;
  size?: DialogSize;
};

export function DialogContent({
  children,
  className,
  composition = 'detail',
  showClose = true,
  size = 'md',
  ...props
}: DialogContentProps) {
  const { open } = useDialogContext();
  const reducedMotion = useReducedMotion();
  const initial = reducedMotion ? false : { x: 72, opacity: 0 };
  const exit = reducedMotion ? { opacity: 0 } : { x: 48, opacity: 0 };

  return (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Portal forceMount>
          <DialogPrimitive.Overlay className={styles.overlay} data-slot="dialog-overlay" />
          <DialogPrimitive.Content asChild forceMount {...props}>
            <motion.div
              animate={{ x: 0, opacity: 1 }}
              className={cn(styles.content, className)}
              data-composition={composition}
              data-motion-owner="motion"
              data-size={size}
              data-slot="dialog-content"
              exit={exit}
              initial={initial}
              transition={dialogTransition}
            >
              {children}
              {showClose ? (
                <DialogPrimitive.Close className={styles.close} data-slot="dialog-close">
                  <X aria-hidden="true" />
                  <span className={styles.srOnly}>닫기</span>
                </DialogPrimitive.Close>
              ) : null}
            </motion.div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.header, className)} data-slot="dialog-header" {...props} />;
}

export type DialogTitleProps = ComponentProps<typeof DialogPrimitive.Title>;

export function DialogTitle({ className, ...props }: DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn(styles.title, className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

export type DialogDescriptionProps = ComponentProps<typeof DialogPrimitive.Description>;

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description
      className={cn(styles.description, className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export function DialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.body, className)} data-slot="dialog-body" {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.footer, className)} data-slot="dialog-footer" {...props} />;
}

export type DialogActionProps = ButtonProps & {
  tone?: DialogActionTone;
};

export function DialogAction({ tone = 'secondary', variant, ...props }: DialogActionProps) {
  const resolvedVariant =
    variant ?? (tone === 'danger' ? 'danger' : tone === 'primary' ? 'primary' : 'secondary');

  return <Button {...props} data-slot="dialog-action" data-tone={tone} variant={resolvedVariant} />;
}
