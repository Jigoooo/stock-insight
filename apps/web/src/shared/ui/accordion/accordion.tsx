import { ChevronDown } from 'lucide-react';

import styles from './accordion.module.css';

import { cn } from '@/shared/lib/utils';
import {
  Accordion as AccordionPrimitive,
  AccordionContent as AccordionContentPrimitive,
  AccordionHeader as AccordionHeaderPrimitive,
  AccordionItem as AccordionItemPrimitive,
  AccordionTrigger as AccordionTriggerPrimitive,
  type AccordionContentProps as AccordionContentPrimitiveProps,
  type AccordionItemProps as AccordionItemPrimitiveProps,
  type AccordionProps as AccordionPrimitiveProps,
  type AccordionTriggerProps as AccordionTriggerPrimitiveProps,
} from '@/shared/ui/animate-ui/primitives/radix/accordion';

export type AccordionVariant = 'editorial' | 'ledger' | 'index';

export type AccordionProps = AccordionPrimitiveProps & {
  variant?: AccordionVariant;
};

export function Accordion({ className, variant = 'editorial', ...props }: AccordionProps) {
  return (
    <AccordionPrimitive className={cn(styles.root, className)} data-variant={variant} {...props} />
  );
}

export type AccordionItemProps = AccordionItemPrimitiveProps;

export function AccordionItem({ className, ...props }: AccordionItemProps) {
  return <AccordionItemPrimitive className={cn(styles.item, className)} {...props} />;
}

export type AccordionTriggerProps = AccordionTriggerPrimitiveProps & {
  showArrow?: boolean;
};

export function AccordionTrigger({
  children,
  className,
  showArrow = true,
  ...props
}: AccordionTriggerProps) {
  return (
    <AccordionHeaderPrimitive className={styles.header}>
      <AccordionTriggerPrimitive className={cn(styles.trigger, className)} {...props}>
        {children}
        {showArrow ? <ChevronDown className={styles.chevron} aria-hidden="true" /> : null}
      </AccordionTriggerPrimitive>
    </AccordionHeaderPrimitive>
  );
}

export type AccordionContentProps = AccordionContentPrimitiveProps;

export function AccordionContent({ children, className, ...props }: AccordionContentProps) {
  return (
    <AccordionContentPrimitive {...props}>
      <div className={cn(styles.contentInner, className)}>{children}</div>
    </AccordionContentPrimitive>
  );
}
