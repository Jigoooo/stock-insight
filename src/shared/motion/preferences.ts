import { motionTokens } from '@/shared/theme/tokens';

export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function getMotionDuration(duration: number) {
  return prefersReducedMotion() ? motionTokens.reduced : duration;
}
