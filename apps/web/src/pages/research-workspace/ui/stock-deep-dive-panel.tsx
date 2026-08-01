import { RelationSigmaGraph } from './relation-sigma-graph';
import styles from './stock-deep-dive-panel.module.css';
import {
  DEEP_DIVE_SECTION_IDS,
  type StockDeepDive,
  type StockDeepDiveAvailability,
} from '../model/stock-deep-dive';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/ui/accordion';
import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';
import { Button } from '@/shared/ui/primitives';
import { DetailSurface, PropertyList, StructuredList, WorkspaceState } from '@/shared/ui/workspace';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

export type StockDeepDivePanelState = 'idle' | 'loading' | 'error' | 'ready';

const availabilityLabel: Record<StockDeepDiveAvailability, string> = {
  available: '근거 연결됨',
  partial: '일부 연결',
  missing: '데이터 없음',
};

function PanelState({
  description,
  kind,
  onRetry,
  title,
}: {
  description: string;
  kind: 'empty' | 'error' | 'loading';
  onRetry?: () => void;
  title: string;
}) {
  return (
    <WorkspaceState
      className={styles.state}
      kind={kind}
      delayMs={0}
      title={title}
      description={description}
      action={
        onRetry ? (
          <Button className={styles.retryButton} size="sm" variant="secondary" onClick={onRetry}>
            다시 불러오기
          </Button>
        ) : undefined
      }
    />
  );
}

export function StockDeepDivePanel({
  deepDive,
  errorMessage,
  onRetry,
  onSelectEntity,
  relation,
  state,
}: {
  deepDive: StockDeepDive | null;
  errorMessage?: string;
  onRetry: () => void;
  onSelectEntity: (entityKey: string) => void;
  relation: EntityRelationGraph | null;
  state: StockDeepDivePanelState;
}) {
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const disclosureTransition = {
    duration: forcedColors || reducedMotion ? 0 : 0.18,
    ease: 'easeOut',
  } as const;

  if (state === 'idle') {
    return (
      <DetailSurface className={styles.deepDivePanel} aria-label="종목 Deep Dive">
        <PanelState
          kind="empty"
          title="분석할 종목을 선택하세요"
          description="표에서 종목을 선택하면 12개 분석 축과 관계 지도를 같은 화면에서 확인합니다."
        />
      </DetailSurface>
    );
  }

  if (state === 'loading') {
    return (
      <DetailSurface className={styles.deepDivePanel} aria-busy="true" aria-label="종목 Deep Dive">
        <PanelState
          kind="loading"
          title="Deep Dive를 구성하고 있습니다"
          description="종목 상세와 2단계 관계망을 같은 기준 시점으로 불러옵니다."
        />
      </DetailSurface>
    );
  }

  if (state === 'error' || !deepDive) {
    return (
      <DetailSurface className={styles.deepDivePanel} aria-label="종목 Deep Dive">
        <PanelState
          kind="error"
          title="Deep Dive를 불러오지 못했습니다"
          description={errorMessage ?? '잠시 후 다시 시도해 주세요.'}
          onRetry={onRetry}
        />
      </DetailSurface>
    );
  }

  return (
    <DetailSurface
      className={styles.deepDivePanel}
      aria-busy={false}
      aria-label={`${deepDive.displayName} 종목 Deep Dive`}
      data-testid="stock-deep-dive"
    >
      <header className={styles.header}>
        <div>
          <span>Stock Deep Dive</span>
          <h2>{deepDive.displayName}</h2>
          <p>{deepDive.entityKey}</p>
        </div>
        <PropertyList
          className={styles.headerMeta}
          aria-label="Deep Dive 속성"
          items={[
            { label: '분석 축', value: '12개' },
            { label: '데이터', value: availabilityLabel[deepDive.availability] },
          ]}
        />
      </header>

      <Accordion
        className={styles.sectionList}
        type="multiple"
        defaultValue={['identity', 'direct_relations']}
      >
        {DEEP_DIVE_SECTION_IDS.map((sectionId) => {
          const section = deepDive.sections.find((item) => item.id === sectionId);
          if (!section) return null;
          const showGraph =
            section.id === 'direct_relations' &&
            section.availability !== 'missing' &&
            relation !== null &&
            relation.edges.length > 0;
          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className={styles.section}
              data-availability={section.availability}
              data-deep-dive-section={section.id}
            >
              <AccordionTrigger className={styles.sectionTrigger} showArrow={false}>
                <span>{section.title}</span>
                <small>{availabilityLabel[section.availability]}</small>
              </AccordionTrigger>
              <AccordionContent
                className={styles.sectionBody}
                initial={{ height: 0 }}
                animate={{ height: 'auto' }}
                exit={{ height: 0 }}
                transition={disclosureTransition}
                style={{ overflow: 'hidden' }}
              >
                <p>{section.summary}</p>
                {section.items.length > 0 && (
                  <StructuredList>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </StructuredList>
                )}
                {showGraph && (
                  <div className={styles.graphRegion}>
                    <RelationSigmaGraph graph={relation} onSelectEntity={onSelectEntity} />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </DetailSurface>
  );
}
