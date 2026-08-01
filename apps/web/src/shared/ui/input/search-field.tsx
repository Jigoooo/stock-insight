import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

import { Input } from './input';
import styles from './input.module.css';

import { cn } from '@/shared/lib/utils';

export type SearchFieldProps = Omit<LabelHTMLAttributes<HTMLLabelElement>, 'children'> & {
  className?: string;
  icon: ReactNode;
  inputProps: InputHTMLAttributes<HTMLInputElement> & {
    'aria-label': string;
    'data-testid'?: string;
  };
};

export function SearchField({ className, icon, inputProps, ...props }: SearchFieldProps) {
  return (
    <label {...props} className={cn(styles.searchField, className)} data-slot="search-field-root">
      <span className={styles.searchIcon} data-slot="search-field-icon" aria-hidden="true">
        {icon}
      </span>
      <Input
        {...inputProps}
        className={cn(styles.searchControl, inputProps.className)}
        density="search"
        variant="bare"
      />
    </label>
  );
}
