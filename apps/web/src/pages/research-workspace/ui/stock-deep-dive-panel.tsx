import { AlertCircle, ChevronDown, CircleDot, LoaderCircle, Network } from 'lucide-react';

import { RelationSigmaGraph } from './relation-sigma-graph';
import styles from './stock-deep-dive-panel.module.css';
import {
  DEEP_DIVE_SECTION_IDS,
  type StockDeepDive,
  type StockDeepDiveAvailability,
} from '../model/stock-deep-dive';

import { Button } from '@/shared/ui/primitives';
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
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? AlertCircle : CircleDot;
  return (
    <div className={styles.state} data-kind={kind} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" data-motion-loop={kind === 'loading' ? 'spinner' : undefined} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
        {onRetry && (
          <Button className={styles.retryButton} size="sm" variant="secondary" onClick={onRetry}>
            다시 불러오기
          </Button>
        )}
      </div>
    </div>
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
  if (state === 'idle') {
    return (
      <aside className={styles.panel} aria-label="종목 Deep Dive">
        <PanelState
          kind="empty"
          title="분석할 종목을 선택하세요"
          description="표에서 종목을 선택하면 12개 분석 축과 관계 지도를 같은 화면에서 확인합니다."
        />
      </aside>
    );
  }

  if (state === 'loading') {
    return (
      <aside className={styles.panel} aria-busy="true" aria-label="종목 Deep Dive">
        <PanelState
          kind="loading"
          title="Deep Dive를 구성하고 있습니다"
          description="종목 상세와 2단계 관계망을 같은 기준 시점으로 불러옵니다."
        />
      </aside>
    );
  }

  if (state === 'error' || !deepDive) {
    return (
      <aside className={styles.panel} aria-label="종목 Deep Dive">
        <PanelState
          kind="error"
          title="Deep Dive를 불러오지 못했습니다"
          description={errorMessage ?? '잠시 후 다시 시도해 주세요.'}
          onRetry={onRetry}
        />
      </aside>
    );
  }

  return (
    <aside
      className={styles.panel}
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
        <div className={styles.headerMeta}>
          <Network aria-hidden="true" />
          <span>12개 분석 축</span>
        </div>
      </header>

      <div className={styles.sectionList}>
        {DEEP_DIVE_SECTION_IDS.map((sectionId) => {
          const section = deepDive.sections.find((item) => item.id === sectionId);
          if (!section) return null;
          const showGraph =
            section.id === 'direct_relations' &&
            section.availability !== 'missing' &&
            relation !== null &&
            relation.edges.length > 0;
          return (
            <details
              key={section.id}
              className={styles.section}
              data-availability={section.availability}
              data-deep-dive-section={section.id}
              open={section.id === 'identity' || section.id === 'direct_relations'}
            >
              <summary>
                <span>{section.title}</span>
                <small>{availabilityLabel[section.availability]}</small>
                <ChevronDown className={styles.disclosureIcon} aria-hidden="true" />
              </summary>
              <div className={styles.sectionBody}>
                <p>{section.summary}</p>
                {section.items.length > 0 && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {showGraph && (
                  <div className={styles.graphRegion}>
                    <RelationSigmaGraph graph={relation} onSelectEntity={onSelectEntity} />
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </aside>
  );
}
