/* oxlint-disable jsx-a11y/no-redundant-roles -- Safari/VoiceOver drops list semantics from a <ol> once list-style is none, which this stylesheet does. The crypto view carried the same disable before 1edcf81 moved this markup into a shared component. */
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import styles from './workspace.module.css';

import { cn } from '@/shared/lib/utils';

export const Timeline = forwardRef<
  HTMLOListElement,
  HTMLAttributes<HTMLOListElement> & { children: ReactNode }
>(function Timeline({ children, className, ...props }, ref) {
  return (
    // Same Safari/VoiceOver recovery as StructuredList: an <ol> with
    // `list-style: none` loses its list semantics there, and this stylesheet
    // removes the markers. Lost in 1edcf81 when the markup moved into shared
    // components, and invisible until the crypto browser gate stopped dying on a
    // stale heading assertion.
    <ol role="list" ref={ref} className={cn(styles.timeline, className)} {...props}>
      {children}
    </ol>
  );
});
