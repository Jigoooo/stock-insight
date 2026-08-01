'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';

import styles from './tooltip.module.css';

import { cn } from '@/shared/lib/utils';
import { getStrictContext } from '@/shared/lib/get-strict-context';
import { useControlledState } from '@/shared/lib/use-controlled-state';

type TooltipContextValue = { open: boolean };
const [TooltipStateProvider, useTooltipState] =
  getStrictContext<TooltipContextValue>('TooltipContext');

export type TooltipProviderProps = ComponentProps<typeof TooltipPrimitive.Provider>;
export function TooltipProvider({ delayDuration = 120, ...props }: TooltipProviderProps) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export type TooltipProps = ComponentProps<typeof TooltipPrimitive.Root> & {
  delayDuration?: number;
};

export function Tooltip({
  defaultOpen,
  delayDuration = 120,
  onOpenChange,
  open,
  ...props
}: TooltipProps) {
  const [resolvedOpen, setResolvedOpen] = useControlledState({
    value: open,
    defaultValue: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipStateProvider value={{ open: resolvedOpen }}>
        <TooltipPrimitive.Root {...props} open={resolvedOpen} onOpenChange={setResolvedOpen} />
      </TooltipStateProvider>
    </TooltipProvider>
  );
}

export type TooltipTriggerProps = ComponentProps<typeof TooltipPrimitive.Trigger>;
export function TooltipTrigger(props: TooltipTriggerProps) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export type TooltipContentProps = Omit<
  ComponentProps<typeof TooltipPrimitive.Content>,
  'asChild' | 'forceMount'
>;

export function TooltipContent({
  children,
  className,
  sideOffset = 8,
  ...props
}: TooltipContentProps) {
  const { open } = useTooltipState();

  return (
    <AnimatePresence>
      {open ? (
        <TooltipPrimitive.Portal forceMount>
          <TooltipPrimitive.Content asChild forceMount sideOffset={sideOffset} {...props}>
            <motion.div
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(styles.content, className)}
              data-slot="tooltip-content"
              exit={{ opacity: 0, y: 2, scale: 0.98 }}
              initial={{ opacity: 0, y: 2, scale: 0.98 }}
              transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
            >
              {children}
              <TooltipPrimitive.Arrow className={styles.arrow} />
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}
