import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';

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
  const [pressed, setPressed] = useState(false);
  const animation = resolveMotionButtonAnimation({ hoverScale, tapScale });
  const unavailable = disabled || ariaDisabled === true || ariaDisabled === 'true' || inert;
  const resolvedHover = unavailable ? undefined : (whileHover ?? animation.whileHover);
  const resolvedTap = unavailable ? undefined : (whileTap ?? animation.whileTap);

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
        animate={pressed ? resolvedTap : undefined}
        className={styles.visual}
        data-slot="motion-visual"
        onPointerCancel={() => setPressed(false)}
        onPointerDown={(event) => {
          if (event.button === 0 && resolvedTap) setPressed(true);
        }}
        onPointerLeave={() => setPressed(false)}
        onPointerUp={() => setPressed(false)}
        transition={transition ?? animation.transition}
        whileHover={pressed ? undefined : resolvedHover}
      >
        {children}
      </motion.span>
    </button>
  );
});
