'use client';

import { Check, ChevronLeft, ChevronRight, CircleDot } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type HTMLAttributes, type OlHTMLAttributes, type ReactNode } from 'react';

import styles from './identity-content.module.css';

import { cn } from '@/shared/lib/utils';

export type AvatarVariant = 'monogram-ring' | 'soft-portrait' | 'identity-pair';

export type AvatarProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  initials: ReactNode;
  meta?: ReactNode;
  name: string;
  variant?: AvatarVariant;
  visual?: ReactNode;
};

export function Avatar({
  'aria-label': ariaLabel,
  className,
  initials,
  meta,
  name,
  variant = 'monogram-ring',
  visual,
  ...props
}: AvatarProps) {
  return (
    <div
      {...props}
      aria-label={ariaLabel ?? `${name} 정체성`}
      className={cn(styles.avatarRoot, className)}
      data-slot="avatar"
      data-variant={variant}
    >
      <span className={styles.avatarVisual} data-slot="avatar-visual">
        {visual ?? initials}
      </span>
      {variant === 'identity-pair' ? (
        <span className={styles.avatarCopy}>
          <strong>{name}</strong>
          {meta ? <small>{meta}</small> : null}
        </span>
      ) : null}
    </div>
  );
}

export type IdentityBadgeVariant = 'hairline-tag' | 'soft-fill' | 'dot-label';
export type IdentityTone = 'neutral' | 'positive' | 'progress' | 'pending';

export type IdentityBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: IdentityTone;
  variant?: IdentityBadgeVariant;
};

export function IdentityBadge({
  children,
  className,
  tone = 'neutral',
  variant = 'hairline-tag',
  ...props
}: IdentityBadgeProps) {
  return (
    <span
      {...props}
      className={cn(styles.badgeRoot, className)}
      data-slot="identity-badge"
      data-tone={tone}
      data-variant={variant}
    >
      {variant === 'dot-label' ? <span className={styles.badgeDot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export type StatusIndicatorVariant = 'inline-signal' | 'status-block' | 'key-value-status';

export type StatusIndicatorProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  description: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  tone?: IdentityTone;
  variant?: StatusIndicatorVariant;
};

export function StatusIndicator({
  className,
  description,
  icon,
  label,
  tone = 'neutral',
  variant = 'inline-signal',
  ...props
}: StatusIndicatorProps) {
  return (
    <div
      {...props}
      className={cn(styles.statusRoot, className)}
      data-slot="status-indicator"
      data-tone={tone}
      data-variant={variant}
    >
      {variant !== 'key-value-status' && icon ? (
        <span className={styles.statusIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.statusCopy}>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
    </div>
  );
}

export type ContentItem<Value extends string = string> = {
  description: string;
  eyebrow: string;
  id: Value;
  source: string;
  time: string;
  title: string;
};

type ContentCollectionProps<Value extends string> = {
  items: ReadonlyArray<ContentItem<Value>>;
  onValueChange?: (value: Value) => void;
  value: Value;
};

export type ContentListVariant = 'quiet-rows' | 'soft-cards' | 'ledger-list';

export type ContentListProps<Value extends string = string> = Omit<
  HTMLAttributes<HTMLUListElement>,
  'onChange'
> &
  ContentCollectionProps<Value> & {
    disabledLabel?: ReactNode;
    variant?: ContentListVariant;
  };

export function ContentList<Value extends string = string>({
  className,
  disabledLabel,
  items,
  onValueChange,
  value,
  variant = 'quiet-rows',
  ...props
}: ContentListProps<Value>) {
  return (
    <ul
      {...props}
      className={cn(styles.contentList, className)}
      data-slot="content-list"
      data-variant={variant}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <li key={item.id}>
            <button
              aria-current={selected ? 'true' : undefined}
              aria-label={`${item.title} 선택`}
              className={styles.contentButton}
              type="button"
              onClick={() => onValueChange?.(item.id)}
            >
              {variant !== 'ledger-list' ? (
                <span className={styles.contentMarker} aria-hidden="true">
                  {selected ? <Check size={13} /> : <CircleDot size={13} />}
                </span>
              ) : null}
              <span className={styles.contentCopy}>
                <small>{item.eyebrow}</small>
                <strong>{item.title}</strong>
                {variant !== 'ledger-list' ? <span>{item.description}</span> : null}
              </span>
              <span className={styles.contentMeta}>
                <time>{item.time}</time>
                <small>{item.source}</small>
              </span>
            </button>
          </li>
        );
      })}
      {disabledLabel ? (
        <li>
          <button className={styles.disabledRow} disabled type="button">
            {disabledLabel}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

export type ContentTimelineVariant = 'hairline-rail' | 'event-cards' | 'compact-ledger';

export type ContentTimelineProps<Value extends string = string> = Omit<
  OlHTMLAttributes<HTMLOListElement>,
  'onChange'
> &
  ContentCollectionProps<Value> & {
    variant?: ContentTimelineVariant;
  };

export function ContentTimeline<Value extends string = string>({
  className,
  items,
  onValueChange,
  value,
  variant = 'hairline-rail',
  ...props
}: ContentTimelineProps<Value>) {
  return (
    <ol
      {...props}
      className={cn(styles.timeline, className)}
      data-slot="content-timeline"
      data-variant={variant}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <li key={item.id}>
            <button
              aria-current={selected ? 'true' : undefined}
              aria-label={`${item.title} 선택`}
              type="button"
              onClick={() => onValueChange?.(item.id)}
            >
              {variant !== 'compact-ledger' ? (
                <span className={styles.timelinePoint} aria-hidden="true" />
              ) : null}
              <time>{item.time}</time>
              <span className={styles.timelineCopy}>
                <strong>{item.title}</strong>
                <small>{variant === 'compact-ledger' ? item.source : item.description}</small>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export type CarouselVariant = 'edge-arrows' | 'snap-cards' | 'filmstrip';
type CarouselDirection = 'idle' | 'forward' | 'backward';

type CarouselMotionContext = {
  direction: CarouselDirection;
  reducedMotion: boolean;
};

const carouselContentVariants = {
  enter: ({ direction, reducedMotion }: CarouselMotionContext) => ({
    opacity: reducedMotion ? 1 : 0,
    scale: reducedMotion ? 1 : 0.985,
    x: reducedMotion ? 0 : direction === 'forward' ? 18 : direction === 'backward' ? -18 : 0,
    zIndex: 2,
  }),
  center: { opacity: 1, scale: 1, x: 0, zIndex: 2 },
  exit: ({ direction, reducedMotion }: CarouselMotionContext) => ({
    opacity: reducedMotion ? 0 : 0.42,
    scale: reducedMotion ? 1 : 0.97,
    transition: reducedMotion
      ? { duration: 0 }
      : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
    x: reducedMotion ? 0 : direction === 'forward' ? -11 : direction === 'backward' ? 11 : 0,
    zIndex: 1,
  }),
};

export type CarouselProps<Value extends string = string> = Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> &
  ContentCollectionProps<Value> & {
    variant?: CarouselVariant;
  };

export function Carousel<Value extends string = string>({
  className,
  items,
  onValueChange,
  value,
  variant = 'edge-arrows',
  ...props
}: CarouselProps<Value>) {
  const selectedIndex = items.findIndex((item) => item.id === value);
  const resolvedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selectedItem = items[resolvedIndex];
  const [direction, setDirection] = useState<CarouselDirection>('idle');
  const reducedMotion = Boolean(useReducedMotion());
  const motionContext = { direction, reducedMotion } satisfies CarouselMotionContext;
  const atStart = resolvedIndex <= 0;
  const atEnd = resolvedIndex >= items.length - 1;

  if (!selectedItem) return null;

  const selectItem = (nextIndex: number) => {
    const nextItem = items[nextIndex];
    if (!nextItem || nextIndex === resolvedIndex) return;
    setDirection(nextIndex > resolvedIndex ? 'forward' : 'backward');
    onValueChange?.(nextItem.id);
  };

  return (
    <div
      {...props}
      aria-live="polite"
      className={cn(styles.carousel, className)}
      data-selected-id={selectedItem.id}
      data-slot="carousel"
      data-variant={variant}
    >
      <div className={styles.carouselStage} data-slot="carousel-stage">
        <AnimatePresence custom={motionContext} initial={false} mode="sync">
          <motion.div
            animate="center"
            className={styles.carouselStageContent}
            custom={motionContext}
            data-carousel-content
            data-direction={direction}
            data-motion-owner="motion"
            exit="exit"
            initial="enter"
            key={selectedItem.id}
            transition={
              reducedMotion ? { duration: 0 } : { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
            }
            variants={carouselContentVariants}
          >
            <span>{selectedItem.eyebrow}</span>
            <strong>{selectedItem.title}</strong>
            <p>{selectedItem.description}</p>
            <small>{selectedItem.source}</small>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={styles.carouselControls}>
        <button
          aria-label="이전 콘텐츠"
          disabled={atStart || !onValueChange}
          type="button"
          onClick={() => selectItem(resolvedIndex - 1)}
        >
          <ChevronLeft aria-hidden="true" size={17} />
        </button>
        <div className={styles.carouselSelectors}>
          {items.map((item, index) => (
            <button
              aria-current={item.id === selectedItem.id ? 'true' : undefined}
              aria-label={`${item.title} 선택`}
              data-index={index + 1}
              disabled={!onValueChange}
              type="button"
              onClick={() => selectItem(index)}
              key={item.id}
            >
              {variant === 'filmstrip' ? item.eyebrow : String(index + 1).padStart(2, '0')}
            </button>
          ))}
        </div>
        <button
          aria-label="다음 콘텐츠"
          disabled={atEnd || !onValueChange}
          type="button"
          onClick={() => selectItem(resolvedIndex + 1)}
        >
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      </div>
    </div>
  );
}
