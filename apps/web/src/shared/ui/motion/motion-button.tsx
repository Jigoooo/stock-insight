import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';

import { resolveMotionButtonAnimation } from './motion-values';

export type MotionButtonProps = HTMLMotionProps<'button'> & {
  hoverScale?: number;
  tapScale?: number;
};

export const MotionButton = forwardRef<HTMLButtonElement, MotionButtonProps>(function MotionButton(
  { hoverScale, tapScale, transition, whileHover, whileTap, ...props },
  ref,
) {
  const animation = resolveMotionButtonAnimation({ hoverScale, tapScale });

  return (
    <motion.button
      ref={ref}
      transition={transition ?? animation.transition}
      whileHover={whileHover ?? animation.whileHover}
      whileTap={whileTap ?? animation.whileTap}
      {...props}
    />
  );
});
