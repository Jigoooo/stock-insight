import type { HTMLAttributes, ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';

export type PropertyItem = {
  label: string;
  value: ReactNode;
};

export function PropertyList({
  items,
  className,
  ...props
}: Readonly<{ items: readonly PropertyItem[] }> & HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={cn(styles.propertyList, className)} {...props}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
