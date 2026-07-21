import { ChevronRight, GitBranch, MoveHorizontal } from 'lucide-react';
import { useRef } from 'react';

import {
  AvailabilityNotice,
  PageHeader,
  WorkspaceState,
  type DetailState,
  availabilityLabels,
  confidenceLabel,
  relationNodeLabel,
  relationTypeLabel,
} from '../research-workspace-page';
import styles from '../research-workspace-page.module.css';
import { useWorkspaceRelationCrossfade } from '../use-workspace-relation-crossfade';

import { themeTitleLabel } from '@/pages/research-workspace/model/presentation';
import { isVerifiedRelationEdge } from '@/pages/research-workspace/model/relation-graphology';
import { RelationSigmaGraph } from '@/pages/research-workspace/ui/relation-sigma-graph';
import { Button } from '@/shared/ui/primitives';
import type {
  EntityRelationGraph,
  ThemeResearchList,
} from '@stock-insight/contracts/research-workspace';

export function ThemesView({
  data,
  interactive,
  onSelectEntity,
  relation,
  relationState,
}: {
  data: ThemeResearchList;
  interactive: boolean;
  onSelectEntity: (entityKey: string) => void;
  relation: EntityRelationGraph | null;
  relationState: DetailState;
}) {
  const activeTheme = relation
    ? data.items.find((theme) => theme.topEntityKeys.includes(relation.rootEntityKey))
    : undefined;
  return (
    <>
      <PageHeader
        eyebrow="관계 지도"
        title="테마·관계"
        description="확인된 관계만 모아, 신호 시점과 관계 확인 시점을 나누어 보여줍니다."
        asOf={data.graphKnownThroughAt}
      />
      <AvailabilityNotice availability={data.availability} />
      <div className={styles.split}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>테마 묶음</h2>
              <p>
                {data.items.length}개 · {availabilityLabels[data.availability]}
              </p>
            </div>
          </header>
          <div className={`${styles.ledger} ${styles.themeLedger}`} data-testid="theme-ledger">
            {data.items.length === 0 ? (
              <WorkspaceState
                kind="empty"
                title="아직 구성된 테마가 없습니다"
                description="종목 관계가 확인되면 비교할 테마 묶음을 이곳에 보여드립니다."
              />
            ) : (
              data.items.map((theme) => {
                const isActive = activeTheme?.themeKey === theme.themeKey;
                return (
                  <article
                    key={theme.themeKey}
                    className={styles.themeRow}
                    data-selected={isActive || undefined}
                  >
                    <Button
                      className={styles.themeSelect}
                      type="button"
                      motion="quiet"
                      data-testid="theme-select"
                      aria-label={`${themeTitleLabel(theme.title)} 관계 보기`}
                      aria-pressed={isActive}
                      disabled={
                        !interactive ||
                        relationState === 'loading' ||
                        theme.topEntityKeys.length === 0
                      }
                      onClick={() => {
                        const entityKey = theme.topEntityKeys[0];
                        if (entityKey) onSelectEntity(entityKey);
                      }}
                    >
                      <strong>{themeTitleLabel(theme.title)}</strong>
                      <p>{theme.description}</p>
                      <small>
                        {isActive
                          ? '오른쪽 관계 지도에 표시 중'
                          : theme.topEntityKeys.length > 0
                            ? `대표 종목 ${theme.topEntityKeys.length}개`
                            : '대표 종목 없음'}
                      </small>
                    </Button>
                    <dl>
                      <div>
                        <dt>구성</dt>
                        <dd>{theme.memberCount}</dd>
                      </div>
                      <div>
                        <dt>관심</dt>
                        <dd>{theme.watchedCount}</dd>
                      </div>
                      <div>
                        <dt>신호</dt>
                        <dd>{theme.recentSignalCount}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })
            )}
          </div>
        </section>
        <RelationLedger
          graph={relation}
          contextTitle={activeTheme ? themeTitleLabel(activeTheme.title) : undefined}
          onSelectEntity={onSelectEntity}
          state={relationState}
        />
      </div>
    </>
  );
}

function RelationLedger({
  graph,
  contextTitle,
  onSelectEntity,
  state,
}: {
  graph: EntityRelationGraph | null;
  contextTitle?: string;
  onSelectEntity: (entityKey: string) => void;
  state: DetailState;
}) {
  const rootLabel = graph ? relationNodeLabel(graph, graph.rootEntityKey) : undefined;
  const hasOnlyVerifiedEdges = graph?.edges.every(isVerifiedRelationEdge) ?? true;
  const relationRef = useRef<HTMLElement>(null);
  useWorkspaceRelationCrossfade({
    scopeRef: relationRef,
    stateKey: `${state}:${graph?.rootEntityKey ?? 'none'}`,
  });
  return (
    <section
      ref={relationRef}
      className={`${styles.panel} ${styles.relationPanel}`}
      data-relation-motion="container"
      data-testid="relation-ledger"
    >
      <header className={styles.panelHeader}>
        <div>
          <h2>{rootLabel ? `${rootLabel} 관계` : '관계 경로'}</h2>
          <p>
            {contextTitle ? `${contextTitle} 대표 종목에서 시작` : '선택한 종목에서 시작'} · 사람이
            확인한 관계
          </p>
        </div>
        <GitBranch aria-hidden="true" />
      </header>
      {state === 'loading' && !graph ? (
        <WorkspaceState
          kind="loading"
          title="관계 지도를 불러오고 있습니다"
          description="선택한 테마의 대표 종목과 확인된 관계를 가져오는 중입니다."
        />
      ) : state === 'error' ? (
        <WorkspaceState
          kind="error"
          title="관계 지도를 불러오지 못했습니다"
          description="다른 테마를 선택하거나 잠시 후 다시 시도해 주세요."
        />
      ) : !graph ? (
        <WorkspaceState
          kind="empty"
          title="표시할 관계가 없습니다"
          description="테마의 대표 종목과 연결된 관계가 확인되면 이곳에 지도가 나타납니다."
        />
      ) : !hasOnlyVerifiedEdges ? (
        <WorkspaceState
          kind="error"
          title="검증되지 않은 관계가 포함되어 표시를 중단했습니다"
          description="관계 검증 상태를 다시 확인한 뒤 지도를 불러와 주세요."
        />
      ) : (
        <>
          {state === 'loading' ? (
            <p className={styles.relationUpdating} role="status">
              선택한 종목의 관계를 업데이트하고 있습니다.
            </p>
          ) : null}
          <div aria-busy={state === 'loading'}>
            <RelationSigmaGraph graph={graph} onSelectEntity={onSelectEntity} />
          </div>
          <details open className={styles.relationFallback}>
            <summary>관계를 텍스트로 보기</summary>
            <section className={styles.edgeList} aria-label="관계 근거 목록">
              {graph.edges.map((edge) => (
                <div key={edge.edgeId} data-direction={edge.direction}>
                  <span data-endpoint="from">{relationNodeLabel(graph, edge.from)}</span>
                  <span
                    className={styles.edgeDirection}
                    aria-label={
                      edge.direction === 'directed' ? '에서 대상으로' : '와 방향 없는 관계'
                    }
                  >
                    {edge.direction === 'directed' ? (
                      <ChevronRight aria-hidden="true" />
                    ) : (
                      <MoveHorizontal aria-hidden="true" />
                    )}
                  </span>
                  <span data-endpoint="to">{relationNodeLabel(graph, edge.to)}</span>
                  <small>
                    {relationTypeLabel(edge.relationType)} · {edge.evidenceCount}개 근거 ·{' '}
                    {confidenceLabel(edge.evidenceQuality)}
                  </small>
                </div>
              ))}
            </section>
          </details>
          <p className={styles.disclosure}>
            사람이 확인한 관계만 표시하며 새로운 연결을 임의로 추정하지 않습니다.{' '}
            {graph.evidenceSummary.limitation}
          </p>
        </>
      )}
    </section>
  );
}
