'use client';

import { Check } from 'lucide-react';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { useId, type CSSProperties, type OlHTMLAttributes, type ReactNode } from 'react';

import styles from './stepper.module.css';

import { cn } from '@/shared/lib/utils';

export type StepperVariant = 'hairline-flow' | 'soft-track' | 'ledger-steps';
export type StepperState = 'completed' | 'current' | 'upcoming';

export type StepperItem<Value extends string = string> = {
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: Value;
};

export type StepperProps<Value extends string = string> = Omit<
  OlHTMLAttributes<HTMLOListElement>,
  'onChange'
> & {
  disabled?: boolean;
  items: ReadonlyArray<StepperItem<Value>>;
  onValueChange?: (value: Value) => void;
  statusLabels?: Partial<Record<StepperState, ReactNode>>;
  value: Value;
  variant?: StepperVariant;
};

const defaultStatusLabels: Record<StepperState, ReactNode> = {
  completed: 'Completed',
  current: 'Current',
  upcoming: 'Upcoming',
};

function resolveState(index: number, activeIndex: number): StepperState {
  if (activeIndex < 0 || index > activeIndex) return 'upcoming';
  if (index < activeIndex) return 'completed';
  return 'current';
}

function StepIndicator({ index, state }: { index: number; state: StepperState }) {
  if (state === 'completed') return <Check aria-hidden="true" size={14} strokeWidth={2} />;
  return <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>;
}

export function Stepper<Value extends string = string>({
  className,
  disabled = false,
  items,
  onValueChange,
  statusLabels,
  style,
  value,
  variant = 'hairline-flow',
  ...props
}: StepperProps<Value>) {
  const layoutScopeId = useId();
  const reducedMotion = useReducedMotion() ?? false;
  const activeIndex = items.findIndex((item) => item.value === value);
  const labels = { ...defaultStatusLabels, ...statusLabels };

  return (
    <LayoutGroup id={layoutScopeId}>
      <ol
        {...props}
        className={cn(styles.root, className)}
        data-slot="stepper"
        data-variant={variant}
        style={
          {
            ...style,
            '--stepper-count': Math.max(items.length, 1),
          } as CSSProperties
        }
      >
        {items.map((item, index) => {
          const state = resolveState(index, activeIndex);
          const itemDisabled = disabled || item.disabled;
          const interactive = Boolean(onValueChange) && !itemDisabled;
          const content = (
            <>
              {variant === 'soft-track' && state === 'current' ? (
                <motion.span
                  aria-hidden="true"
                  className={styles.softTrackIndicator}
                  data-slot="stepper-soft-track-indicator"
                  layoutId={reducedMotion ? undefined : 'stepper-soft-track-active'}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 320, damping: 32 }
                  }
                />
              ) : null}

              <span className={styles.content}>
                <span className={styles.indicator} data-slot="stepper-indicator">
                  {variant === 'hairline-flow' && state === 'current' ? (
                    <motion.span
                      aria-hidden="true"
                      className={styles.hairlineActiveIndicator}
                      data-slot="hairline-active-indicator"
                      layoutId={reducedMotion ? undefined : 'stepper-hairline-active'}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }
                      }
                    >
                      {String(index + 1).padStart(2, '0')}
                    </motion.span>
                  ) : (
                    <StepIndicator index={index} state={state} />
                  )}
                </span>
                <span className={styles.copy}>
                  <strong>{item.label}</strong>
                  {variant === 'ledger-steps' && item.description ? (
                    <span>{item.description}</span>
                  ) : null}
                </span>
                {variant === 'ledger-steps' ? <small>{labels[state]}</small> : null}
              </span>
            </>
          );

          return (
            <li data-disabled={itemDisabled || undefined} data-state={state} key={item.value}>
              {interactive ? (
                <button
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={styles.control}
                  type="button"
                  onClick={() => onValueChange?.(item.value)}
                >
                  {content}
                </button>
              ) : (
                <div
                  aria-current={state === 'current' ? 'step' : undefined}
                  className={styles.control}
                  data-slot="stepper-static-step"
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}
