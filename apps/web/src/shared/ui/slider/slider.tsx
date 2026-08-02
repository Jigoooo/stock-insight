import { Slider as SliderPrimitive } from 'radix-ui';
import { useState, type ComponentProps, type ReactElement, type ReactNode } from 'react';

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
  onValueChange,
  pending = false,
  startLabel,
  thumbLabels = [],
  value,
  variant = 'hairline',
  ...props
}: SliderProps): ReactElement {
  const initialValues = defaultValue ?? [min ?? 0];
  const [uncontrolledValues, setUncontrolledValues] = useState(initialValues);
  const currentValues = value ?? uncontrolledValues;

  const handleValueChange = (nextValues: number[]) => {
    if (value === undefined) setUncontrolledValues(nextValues);
    onValueChange?.(nextValues);
  };

  return (
    <span
      className={styles.root}
      data-slot="slider-control"
      data-variant={variant}
      data-disabled={disabled || pending ? '' : undefined}
    >
      {label || formatValue ? (
        <span className={styles.heading}>
          {label ? <span className={styles.label}>{label}</span> : null}
          <span className={styles.value} data-slot="slider-value">
            {formatValue
              ? formatValue(currentValues)
              : currentValues.map((currentValue) => currentValue.toLocaleString()).join(', ')}
          </span>
        </span>
      ) : null}
      <SliderPrimitive.Root
        {...props}
        aria-busy={pending || props['aria-busy']}
        className={cn(styles.sliderRoot, className)}
        data-slot="slider-root"
        defaultValue={initialValues}
        disabled={disabled || pending}
        min={min}
        onValueChange={handleValueChange}
        value={value}
      >
        <SliderPrimitive.Track className={styles.track} data-slot="slider-track">
          <SliderPrimitive.Range className={styles.range} data-slot="slider-range" />
        </SliderPrimitive.Track>
        {currentValues.map((_value, index) => (
          <SliderPrimitive.Thumb
            // oxlint-disable-next-line react/no-array-index-key -- Slider thumbs are positional and values may overlap.
            key={index}
            aria-label={thumbLabels[index]}
            className={styles.thumb}
            data-slot="slider-thumb"
          />
        ))}
      </SliderPrimitive.Root>
      {startLabel || endLabel ? (
        <span className={styles.scale}>
          <span>{startLabel}</span>
          <span>{endLabel}</span>
        </span>
      ) : null}
    </span>
  );
}
