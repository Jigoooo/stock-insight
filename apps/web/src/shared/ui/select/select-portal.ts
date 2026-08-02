import { useEffect, useState, type RefObject } from 'react';

export type SelectAnchorRect = {
  bottom: number;
  left: number;
  top: number;
  width: number;
};

export type SelectPopupPosition = {
  bottom: number | undefined;
  left: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
  top: number | undefined;
  width: number;
};

type CalculateSelectPopupPositionOptions = {
  anchor: SelectAnchorRect;
  gap?: number;
  margin?: number;
  minimumPreferredSpace?: number;
  preferredMaxHeight?: number;
  viewportHeight: number;
  viewportWidth: number;
};

export function calculateSelectPopupPosition({
  anchor,
  gap = 6,
  margin = 8,
  minimumPreferredSpace = 160,
  preferredMaxHeight = 320,
  viewportHeight,
  viewportWidth,
}: CalculateSelectPopupPositionOptions): SelectPopupPosition {
  const availableBelow = Math.max(0, viewportHeight - anchor.bottom - gap - margin);
  const availableAbove = Math.max(0, anchor.top - gap - margin);
  const placement =
    availableBelow >= Math.min(minimumPreferredSpace, preferredMaxHeight) ||
    availableBelow >= availableAbove
      ? 'bottom'
      : 'top';
  const width = Math.min(anchor.width, Math.max(0, viewportWidth - margin * 2));
  const left = Math.min(
    Math.max(anchor.left, margin),
    Math.max(margin, viewportWidth - width - margin),
  );
  const maxHeight = Math.min(
    preferredMaxHeight,
    placement === 'bottom' ? availableBelow : availableAbove,
  );

  return {
    bottom: placement === 'top' ? viewportHeight - anchor.top + gap : undefined,
    left,
    maxHeight,
    placement,
    top: placement === 'bottom' ? anchor.bottom + gap : undefined,
    width,
  };
}

export function useSelectPortalPosition(anchorRef: RefObject<HTMLElement | null>, open: boolean) {
  const [position, setPosition] = useState<SelectPopupPosition | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPosition(
        calculateSelectPopupPosition({
          anchor: {
            bottom: rect.bottom,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          },
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        }),
      );
    };

    const handleScroll = (event: Event) => {
      const anchor = anchorRef.current;
      if (event.target instanceof Element && anchor && !event.target.contains(anchor)) return;
      updatePosition();
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, true);
    const observer = new ResizeObserver(updatePosition);
    if (anchorRef.current) observer.observe(anchorRef.current);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, true);
      observer.disconnect();
    };
  }, [anchorRef, open]);

  return position;
}
