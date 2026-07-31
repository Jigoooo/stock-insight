import type { HTMLAttributes } from 'react';

import type { PropertyItem } from './property-list';
import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

export function StatusSummary({
  items,
  className,
  ...props
}: Readonly<{ items: readonly PropertyItem[] }> & HTMLAttributes<HTMLDListElement>) {
  return (
    <dl className={cn(styles.statusSummary, className)} {...props}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            <Badge className={styles.statusBadge} variant="outline">
              {item.value}
            </Badge>
          </dd>
        </div>
      ))}
    </dl>
  );
}
