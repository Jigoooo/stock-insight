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
export type DialogPresentation = 'modal' | 'inspector' | 'bottom-sheet';
export type DialogMotionPreset = 'default' | 'quick';
export type DialogOverlayTone = 'default' | 'light';

type DialogContextValue = {
  open: boolean;
};

const [DialogProvider, useDialogContext] = getStrictContext<DialogContextValue>('DialogContext');

export const dialogTransition = {
  type: 'spring',
  stiffness: 150,
  damping: 25,
} as const;

export const dialogQuickTransition = {
  type: 'spring',
  stiffness: 340,
  damping: 34,
  mass: 0.72,
} as const;

export const dialogExitTransition = { duration: 0.08, ease: 'easeIn' } as const;
export const dialogOverlayTransition = { duration: 0.1, ease: 'easeOut' } as const;

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
  closeLabel?: string;
  composition?: DialogComposition;
  motionPreset?: DialogMotionPreset;
  overlayTone?: DialogOverlayTone;
  portalled?: boolean;
  presentation?: DialogPresentation;
  showClose?: boolean;
  showOverlay?: boolean;
  size?: DialogSize;
};

export function DialogContent({
  children,
  className,
  closeLabel = '닫기',
  composition = 'detail',
  motionPreset = 'default',
  overlayTone = 'default',
  portalled = true,
  presentation = 'modal',
  showClose = true,
  showOverlay = true,
  size = 'md',
  ...props
}: DialogContentProps) {
  const { open } = useDialogContext();
  const reducedMotion = useReducedMotion();
  const quickMotion = motionPreset === 'quick';
  const defaultInitial = reducedMotion ? false : { x: 72, opacity: 0 };
  const bottomSheetInitial = reducedMotion ? false : { x: 0, y: 72, opacity: 0 };
  const quickInitial = reducedMotion
    ? false
    : presentation === 'modal'
      ? { x: 0, y: 10, opacity: 0 }
      : presentation === 'bottom-sheet'
        ? { x: 0, y: 36, opacity: 0 }
        : { x: 44, y: 0, opacity: 0 };
  const initial = quickMotion
    ? quickInitial
    : presentation === 'bottom-sheet'
      ? bottomSheetInitial
      : defaultInitial;
  const defaultExit = reducedMotion
    ? { opacity: 0, pointerEvents: 'none' as const, transition: { duration: 0 } }
    : {
        x: 24,
        opacity: 0,
        pointerEvents: 'none' as const,
        transition: dialogExitTransition,
      };
  const bottomSheetExit = reducedMotion
    ? defaultExit
    : {
        x: 0,
        y: 36,
        opacity: 0,
        pointerEvents: 'none' as const,
        transition: dialogExitTransition,
      };
  const quickExit = reducedMotion
    ? defaultExit
    : presentation === 'modal'
      ? {
          x: 0,
          y: 6,
          opacity: 0,
          pointerEvents: 'none' as const,
          transition: dialogExitTransition,
        }
      : presentation === 'bottom-sheet'
        ? {
            x: 0,
            y: 24,
            opacity: 0,
            pointerEvents: 'none' as const,
            transition: dialogExitTransition,
          }
        : {
            x: 16,
            y: 0,
            opacity: 0,
            pointerEvents: 'none' as const,
            transition: dialogExitTransition,
          };
  const exit = quickMotion
    ? quickExit
    : presentation === 'bottom-sheet'
      ? bottomSheetExit
      : defaultExit;
  const transition = quickMotion ? dialogQuickTransition : dialogTransition;

  const content = (
    <DialogPrimitive.Content asChild forceMount {...props}>
      <motion.div
        animate={{ x: 0, y: 0, opacity: 1 }}
        className={cn(styles.content, className)}
        data-composition={composition}
        data-motion-owner="motion"
        data-portalled={portalled}
        data-presentation={presentation}
        data-size={size}
        data-slot="dialog-content"
        exit={exit}
        initial={initial}
        transition={transition}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close className={styles.close} data-slot="dialog-close">
            <X aria-hidden="true" />
            <span className={styles.srOnly}>{closeLabel}</span>
          </DialogPrimitive.Close>
        ) : null}
      </motion.div>
    </DialogPrimitive.Content>
  );

  if (portalled) {
    return (
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            {showOverlay ? (
              <DialogPrimitive.Overlay asChild forceMount>
                <motion.div
                  animate={{ opacity: 1 }}
                  className={styles.overlay}
                  data-motion-owner="motion"
                  data-overlay-tone={overlayTone}
                  data-slot="dialog-overlay"
                  exit={{ opacity: 0, pointerEvents: 'none' }}
                  initial={reducedMotion ? false : { opacity: 0 }}
                  transition={reducedMotion ? { duration: 0 } : dialogOverlayTransition}
                />
              </DialogPrimitive.Overlay>
            ) : null}
            {content}
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    );
  }

  return <AnimatePresence>{open ? content : null}</AnimatePresence>;
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
