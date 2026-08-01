'use client';

import styles from './tabs.module.css';

import { cn } from '@/shared/lib/utils';
import {
  Tabs as TabsPrimitive,
  TabsContent as TabsContentPrimitive,
  TabsContents as TabsContentsPrimitive,
  TabsHighlight as TabsHighlightPrimitive,
  TabsHighlightItem as TabsHighlightItemPrimitive,
  TabsList as TabsListPrimitive,
  TabsTrigger as TabsTriggerPrimitive,
  type TabsContentProps as TabsContentPrimitiveProps,
  type TabsContentsProps as TabsContentsPrimitiveProps,
  type TabsHighlightItemProps as TabsHighlightItemPrimitiveProps,
  type TabsHighlightProps as TabsHighlightPrimitiveProps,
  type TabsListProps as TabsListPrimitiveProps,
  type TabsProps as TabsPrimitiveProps,
  type TabsTriggerProps as TabsTriggerPrimitiveProps,
} from '@/shared/ui/animate-ui/primitives/radix/tabs';

export type TabsVariant = 'inset' | 'hairline';

export type TabsProps = TabsPrimitiveProps & {
  variant?: TabsVariant;
};

export function Tabs({ className, variant = 'inset', ...props }: TabsProps) {
  return (
    <TabsPrimitive
      className={cn(styles.root, className)}
      data-variant={variant}
      {...props}
    />
  );
}

export type TabsHighlightProps = TabsHighlightPrimitiveProps;

export function TabsHighlight({ className, ...props }: TabsHighlightProps) {
  return <TabsHighlightPrimitive className={cn(styles.highlight, className)} {...props} />;
}

export type TabsListProps = TabsListPrimitiveProps;

export function TabsList({ className, ...props }: TabsListProps) {
  return <TabsListPrimitive className={cn(styles.list, className)} {...props} />;
}

export type TabsHighlightItemProps = TabsHighlightItemPrimitiveProps;

export function TabsHighlightItem({ className, ...props }: TabsHighlightItemProps) {
  return <TabsHighlightItemPrimitive className={cn(styles.item, className)} {...props} />;
}

export type TabsTriggerProps = TabsTriggerPrimitiveProps;

export function TabsTrigger({ className, ...props }: TabsTriggerProps) {
  return <TabsTriggerPrimitive className={cn(styles.trigger, className)} {...props} />;
}

export type TabsContentProps = TabsContentPrimitiveProps;

export function TabsContent({ className, transition, ...props }: TabsContentProps) {
  return (
    <TabsContentPrimitive
      className={cn(styles.content, className)}
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -2 }}
      transition={transition ?? { duration: 0.18, ease: 'easeOut' }}
      {...props}
    />
  );
}

export type TabsContentsProps = TabsContentsPrimitiveProps;

export function TabsContents(props: TabsContentsProps) {
  return <TabsContentsPrimitive {...props} />;
}
