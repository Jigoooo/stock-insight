import {
  AnimatePresence,
  motion,
  type AnimatePresenceProps,
  type HTMLMotionProps,
} from 'motion/react';
import type { Key, ReactNode } from 'react';

export type PresenceRegionProps = Omit<HTMLMotionProps<'div'>, 'children'> & {
  children?: ReactNode;
  mode?: AnimatePresenceProps['mode'];
  onExitComplete?: AnimatePresenceProps['onExitComplete'];
  presenceKey: Key;
  present: boolean;
};

export function PresenceRegion({
  children,
  mode,
  onExitComplete,
  presenceKey,
  present,
  ...props
}: PresenceRegionProps) {
  return (
    <AnimatePresence mode={mode} onExitComplete={onExitComplete}>
      {present ? (
        <motion.div key={presenceKey} {...props}>
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
