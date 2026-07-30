import { motion, type HTMLMotionProps } from 'motion/react';
import { Children, forwardRef, isValidElement, type ReactNode, type ReactElement } from 'react';

import {
  resolveEffectAnimation,
  resolveEffectChildDelay,
  type EffectAnimationOptions,
} from './motion-values';

export type EffectProps = Omit<HTMLMotionProps<'div'>, 'children'> &
  EffectAnimationOptions & {
    children?: ReactNode;
  };

export const Effect = forwardRef<HTMLDivElement, EffectProps>(function Effect(
  {
    blur,
    children,
    delay,
    fade,
    inView,
    inViewMargin,
    inViewOnce,
    slide,
    transition,
    zoom,
    ...props
  },
  ref,
) {
  const animation = resolveEffectAnimation({
    blur,
    delay,
    fade,
    inView,
    inViewMargin,
    inViewOnce,
    slide,
    zoom,
  });

  return (
    <motion.div
      ref={ref}
      initial={animation.initial}
      animate={animation.animate}
      transition={{ ...animation.transition, ...transition }}
      viewport={animation.viewport}
      whileInView={animation.whileInView}
      {...props}
    >
      {children}
    </motion.div>
  );
});

export type EffectsProps = Omit<EffectProps, 'children' | 'delay'> & {
  children: ReactElement | ReactElement[];
  delay?: number;
  holdDelay?: number;
};

export function Effects({ children, delay = 0.08, holdDelay = 0, ...props }: EffectsProps) {
  let elementIndex = 0;

  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const childDelay = resolveEffectChildDelay({ delay, holdDelay, index: elementIndex });
    elementIndex += 1;

    return (
      <Effect key={child.key ?? elementIndex} {...props} delay={childDelay}>
        {child}
      </Effect>
    );
  });
}
