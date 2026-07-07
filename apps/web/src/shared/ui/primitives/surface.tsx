import type { HTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';

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
    <Component className={classNames(styles.card, className)} {...props}>
      {children}
    </Component>
  );
}
