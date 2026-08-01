'use client';

// Upstream: https://animate-ui.com/docs/primitives/buttons/button
// Registry item: @animate-ui/primitives-buttons-button
// Revision: efeb96ffd7a3b7a4868667e4ac3c346620fb3044

import { motion, type HTMLMotionProps } from 'motion/react';
import type { ButtonHTMLAttributes } from 'react';

import { Slot, type WithAsChild } from '@/shared/ui/animate-ui/primitives/animate/slot';

type ButtonProps = WithAsChild<
  HTMLMotionProps<'button'> & {
    hoverScale?: number;
    tapScale?: number;
  }
>;

function Button({ hoverScale = 1.05, tapScale = 0.95, asChild = false, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot {...props} />;
  }

  const motionless =
    hoverScale === 1 &&
    tapScale === 1 &&
    props.whileHover === undefined &&
    props.whileTap === undefined;

  if (motionless) {
    return <button {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />;
  }

  return (
    <motion.button
      whileTap={tapScale === 1 ? undefined : { scale: tapScale }}
      whileHover={hoverScale === 1 ? undefined : { scale: hoverScale }}
      {...props}
    />
  );
}

export { Button, type ButtonProps };
