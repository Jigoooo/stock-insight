import type { HTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';
import { Effect } from '../motion';

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div';
  children: ReactNode;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Card({ as = 'div', children, className, ...props }: CardProps) {
  const Component = as;

  return (
    <Component {...props} className={classNames(styles.card, className)} data-slot="card-root">
      <Effect
        className={styles.cardVisual}
        data-slot="card-visual"
        fade
        slide={{ direction: 'down', offset: 4 }}
      >
        {children}
      </Effect>
    </Component>
  );
}
