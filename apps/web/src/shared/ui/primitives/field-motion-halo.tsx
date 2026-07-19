import styles from './field-motion-halo.module.css';

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function FieldMotionHalo({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={classNames(styles.fieldMotionHalo, className)}
      data-field-motion-halo
    />
  );
}
