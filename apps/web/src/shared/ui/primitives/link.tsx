import { motion, type HTMLMotionProps } from 'motion/react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import styles from './link.module.css';
import { bridgeNativeMotionEvents } from './native-motion-events';
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
  const { motionSafeProps, nativeCaptureProps } = bridgeNativeMotionEvents(props);
  const unavailable = ariaDisabled === true || ariaDisabled === 'true' || props.inert;

  return (
    <motion.a
      {...(motionSafeProps as Omit<
        HTMLMotionProps<'a'>,
        'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragStart'
      >)}
      {...nativeCaptureProps}
      aria-disabled={ariaDisabled}
      className={classNames(styles.textLink, className)}
      data-motion-owner="motion"
      data-slot="text-link-control"
      data-tone={tone}
      data-motion={motionRecipe}
      whileHover={!unavailable && motionRecipe === 'pressable' ? { scale: 1.012 } : undefined}
      whileTap={
        unavailable
          ? undefined
          : motionRecipe === 'pressable'
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
