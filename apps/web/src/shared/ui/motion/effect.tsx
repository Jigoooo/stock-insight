import { motion, type HTMLMotionProps } from 'motion/react';
import {
  Children,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import {
  resolveEffectAnimation,
  resolveEffectChildDelay,
  type EffectAnimationOptions,
} from './motion-values';

type EffectElement = 'article' | 'div' | 'section' | 'span';

export type EffectProps = Omit<HTMLMotionProps<'div'>, 'children'> &
  EffectAnimationOptions & {
    as?: EffectElement;
    children?: ReactNode;
  };

const effectElements = {
  article: motion.article,
  div: motion.div,
  section: motion.section,
  span: motion.span,
} as const;

export const Effect = forwardRef<HTMLElement, EffectProps>(function Effect(
  {
    as = 'div',
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
  const Component = effectElements[as] as typeof motion.div;

  return (
    <Component
      ref={ref as Ref<HTMLDivElement>}
      initial={animation.initial}
      animate={animation.animate}
      transition={{ ...animation.transition, ...transition }}
      viewport={animation.viewport}
      whileInView={animation.whileInView}
      {...props}
    >
      {children}
    </Component>
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
