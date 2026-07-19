import type { HTMLAttributes, ReactNode } from 'react';

import styles from './primitives.module.css';
import { MotionRegion } from '../motion/motion-region';

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div';
  children: ReactNode;
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function Card({ as = 'div', children, className, ...props }: CardProps) {
  return (
    <MotionRegion
      as={as}
      className={classNames(styles.card, className)}
      recipe="surface"
      {...props}
    >
      {children}
    </MotionRegion>
  );
}
