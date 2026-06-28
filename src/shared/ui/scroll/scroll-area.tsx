import {
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import styles from './scroll-area.module.css';

const MIN_THUMB_SIZE = 42;
const TRACK_PADDING = 8;
const IDLE_HIDE_DELAY = 900;

type ScrollAreaState = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

type DataAttributes = Record<`data-${string}`, string | number | boolean | undefined>;

type ScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  contentStyle?: CSSProperties;
  viewportProps?: HTMLAttributes<HTMLDivElement> & DataAttributes;
  viewportStyle?: CSSProperties;
};

function cx(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

function getScrollState(element: HTMLDivElement): ScrollAreaState {
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  };
}

export function ScrollArea({
  children,
  className,
  contentStyle,
  onScroll,
  style,
  viewportProps,
  viewportStyle,
  ...props
}: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const [scrollState, setScrollState] = useState<ScrollAreaState | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current === null) return;

    window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const updateScrollState = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    setScrollState(getScrollState(viewport));
  }, []);

  const revealTemporarily = useCallback(() => {
    clearIdleTimer();
    setIsActive(true);
    idleTimerRef.current = window.setTimeout(() => {
      setIsActive(false);
      idleTimerRef.current = null;
    }, IDLE_HIDE_DELAY);
  }, [clearIdleTimer]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    let frame = 0;
    const scheduleUpdate = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateScrollState();
      });
    };
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);

    scheduleUpdate();
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild) {
      resizeObserver?.observe(viewport.firstElementChild);
    }
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      clearIdleTimer();
    };
  }, [clearIdleTimer, updateScrollState]);

  const geometry = useMemo(() => {
    if (!scrollState || scrollState.scrollHeight <= scrollState.clientHeight) return null;

    const trackHeight = Math.max(0, scrollState.clientHeight - TRACK_PADDING * 2);
    const thumbHeight = Math.min(
      trackHeight,
      Math.max(MIN_THUMB_SIZE, (scrollState.clientHeight / scrollState.scrollHeight) * trackHeight),
    );
    const maxScrollTop = scrollState.scrollHeight - scrollState.clientHeight;
    const maxThumbTop = trackHeight - thumbHeight;
    const thumbTop = maxScrollTop > 0 ? (scrollState.scrollTop / maxScrollTop) * maxThumbTop : 0;

    return { maxScrollTop, maxThumbTop, thumbHeight, thumbTop, trackHeight };
  }, [scrollState]);
  const viewportTabIndex = viewportProps?.tabIndex ?? (geometry ? 0 : undefined);

  const handleViewportScroll = (event: UIEvent<HTMLDivElement>) => {
    onScroll?.(event);
    setScrollState(getScrollState(event.currentTarget));
    revealTemporarily();
  };

  const scrollToThumbPosition = (clientY: number) => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport || !geometry) return;

    const rect = track.getBoundingClientRect();
    const rawTop = clientY - rect.top - geometry.thumbHeight / 2;
    const thumbTop = Math.max(0, Math.min(rawTop, geometry.maxThumbTop));
    const scrollRatio = geometry.maxThumbTop > 0 ? thumbTop / geometry.maxThumbTop : 0;

    revealTemporarily();
    viewport.scrollTop = scrollRatio * geometry.maxScrollTop;
  };

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.target !== event.currentTarget) return;

    scrollToThumbPosition(event.clientY);
  };

  const handleThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !geometry) return;

    event.preventDefault();
    event.stopPropagation();

    const startY = event.clientY;
    const startScrollTop = viewport.scrollTop;
    const pointerId = event.pointerId;
    const thumb = event.currentTarget;

    setIsDragging(true);
    setIsActive(true);
    clearIdleTimer();
    thumb.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const scrollRatio =
        geometry.maxThumbTop > 0 ? geometry.maxScrollTop / geometry.maxThumbTop : 0;

      viewport.scrollTop = Math.max(
        0,
        Math.min(startScrollTop + deltaY * scrollRatio, geometry.maxScrollTop),
      );
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      revealTemporarily();
      if (thumb.hasPointerCapture(pointerId)) {
        thumb.releasePointerCapture(pointerId);
      }
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <div
      {...props}
      className={cx(styles.scrollArea, className)}
      style={{
        ...style,
        overflow: 'hidden',
        overflowX: 'hidden',
        overflowY: 'hidden',
      }}
    >
      <div
        {...viewportProps}
        ref={viewportRef}
        className={cx(styles.viewport, viewportProps?.className)}
        data-scroll-area-viewport
        style={viewportStyle}
        tabIndex={viewportTabIndex}
        onScroll={handleViewportScroll}
      >
        <div className={styles.content} style={contentStyle}>
          {children}
        </div>
      </div>
      {geometry ? (
        <div
          ref={trackRef}
          className={styles.track}
          data-scroll-area-track
          data-visible={isActive || isHovered || isDragging ? 'true' : undefined}
          data-hovered={isHovered || isDragging ? 'true' : undefined}
          data-dragging={isDragging ? 'true' : undefined}
          style={{ height: geometry.trackHeight }}
          aria-hidden="true"
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          onPointerDown={handleTrackPointerDown}
        >
          <div
            className={styles.thumb}
            data-scroll-area-thumb
            style={{
              height: geometry.thumbHeight,
              transform: `translate3d(0, ${geometry.thumbTop}px, 0)`,
            }}
            onPointerDown={handleThumbPointerDown}
          />
        </div>
      ) : null}
    </div>
  );
}
