import type { ReactNode } from 'react';

import styles from './chart.module.css';

export type ChartConfig = Record<
  string,
  {
    label: string;
    color: string;
  }
>;

type ChartFrameProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
};

export function ChartFrame({
  children,
  className,
  description,
  testId,
  title,
}: Readonly<ChartFrameProps>) {
  return (
    <section
      className={className ? `${styles.frame} ${className}` : styles.frame}
      data-testid={testId}
    >
      <div className={styles.head}>
        <div>
          <h4>{title}</h4>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </section>
  );
}

export function ChartLegend({ config }: Readonly<{ config: ChartConfig }>) {
  return (
    <div className={styles.legend}>
      {Object.entries(config).map(([key, item]) => (
        <span className={styles.legendItem} key={key}>
          <i className={styles.swatch} style={{ background: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

type ChartTooltipValue = string | number | readonly [string | number, string | number];

type ChartTooltipPayload = {
  dataKey?: string | number;
  name?: string | number;
  value?: ChartTooltipValue;
};

type ChartTooltipContentProps = {
  active?: boolean;
  config: ChartConfig;
  label?: ReactNode;
  payload?: readonly ChartTooltipPayload[];
};

export function ChartTooltipContent({
  active,
  config,
  label,
  payload,
}: Readonly<ChartTooltipContentProps>) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.tooltip}>
      {label ? <p className={styles.tooltipLabel}>{label}</p> : null}
      {payload.map((item) => (
        <TooltipRow item={item} config={config} key={`${item.dataKey ?? item.name}`} />
      ))}
    </div>
  );
}

function TooltipRow({
  config,
  item,
}: Readonly<{ config: ChartConfig; item: ChartTooltipPayload }>) {
  const key = String(item.dataKey ?? item.name ?? '');
  const label = config[key]?.label ?? item.name ?? key;
  const value = Array.isArray(item.value) ? item.value.join(' ~ ') : item.value;

  return (
    <div className={styles.tooltipRow}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
