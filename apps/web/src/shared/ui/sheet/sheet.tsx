'use client';

import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import type { ComponentProps, HTMLAttributes } from 'react';

import styles from './sheet.module.css';

import { getStrictContext } from '@/shared/lib/get-strict-context';
import { useControlledState } from '@/shared/lib/use-controlled-state';
import { cn } from '@/shared/lib/utils';
import type { MenuOverlayVariant } from '@/shared/ui/menu-overlay';

type SheetSide = 'top' | 'bottom' | 'left' | 'right';
type SheetContextValue = { open: boolean };

const [SheetProvider, useSheetContext] = getStrictContext<SheetContextValue>('SheetContext');

export type SheetProps = ComponentProps<typeof SheetPrimitive.Root>;

export function Sheet({ defaultOpen, onOpenChange, open, ...props }: SheetProps) {
  const [resolvedOpen, setResolvedOpen] = useControlledState({
    value: open,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  return (
    <SheetProvider value={{ open: resolvedOpen }}>
      <SheetPrimitive.Root {...props} open={resolvedOpen} onOpenChange={setResolvedOpen} />
    </SheetProvider>
  );
}

export type SheetTriggerProps = ComponentProps<typeof SheetPrimitive.Trigger>;
export function SheetTrigger(props: SheetTriggerProps) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export type SheetCloseProps = ComponentProps<typeof SheetPrimitive.Close>;
export function SheetClose(props: SheetCloseProps) {
  return <SheetPrimitive.Close data-slot="sheet-close-control" {...props} />;
}

export type SheetContentProps = Omit<
  ComponentProps<typeof SheetPrimitive.Content>,
  'asChild' | 'forceMount'
> & {
  showCloseButton?: boolean;
  side?: SheetSide;
  transition?: Transition;
  variant?: MenuOverlayVariant;
};

const offscreenBySide: Record<SheetSide, { x?: string; y?: string; opacity: number }> = {
  right: { x: '100%', opacity: 0 },
  left: { x: '-100%', opacity: 0 },
  top: { y: '-100%', opacity: 0 },
  bottom: { y: '100%', opacity: 0 },
};

const sheetExitTransition = { duration: 0.08, ease: 'easeIn' } as const;
const sheetOverlayTransition = { duration: 0.1, ease: 'easeOut' } as const;

export function SheetContent({
  children,
  className,
  showCloseButton = true,
  side = 'right',
  transition = { type: 'spring', stiffness: 180, damping: 28 },
  variant,
  ...props
}: SheetContentProps) {
  const { open } = useSheetContext();
  const reducedMotion = useReducedMotion();
  const axis = side === 'left' || side === 'right' ? 'x' : 'y';
  const exit = reducedMotion
    ? { opacity: 0, pointerEvents: 'none' as const, transition: { duration: 0 } }
    : {
        ...offscreenBySide[side],
        pointerEvents: 'none' as const,
        transition: sheetExitTransition,
      };

  return (
    <AnimatePresence>
      {open ? (
        <SheetPrimitive.Portal forceMount>
          <SheetPrimitive.Overlay asChild forceMount>
            <motion.div
              animate={{ opacity: 1 }}
              className={styles.overlay}
              data-motion-owner="motion"
              data-slot="sheet-overlay"
              exit={{ opacity: 0, pointerEvents: 'none' }}
              initial={reducedMotion ? false : { opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : sheetOverlayTransition}
            />
          </SheetPrimitive.Overlay>
          <SheetPrimitive.Content asChild forceMount {...props}>
            <motion.div
              animate={{ [axis]: 0, opacity: 1 }}
              className={cn(styles.content, className)}
              data-motion-owner="motion"
              data-side={side}
              data-slot="sheet-content"
              data-variant={variant}
              exit={exit}
              initial={reducedMotion ? false : offscreenBySide[side]}
              transition={reducedMotion ? { duration: 0 } : transition}
            >
              {children}
              {showCloseButton ? (
                <SheetPrimitive.Close className={styles.close} data-slot="sheet-close">
                  <X aria-hidden="true" />
                  <span className={styles.srOnly}>닫기</span>
                </SheetPrimitive.Close>
              ) : null}
            </motion.div>
          </SheetPrimitive.Content>
        </SheetPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.header, className)} data-slot="sheet-header" {...props} />;
}

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(styles.footer, className)} data-slot="sheet-footer" {...props} />;
}

export type SheetTitleProps = ComponentProps<typeof SheetPrimitive.Title>;
export function SheetTitle({ className, ...props }: SheetTitleProps) {
  return <SheetPrimitive.Title className={cn(styles.title, className)} {...props} />;
}

export type SheetDescriptionProps = ComponentProps<typeof SheetPrimitive.Description>;
export function SheetDescription({ className, ...props }: SheetDescriptionProps) {
  return <SheetPrimitive.Description className={cn(styles.description, className)} {...props} />;
}
