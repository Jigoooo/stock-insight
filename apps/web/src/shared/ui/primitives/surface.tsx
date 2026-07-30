import type { HTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';
import { Effect } from '../motion';
import type { EffectProps } from '../motion/effect';

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div';
  children: ReactNode;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Card({ as = 'div', children, className, ...props }: CardProps) {
  return (
    <Effect
      {...(props as EffectProps)}
      as={as}
      className={classNames(styles.card, className)}
      fade
      slide={{ direction: 'down', offset: 4 }}
      data-slot="card-root"
    >
      {children}
    </Effect>
  );
}
