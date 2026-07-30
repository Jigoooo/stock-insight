import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import styles from './motion-button.module.css';
import { resolveMotionButtonAnimation } from './motion-values';

type MotionVisualProps = Pick<HTMLMotionProps<'span'>, 'transition' | 'whileHover' | 'whileTap'>;

export type MotionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  MotionVisualProps & {
    hoverScale?: number;
    tapScale?: number;
  };

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(function MotionButton(
  {
    'aria-disabled': ariaDisabled,
    children,
    disabled,
    hoverScale,
    inert,
    tapScale,
    transition,
    whileHover,
    whileTap,
    ...props
  },
  ref,
) {
  const animation = resolveMotionButtonAnimation({ hoverScale, tapScale });
  const unavailable = disabled || ariaDisabled === true || ariaDisabled === 'true' || inert;

  return (
    <button
      ref={ref}
      {...props}
      aria-disabled={ariaDisabled}
      data-motion-owner="motion"
      disabled={disabled}
      inert={inert}
    >
      <motion.span
        className={styles.visual}
        data-slot="motion-visual"
        tabIndex={-1}
        transition={transition ?? animation.transition}
        whileHover={unavailable ? undefined : (whileHover ?? animation.whileHover)}
        whileTap={unavailable ? undefined : (whileTap ?? animation.whileTap)}
      >
        {children}
      </motion.span>
    </button>
  );
});
