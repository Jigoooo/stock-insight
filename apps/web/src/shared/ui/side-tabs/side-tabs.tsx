'use client';

import { useReducedMotion } from 'motion/react';

import styles from './side-tabs.module.css';

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

export type SideTabsVariant = 'hairline-rail' | 'soft-inset' | 'framed-stack';

export type SideTabsProps = Omit<TabsPrimitiveProps, 'orientation'> & {
  variant?: SideTabsVariant;
};

export function SideTabs({ className, variant = 'hairline-rail', ...props }: SideTabsProps) {
  return (
    <TabsPrimitive
      {...props}
      className={cn(styles.root, className)}
      data-variant={variant}
      orientation="vertical"
    />
  );
}

export type SideTabsHighlightProps = TabsHighlightPrimitiveProps;

export function SideTabsHighlight({ className, transition, ...props }: SideTabsHighlightProps) {
  const reducedMotion = useReducedMotion();

  return (
    <TabsHighlightPrimitive
      {...props}
      className={cn(styles.highlight, className)}
      transition={transition ?? (reducedMotion ? { duration: 0 } : undefined)}
    />
  );
}

export type SideTabsListProps = TabsListPrimitiveProps;

export function SideTabsList({ className, ...props }: SideTabsListProps) {
  return <TabsListPrimitive {...props} className={cn(styles.list, className)} />;
}

export type SideTabsHighlightItemProps = TabsHighlightItemPrimitiveProps;

export function SideTabsHighlightItem({ className, ...props }: SideTabsHighlightItemProps) {
  return <TabsHighlightItemPrimitive {...props} className={cn(styles.item, className)} />;
}

export type SideTabsTriggerProps = TabsTriggerPrimitiveProps;

export function SideTabsTrigger({ className, ...props }: SideTabsTriggerProps) {
  return <TabsTriggerPrimitive {...props} className={cn(styles.trigger, className)} />;
}

export type SideTabsContentProps = TabsContentPrimitiveProps;

export function SideTabsContent({ className, transition, ...props }: SideTabsContentProps) {
  const reducedMotion = useReducedMotion();

  return (
    <TabsContentPrimitive
      {...props}
      className={cn(styles.content, className)}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 3 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : -2 }}
      transition={
        transition ?? (reducedMotion ? { duration: 0 } : { duration: 0.16, ease: 'easeOut' })
      }
    />
  );
}

export type SideTabsContentsProps = TabsContentsPrimitiveProps;

export function SideTabsContents({ className, ...props }: SideTabsContentsProps) {
  return <TabsContentsPrimitive {...props} className={cn(styles.contents, className)} />;
}
