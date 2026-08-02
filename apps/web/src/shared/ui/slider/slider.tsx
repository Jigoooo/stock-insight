import { Slider as SliderPrimitive } from 'radix-ui';
import type { ComponentProps, ReactElement, ReactNode } from 'react';

import styles from './slider.module.css';

import { cn } from '@/shared/lib/utils';

export type SliderVariant = 'hairline' | 'inset' | 'rail';

export type SliderProps = Omit<ComponentProps<typeof SliderPrimitive.Root>, 'children'> & {
  endLabel?: ReactNode;
  formatValue?: (values: readonly number[]) => ReactNode;
  label?: ReactNode;
  pending?: boolean;
  startLabel?: ReactNode;
  thumbLabels?: readonly string[];
  variant?: SliderVariant;
};

export function Slider({
  className,
  defaultValue,
  disabled,
  endLabel,
  formatValue,
  label,
  min,
  pending = false,
  startLabel,
  thumbLabels = [],
  value,
  variant = 'hairline',
  ...props
}: SliderProps): ReactElement {
  const values = value ?? defaultValue ?? [min ?? 0];

  return (
    <SliderPrimitive.Root
      {...props}
      aria-busy={pending || props['aria-busy']}
      className={cn(styles.root, className)}
      data-slot="slider-control"
      data-variant={variant}
      defaultValue={defaultValue}
      disabled={disabled || pending}
      min={min}
      value={value}
    >
      {label || formatValue ? (
        <span className={styles.heading}>
          {label ? <span className={styles.label}>{label}</span> : null}
          <span className={styles.value} data-slot="slider-value">
            {formatValue
              ? formatValue(values)
              : values.map((currentValue) => currentValue.toLocaleString()).join(', ')}
          </span>
        </span>
      ) : null}
      <span className={styles.sliderBody}>
        <SliderPrimitive.Track className={styles.track} data-slot="slider-track">
          <SliderPrimitive.Range className={styles.range} data-slot="slider-range" />
        </SliderPrimitive.Track>
        {values.map((_value, index) => (
          <SliderPrimitive.Thumb
            // oxlint-disable-next-line react/no-array-index-key -- Slider thumbs are positional and values may overlap.
            key={index}
            aria-label={thumbLabels[index]}
            className={styles.thumb}
            data-slot="slider-thumb"
          />
        ))}
      </span>
      {startLabel || endLabel ? (
        <span className={styles.scale}>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </span>
      ) : null}
    </SliderPrimitive.Root>
  );
}
