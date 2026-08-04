import {
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  LoaderCircle,
  UserRound,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState, type ReactElement, type ReactNode } from 'react';

import styles from './identity-content-catalog.module.css';
import {
  contentItems,
  getAdjacentContentId,
  identityContentVariants,
  identitySamples,
  statusSamples,
  type ContentItemId,
  type IdentityContentTabId,
  type IdentityContentVariant,
} from './identity-content-model';

import { Badge } from '@/shared/ui/badge';

type PreviewProps = {
  selectedId: ContentItemId;
  onSelect: (id: ContentItemId) => void;
};

type IdentityContentPreviewsProps = PreviewProps & {
  component: IdentityContentTabId;
};

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
  center: {
    opacity: 1,
    scale: 1,
    x: 0,
    zIndex: 2,
  },
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

function VariantCard({
  children,
  component,
  variant,
}: {
  children: ReactNode;
  component: IdentityContentTabId;
  variant: IdentityContentVariant;
}) {
  return (
    <article className={styles.variantCard} data-component={component} data-variant={variant.id}>
      <header className={styles.variantHeader}>
        <span>{variant.label}</span>
        <h3>{variant.description}</h3>
      </header>
      <div className={styles.preview}>{children}</div>
    </article>
  );
}

function PreviewGrid({ children }: { children: ReactNode }) {
  return <div className={styles.variantGrid}>{children}</div>;
}

function AvatarPreviews() {
  return (
    <PreviewGrid>
      {identityContentVariants.avatar.map((variant) => (
        <VariantCard component="avatar" variant={variant} key={variant.id}>
          <div className={styles.avatarList} data-avatar-variant={variant.id}>
            {identitySamples.map((identity) => (
              <div
                aria-label={`${identity.name} 정체성`}
                className={styles.identity}
                key={identity.id}
              >
                <span className={styles.avatar} data-identity={identity.id}>
                  {variant.id === 'soft-portrait' ? (
                    identity.id === 'user' ? (
                      <UserRound aria-hidden="true" size={20} />
                    ) : (
                      <Building2 aria-hidden="true" size={20} />
                    )
                  ) : (
                    identity.initials
                  )}
                </span>
                {variant.id === 'identity-pair' ? (
                  <span className={styles.identityCopy}>
                    <strong>{identity.name}</strong>
                    <small>{identity.meta}</small>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function BadgePreviews() {
  return (
    <PreviewGrid>
      {identityContentVariants.badge.map((variant) => (
        <VariantCard component="badge" variant={variant} key={variant.id}>
          <div className={styles.badgeList} data-badge-variant={variant.id}>
            {statusSamples.map((status) => (
              <Badge
                className={styles.statusBadge}
                data-tone={status.tone}
                variant={
                  variant.id === 'hairline-tag'
                    ? 'outline'
                    : variant.id === 'soft-fill'
                      ? 'secondary'
                      : 'ghost'
                }
                key={status.id}
              >
                {variant.id === 'dot-label' ? <span className={styles.statusDot} /> : null}
                {status.label}
              </Badge>
            ))}
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function StatusIcon({ statusId }: { statusId: (typeof statusSamples)[number]['id'] }) {
  if (statusId === 'available') return <Check aria-hidden="true" size={15} />;
  if (statusId === 'collecting') return <LoaderCircle aria-hidden="true" size={15} />;
  return <Clock3 aria-hidden="true" size={15} />;
}

function StatusPreviews() {
  return (
    <PreviewGrid>
      {identityContentVariants.status.map((variant) => (
        <VariantCard component="status" variant={variant} key={variant.id}>
          <div className={styles.statusList} data-status-variant={variant.id}>
            {statusSamples.map((status) => (
              <div className={styles.statusItem} data-tone={status.tone} key={status.id}>
                <span className={styles.statusIcon}>
                  <StatusIcon statusId={status.id} />
                </span>
                <span>
                  <strong>{status.label}</strong>
                  <small>{status.description}</small>
                </span>
              </div>
            ))}
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function ContentButton({
  compact = false,
  item,
  selectedId,
  onSelect,
}: PreviewProps & {
  compact?: boolean;
  item: (typeof contentItems)[number];
}) {
  const selected = selectedId === item.id;

  return (
    <button
      aria-current={selected ? 'true' : undefined}
      aria-label={`${item.title} 선택`}
      className={styles.contentButton}
      data-compact={compact || undefined}
      type="button"
      onClick={() => onSelect(item.id)}
    >
      <span className={styles.contentMarker} aria-hidden="true">
        {selected ? <Check size={13} /> : <CircleDot size={13} />}
      </span>
      <span className={styles.contentCopy}>
        <small>{item.eyebrow}</small>
        <strong>{item.title}</strong>
        {!compact ? <span>{item.description}</span> : null}
      </span>
      <span className={styles.contentMeta}>
        <time>{item.time}</time>
        <small>{item.source}</small>
      </span>
    </button>
  );
}

function ListPreviews(props: PreviewProps) {
  return (
    <PreviewGrid>
      {identityContentVariants.list.map((variant) => (
        <VariantCard component="list" variant={variant} key={variant.id}>
          <div className={styles.contentList} data-list-variant={variant.id}>
            {contentItems.map((item) => (
              <ContentButton
                {...props}
                compact={variant.id === 'ledger-list'}
                item={item}
                key={item.id}
              />
            ))}
            <button className={styles.disabledRow} disabled type="button">
              보관된 리서치 · 준비 중
            </button>
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function TimelinePreviews(props: PreviewProps) {
  return (
    <PreviewGrid>
      {identityContentVariants.timeline.map((variant) => (
        <VariantCard component="timeline" variant={variant} key={variant.id}>
          <ol className={styles.timeline} data-timeline-variant={variant.id}>
            {contentItems.map((item) => {
              const selected = props.selectedId === item.id;
              return (
                <li key={item.id}>
                  <button
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${item.title} 선택`}
                    type="button"
                    onClick={() => props.onSelect(item.id)}
                  >
                    <span className={styles.timelinePoint} aria-hidden="true" />
                    <time>{item.time}</time>
                    <span className={styles.timelineCopy}>
                      <strong>{item.title}</strong>
                      <small>
                        {variant.id === 'compact-ledger' ? item.source : item.description}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function CarouselPreviews(props: PreviewProps) {
  const selectedIndex = contentItems.findIndex((item) => item.id === props.selectedId);
  const selectedItem = contentItems[selectedIndex] ?? contentItems[0];
  const [direction, setDirection] = useState<CarouselDirection>('idle');
  const reducedMotion = Boolean(useReducedMotion());
  const atStart = selectedIndex <= 0;
  const atEnd = selectedIndex >= contentItems.length - 1;
  const motionContext = { direction, reducedMotion } satisfies CarouselMotionContext;

  const selectItem = (nextId: ContentItemId) => {
    const nextIndex = contentItems.findIndex((item) => item.id === nextId);
    setDirection(
      nextIndex === selectedIndex ? 'idle' : nextIndex > selectedIndex ? 'forward' : 'backward',
    );
    props.onSelect(nextId);
  };

  return (
    <PreviewGrid>
      {identityContentVariants.carousel.map((variant) => (
        <VariantCard component="carousel" variant={variant} key={variant.id}>
          <div
            aria-live="polite"
            className={styles.carousel}
            data-carousel-variant={variant.id}
            data-selected-id={selectedItem.id}
          >
            <div className={styles.carouselStage}>
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
                disabled={atStart}
                type="button"
                onClick={() => selectItem(getAdjacentContentId(selectedItem.id, -1))}
              >
                <ChevronLeft aria-hidden="true" size={17} />
              </button>
              <div className={styles.carouselSelectors}>
                {contentItems.map((item, index) => (
                  <button
                    aria-current={item.id === props.selectedId ? 'true' : undefined}
                    aria-label={`${item.title} 선택`}
                    data-index={index + 1}
                    type="button"
                    onClick={() => selectItem(item.id)}
                    key={item.id}
                  >
                    {variant.id === 'filmstrip' ? item.eyebrow : String(index + 1).padStart(2, '0')}
                  </button>
                ))}
              </div>
              <button
                aria-label="다음 콘텐츠"
                disabled={atEnd}
                type="button"
                onClick={() => selectItem(getAdjacentContentId(selectedItem.id, 1))}
              >
                <ChevronRight aria-hidden="true" size={17} />
              </button>
            </div>
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

export function IdentityContentPreviews({
  component,
  selectedId,
  onSelect,
}: IdentityContentPreviewsProps): ReactElement {
  switch (component) {
    case 'avatar':
      return <AvatarPreviews />;
    case 'badge':
      return <BadgePreviews />;
    case 'status':
      return <StatusPreviews />;
    case 'list':
      return <ListPreviews selectedId={selectedId} onSelect={onSelect} />;
    case 'timeline':
      return <TimelinePreviews selectedId={selectedId} onSelect={onSelect} />;
    case 'carousel':
      return <CarouselPreviews selectedId={selectedId} onSelect={onSelect} />;
  }
}
