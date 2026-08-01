'use client';

// Upstream: https://animate-ui.com/docs/primitives/buttons/button
// Registry item: @animate-ui/primitives-buttons-button
// Revision: efeb96ffd7a3b7a4868667e4ac3c346620fb3044

import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { Slot, type WithAsChild } from '@/shared/ui/animate-ui/primitives/animate/slot';

type ButtonProps = WithAsChild<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> &
    Pick<HTMLMotionProps<'button'>, 'transition' | 'whileHover' | 'whileTap'> & {
    hoverScale?: number;
    tapScale?: number;
  }
>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { hoverScale = 1.05, tapScale = 0.95, asChild = false, ...props },
  ref,
) {
  if (asChild) {
    return <Slot ref={ref} {...(props as HTMLMotionProps<'button'>)} />;
  }

  const motionless =
    hoverScale === 1 &&
    tapScale === 1 &&
    props.whileHover === undefined &&
    props.whileTap === undefined;

  if (motionless) {
    return <button ref={ref} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />;
  }

  const motionProps = props as HTMLMotionProps<'button'>;

  return (
    <motion.button
      ref={ref}
      whileTap={tapScale === 1 ? undefined : { scale: tapScale }}
      whileHover={hoverScale === 1 ? undefined : { scale: hoverScale }}
      {...motionProps}
    />
  );
});

export { Button, type ButtonProps };
