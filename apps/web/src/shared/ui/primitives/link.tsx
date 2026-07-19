import type { AnchorHTMLAttributes, ReactNode } from 'react';

import styles from './link.module.css';
import type { MotionRecipe } from '../motion/motion-contract';

type TextLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  motion?: Extract<MotionRecipe, 'pressable' | 'quiet' | 'none'>;
  tone?: 'default' | 'accent' | 'muted';
};

function classNames(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(' ');
}

export function TextLink({
  children,
  className,
  motion = 'quiet',
  tone = 'default',
  ...props
}: TextLinkProps) {
  return (
    <a
      className={classNames(styles.textLink, className)}
      data-tone={tone}
      {...props}
      data-motion={motion}
    >
      {children}
    </a>
  );
}
