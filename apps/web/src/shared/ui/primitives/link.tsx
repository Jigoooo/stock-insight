import { motion } from 'motion/react';
import { useState, type AnchorHTMLAttributes, type PointerEvent, type ReactNode } from 'react';

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
  'aria-disabled': ariaDisabled,
  children,
  className,
  motion: motionRecipe = 'quiet',
  tone = 'default',
  ...props
}: TextLinkProps) {
  const [pressed, setPressed] = useState(false);
  const unavailable = ariaDisabled === true || ariaDisabled === 'true' || props.inert;
  const hoverTarget = !unavailable && motionRecipe === 'pressable' ? { scale: 1.012 } : undefined;
  const tapTarget = unavailable
    ? undefined
    : motionRecipe === 'pressable'
      ? { scale: 0.978 }
      : motionRecipe === 'quiet'
        ? { opacity: 0.76 }
        : undefined;

  return (
    <a
      {...props}
      aria-disabled={ariaDisabled}
      className={classNames(styles.textLink, className)}
      data-motion-owner="motion"
      data-slot="text-link-control"
      data-tone={tone}
      data-motion={motionRecipe}
    >
      <motion.span
        animate={pressed ? tapTarget : undefined}
        className={styles.motionVisual}
        data-slot="motion-visual"
        onPointerCancel={() => setPressed(false)}
        onPointerDown={(event: PointerEvent<HTMLSpanElement>) => {
          if (event.button === 0 && tapTarget) setPressed(true);
        }}
        onPointerLeave={() => setPressed(false)}
        onPointerUp={() => setPressed(false)}
        whileHover={pressed ? undefined : hoverTarget}
      >
        {children}
      </motion.span>
    </a>
  );
}
