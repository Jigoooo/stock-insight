import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode } from 'react';

import styles from './link.module.css';
import type { MotionRecipe } from '../motion/motion-contract';

type TextLinkProps = Omit<HTMLMotionProps<'a'>, 'children'> & {
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
  motion: motionRecipe = 'quiet',
  tone = 'default',
  ...props
}: TextLinkProps) {
  return (
    <motion.a
      className={classNames(styles.textLink, className)}
      data-motion-owner="motion"
      data-slot="text-link-control"
      data-tone={tone}
      {...props}
      data-motion={motionRecipe}
      whileHover={motionRecipe === 'pressable' ? { scale: 1.012 } : undefined}
      whileTap={
        motionRecipe === 'pressable'
          ? { scale: 0.978 }
          : motionRecipe === 'quiet'
            ? { opacity: 0.76 }
            : undefined
      }
    >
      {children}
    </motion.a>
  );
}
