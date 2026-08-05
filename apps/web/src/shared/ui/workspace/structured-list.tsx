import type { HTMLAttributes, ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';

export function StructuredList({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLUListElement> & { children: ReactNode }) {
  // role="list" is redundant in HTML and required in practice: Safari with
  // VoiceOver drops list semantics from a <ul> once `list-style: none` is
  // applied, which this component's stylesheet does. The crypto view carries an
  // oxlint-disable for jsx-a11y/no-redundant-roles naming exactly this recovery,
  // and the role belonged to the markup that view used before 1edcf81 moved it
  // into this shared component and lost it.
  //
  // Callers may still override it; the spread stays last so an explicit role wins.
  return (
    <ul role="list" className={cn(styles.structuredList, className)} {...props}>
      {children}
    </ul>
  );
}
