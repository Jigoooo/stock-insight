export type ControlSize = 'sm' | 'md' | 'lg';
export type SurfaceTone = 'base' | 'subtle' | 'muted' | 'elevated';

export function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export const focusRingClassName =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
