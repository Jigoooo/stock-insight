import { ChevronRight, GitBranch } from 'lucide-react';
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
import { layoutRelationNodes } from '@/pages/research-workspace/model/relation-layout';
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
          state={relationState}
        />
      </div>
    </>
  );
}

function RelationLedger({
  graph,
  contextTitle,
  state,
}: {
  graph: EntityRelationGraph | null;
  contextTitle?: string;
  state: DetailState;
}) {
  const rootLabel = graph ? relationNodeLabel(graph, graph.rootEntityKey) : undefined;
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
      {state === 'loading' ? (
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
      ) : (
        <>
          <RelationGraphSvg graph={graph} />
          <details open className={styles.relationFallback}>
            <summary>관계를 텍스트로 보기</summary>
            <section className={styles.edgeList} aria-label="관계 근거 목록">
              {graph.edges.map((edge) => (
                <div key={edge.edgeId}>
                  <span>{relationNodeLabel(graph, edge.from)}</span>
                  <ChevronRight aria-hidden="true" />
                  <span>{relationNodeLabel(graph, edge.to)}</span>
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

function RelationGraphSvg({ graph }: { graph: EntityRelationGraph }) {
  const layout = layoutRelationNodes(graph.nodes, graph.rootEntityKey);
  const positions = new Map(layout.map((node) => [node.entityKey, node]));
  return (
    <div className={styles.graphFrame} data-testid="relation-graph">
      <svg
        viewBox="0 0 560 300"
        aria-label={`${relationNodeLabel(graph, graph.rootEntityKey)} 관계 지도`}
        aria-describedby="relation-graph-desc"
      >
        <desc id="relation-graph-desc">
          기준 시각까지 사람이 확인한 관계 {graph.edges.length}개
        </desc>
        <g className={styles.graphEdges}>
          {graph.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={edge.edgeId}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                strokeWidth={0.8 + edge.weight * 2.2}
                data-quality={edge.evidenceQuality}
              />
            );
          })}
        </g>
        <g className={styles.graphNodes}>
          {layout.map((node) => {
            const source = graph.nodes.find(({ entityKey }) => entityKey === node.entityKey);
            const isRoot = node.entityKey === graph.rootEntityKey;
            const shortLabel = node.label.length > 12 ? `${node.label.slice(0, 11)}…` : node.label;
            return (
              <g
                key={node.entityKey}
                transform={`translate(${node.x} ${node.y})`}
                data-root={isRoot}
                data-personal={
                  source?.holding ? 'holding' : source?.watched ? 'watched' : undefined
                }
              >
                <circle r={isRoot ? 21 : 14} />
                <text y={isRoot ? 34 : 27} textAnchor="middle">
                  {shortLabel}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
