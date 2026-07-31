import type { ComponentProps, ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';
import { Table, TableCaption } from '@/shared/ui/table';

export function DataTable({
  caption,
  children,
  className,
  captionClassName,
  containerProps,
  ...props
}: Omit<ComponentProps<'table'>, 'children'> & {
  caption: ReactNode;
  captionClassName?: string;
  children: ReactNode;
  containerProps?: ComponentProps<'div'>;
}) {
  return (
    <Table className={cn(styles.table, className)} containerProps={containerProps} {...props}>
      <TableCaption className={captionClassName}>{caption}</TableCaption>
      {children}
    </Table>
  );
}
