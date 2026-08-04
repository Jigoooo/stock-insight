import { Building2, Check, Clock3, LoaderCircle, UserRound } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import styles from './identity-content-catalog.module.css';
import {
  contentItems,
  identityContentVariants,
  identitySamples,
  statusSamples,
  type ContentItemId,
  type IdentityContentTabId,
  type IdentityContentVariant,
} from './identity-content-model';

import {
  Avatar,
  Carousel,
  ContentList,
  ContentTimeline,
  IdentityBadge,
  StatusIndicator,
  type IdentityTone,
} from '@/shared/ui/identity-content';

type PreviewProps = {
  selectedId: ContentItemId;
  onSelect: (id: ContentItemId) => void;
};

type IdentityContentPreviewsProps = PreviewProps & {
  component: IdentityContentTabId;
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
          <div className={styles.previewStack}>
            {identitySamples.map((identity) => (
              <Avatar
                initials={identity.initials}
                meta={identity.meta}
                name={identity.name}
                variant={variant.id}
                visual={
                  variant.id === 'soft-portrait' ? (
                    identity.id === 'user' ? (
                      <UserRound aria-hidden="true" size={20} />
                    ) : (
                      <Building2 aria-hidden="true" size={20} />
                    )
                  ) : undefined
                }
                key={identity.id}
              />
            ))}
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function resolveTone(tone: (typeof statusSamples)[number]['tone']): IdentityTone {
  if (tone === 'success') return 'positive';
  if (tone === 'warning') return 'pending';
  return 'neutral';
}

function BadgePreviews() {
  return (
    <PreviewGrid>
      {identityContentVariants.badge.map((variant) => (
        <VariantCard component="badge" variant={variant} key={variant.id}>
          <div className={styles.previewStack}>
            {statusSamples.map((status) => (
              <IdentityBadge tone={resolveTone(status.tone)} variant={variant.id} key={status.id}>
                {status.label}
              </IdentityBadge>
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
          <div className={styles.previewStack}>
            {statusSamples.map((status) => (
              <StatusIndicator
                description={status.description}
                icon={<StatusIcon statusId={status.id} />}
                label={status.label}
                tone={resolveTone(status.tone)}
                variant={variant.id}
                key={status.id}
              />
            ))}
          </div>
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function ListPreviews(props: PreviewProps) {
  return (
    <PreviewGrid>
      {identityContentVariants.list.map((variant) => (
        <VariantCard component="list" variant={variant} key={variant.id}>
          <ContentList
            aria-label={`${variant.label} 콘텐츠 목록`}
            disabledLabel="보관된 리서치 · 준비 중"
            items={contentItems}
            onValueChange={props.onSelect}
            value={props.selectedId}
            variant={variant.id}
          />
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
          <ContentTimeline
            aria-label={`${variant.label} 콘텐츠 타임라인`}
            items={contentItems}
            onValueChange={props.onSelect}
            value={props.selectedId}
            variant={variant.id}
          />
        </VariantCard>
      ))}
    </PreviewGrid>
  );
}

function CarouselPreviews(props: PreviewProps) {
  return (
    <PreviewGrid>
      {identityContentVariants.carousel.map((variant) => (
        <VariantCard component="carousel" variant={variant} key={variant.id}>
          <Carousel
            aria-label={`${variant.label} 콘텐츠 캐러셀`}
            items={contentItems}
            onValueChange={props.onSelect}
            value={props.selectedId}
            variant={variant.id}
          />
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
