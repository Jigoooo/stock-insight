import type { ReactNode } from 'react';

import styles from './workspace.module.css';

export type MetricItem = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
};

export function MetricStrip({
  items,
  label,
}: Readonly<{ items: readonly MetricItem[]; label: string }>) {
  return (
    <dl className={styles.metricStrip} aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </dl>
  );
}
