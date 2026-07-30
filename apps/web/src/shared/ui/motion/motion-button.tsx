import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';

import { resolveMotionButtonAnimation } from './motion-values';

export type MotionButtonProps = HTMLMotionProps<'button'> & {
  hoverScale?: number;
  tapScale?: number;
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(function MotionButton(
  {
    'aria-disabled': ariaDisabled,
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
    <motion.button
      ref={ref}
      {...props}
      aria-disabled={ariaDisabled}
      data-motion-owner="motion"
      disabled={disabled}
      inert={inert}
      transition={transition ?? animation.transition}
      whileHover={unavailable ? undefined : (whileHover ?? animation.whileHover)}
      whileTap={unavailable ? undefined : (whileTap ?? animation.whileTap)}
    />
  );
});
