import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type Sigma from 'sigma';
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';

import styles from './relation-detail.module.css';

import {
  buildRelationGraph,
  type RelationGraphEdgeAttributes,
  type RelationGraphNodeAttributes,
  type RelationGraphology,
} from '@/pages/research-workspace/model/relation-graphology';
import {
  createRelationDragState,
  createRelationRuntimeCleanup,
  transitionRelationDrag,
} from '@/pages/research-workspace/model/relation-sigma-runtime';
import { Button, IconButton } from '@/shared/ui/button';
import { ButtonGroup } from '@/shared/ui/button-group';
import { Combobox } from '@/shared/ui/combobox';
import { ErrorState } from '@/shared/ui/feedback';
import { useMotionPreferences } from '@/shared/ui/motion';
import { TruthLegend, truthBindingForContentPackItem } from '@/shared/ui/truth';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

/**
 * 관계 지도의 간선이 어떤 종류의 진술인가 — `REQ-SEM-010`.
 *
 * `buildRelationGraph()` 는 검증되지 않은 간선에서 던지므로 **그려지는 간선은
 * 전부 하나의 종류**(085 의 `relation` → RELATION)다. 그래서 간선마다 스타일을
 * 나누지 않는다 — 존재하지 않는 구분을 그리는 일이고, sigma 에서 파선을 그리려면
 * 커스텀 edge program 이 필요한데 그 값을 치를 구분이 여기엔 없다. 구분은 이
 * 화면과 다른 화면 사이에 있고, 그래서 표시는 범례 한 줄이다.
 *
 * ⚠️ `epistemicClassForTruthClass('RELATION')` 은 null 이다. RELATION 은 겹치는
 * 다섯 클래스에 들지 않아 `resolveEdgeRenderSpec()` 경로로는 닿을 수 없고,
 * 진술 종류 스펙을 직접 쓴다.
 */
const RELATION_TRUTH = truthBindingForContentPackItem('relation');
const RELATION_BASIS =
  '기준 시각까지 사람이 확인한 관계만 그립니다. 추론된 연결은 이 지도에 들어오지 않습니다.';

type RelationRenderer = Sigma<
  RelationGraphNodeAttributes,
  RelationGraphEdgeAttributes,
  Record<string, never>
>;

type GraphInteractionState = {
  hoveredNode?: string;
  hoveredNeighbors?: Set<string>;
  selectedNode?: string;
};

type RelationRuntimeState = 'initializing' | 'ready' | 'error';

function focusRendererOnNode(renderer: RelationRenderer, node: string, normalizeMotion: boolean) {
  const position = renderer.getNodeDisplayData(node);
  if (!position) return;
  const camera = renderer.getCamera();
  const current = camera.getState();
  const target = {
    x: position.x,
    y: position.y,
    ratio: Math.min(current.ratio, 0.72),
  };
  if (normalizeMotion) camera.setState(target);
  else camera.animate(target, { duration: 380 });
}

function relationRootLabel(source: EntityRelationGraph): string {
  return (
    source.nodes.find(({ entityKey }) => entityKey === source.rootEntityKey)?.label ?? '선택 종목'
  );
}

export function RelationSigmaGraph({
  graph: source,
  onSelectEntity,
}: {
  graph: EntityRelationGraph;
  onSelectEntity?: (entityKey: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RelationRenderer | null>(null);
  const graphRef = useRef<RelationGraphology | null>(null);
  const interactionRef = useRef<GraphInteractionState>({});
  const onSelectEntityRef = useRef(onSelectEntity);
  const pendingSelectionRef = useRef<string | null>(null);
  const cancelAutomatedLayoutRef = useRef<() => void>(() => undefined);
  const [query, setQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<string>();
  const [liveMessage, setLiveMessage] = useState('관계 지도를 탐색할 수 있습니다.');
  const [runtimeState, setRuntimeState] = useState<RelationRuntimeState>('initializing');
  const [runtimeRevision, setRuntimeRevision] = useState(0);
  const descriptionId = useId();
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = forcedColors || reducedMotion;

  const directedEdgeCount = source.edges.reduce(
    (count, edge) => (edge.direction === 'directed' ? count + 1 : count),
    0,
  );
  const undirectedEdgeCount = source.edges.length - directedEdgeCount;
  const searchOptions = useMemo(
    () =>
      source.nodes.map((node) => ({
        description: node.market,
        label: node.label,
        value: node.entityKey,
      })),
    [source.nodes],
  );

  useEffect(() => {
    onSelectEntityRef.current = onSelectEntity;
  }, [onSelectEntity]);

  const refreshSelection = useCallback((selectedNode?: string) => {
    interactionRef.current.selectedNode = selectedNode;
    setSelectedNode(selectedNode);
    rendererRef.current?.refresh({ skipIndexation: true });
  }, []);

  const announceSelection = useCallback((node: string, fullLabel: string) => {
    const handler = onSelectEntityRef.current;
    if (!handler) {
      pendingSelectionRef.current = null;
      setLiveMessage(`${fullLabel} 관계를 선택했습니다`);
      return;
    }
    pendingSelectionRef.current = node;
    setLiveMessage(`${fullLabel} 관계를 불러오는 중`);
    handler(node);
  }, []);

  function selectAndFocusNode(node: string) {
    cancelAutomatedLayoutRef.current();
    const renderer = rendererRef.current;
    const sourceNode = source.nodes.find(({ entityKey }) => entityKey === node);
    if (!sourceNode) return;
    const graph = graphRef.current;
    const fullLabel = graph?.hasNode(node)
      ? graph.getNodeAttribute(node, 'fullLabel')
      : sourceNode.label;
    setQuery(fullLabel);
    refreshSelection(node);
    if (renderer && graph?.hasNode(node)) focusRendererOnNode(renderer, node, normalizeMotion);
    announceSelection(node, fullLabel);
  }

  useEffect(() => {
    // A new source means the previously requested selection has resolved. Move
    // the ARIA live region out of its "불러오는 중" holding state so assistive
    // tech hears completion instead of a stuck loading announcement.
    if (pendingSelectionRef.current) {
      pendingSelectionRef.current = null;
      setLiveMessage(`${relationRootLabel(source)} 관계를 표시했습니다`);
    }
    const currentSelection = interactionRef.current.selectedNode;
    if (currentSelection && source.nodes.some(({ entityKey }) => entityKey === currentSelection)) {
      return;
    }
    interactionRef.current.selectedNode = undefined;
    setSelectedNode(undefined);
    setQuery((currentQuery) =>
      source.nodes.some(({ label }) => label === currentQuery) ? currentQuery : '',
    );
  }, [source]);

  function zoom(multiplier: number) {
    cancelAutomatedLayoutRef.current();
    const renderer = rendererRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    const current = camera.getState();
    const ratio = Math.min(2.5, Math.max(0.35, current.ratio * multiplier));
    if (normalizeMotion) camera.setState({ ratio });
    else camera.animate({ ratio }, { duration: 260 });
  }

  function resetCamera() {
    cancelAutomatedLayoutRef.current();
    const renderer = rendererRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    if (normalizeMotion) camera.setState({ angle: 0, ratio: 1, x: 0.5, y: 0.5 });
    else camera.animatedReset({ duration: 420 });
    setLiveMessage('관계 지도를 처음 위치로 되돌렸습니다');
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const mountTarget: HTMLElement = container;
    setRuntimeState('initializing');

    let disposed = false;
    let ownedRenderer: RelationRenderer | null = null;
    let ownedGraph: RelationGraphology | null = null;
    const runtime = createRelationRuntimeCleanup();
    const release = () => {
      cancelAutomatedLayoutRef.current = () => undefined;
      runtime.cleanup();
      if (rendererRef.current === ownedRenderer) rendererRef.current = null;
      if (graphRef.current === ownedGraph) {
        graphRef.current = null;
      }
    };

    async function initialize() {
      const [{ default: SigmaRuntime }, { default: FA2LayoutRuntime }] = await Promise.all([
        import('sigma'),
        import('graphology-layout-forceatlas2/worker'),
      ]);
      if (disposed) return;

      const graph = buildRelationGraph(source);
      mountTarget.dataset.customBbox = 'released';
      ownedGraph = graph;
      graphRef.current = graph;
      // Stamp the canvas with the exact directed/undirected edge counts the
      // renderer consumes (arrow vs line program). This ties the WebGL render
      // path — not just the text fallback — to an observable directedness proof.
      let directedEdges = 0;
      let undirectedEdges = 0;
      graph.forEachEdge((_edge, attributes) => {
        if (attributes.type === 'arrow') directedEdges += 1;
        else undirectedEdges += 1;
      });
      mountTarget.dataset.directedEdges = String(directedEdges);
      mountTarget.dataset.undirectedEdges = String(undirectedEdges);
      const currentSelection = interactionRef.current.selectedNode;
      interactionRef.current =
        currentSelection && graph.hasNode(currentSelection)
          ? { selectedNode: currentSelection }
          : {};

      const renderer: RelationRenderer = new SigmaRuntime(graph, mountTarget, {
        defaultEdgeColor: '#aab2bf',
        defaultEdgeType: 'line',
        defaultNodeColor: '#ffffff',
        enableEdgeEvents: false,
        labelColor: { color: '#445064' },
        labelDensity: 0.08,
        labelFont: 'Pretendard, SUIT, "Noto Sans KR", sans-serif',
        labelRenderedSizeThreshold: 10.5,
        maxCameraRatio: 2.5,
        minCameraRatio: 0.35,
        renderEdgeLabels: false,
        stagePadding: mountTarget.clientWidth < 520 ? 68 : 52,
        zIndex: true,
      });
      ownedRenderer = renderer;
      runtime.setRenderer(renderer);
      rendererRef.current = renderer;

      renderer.setSetting('nodeReducer', (node, data) => {
        const result: Partial<NodeDisplayData> = { ...data };
        const { hoveredNeighbors, hoveredNode, selectedNode } = interactionRef.current;
        if (hoveredNode && hoveredNode !== node) {
          result.label = '';
          if (!hoveredNeighbors?.has(node)) result.color = '#e7eaf0';
        }
        if (selectedNode === node) {
          result.forceLabel = true;
          result.size = data.size * 1.12;
          result.zIndex = 2;
        }
        return result;
      });
      renderer.setSetting('edgeReducer', (edge, data) => {
        const result: Partial<EdgeDisplayData> = { ...data };
        const { hoveredNode } = interactionRef.current;
        if (hoveredNode) {
          const [sourceNode, targetNode] = graph.extremities(edge);
          const connected = sourceNode === hoveredNode || targetNode === hoveredNode;
          if (!connected) result.hidden = true;
          else {
            result.color = '#3155c6';
            result.size = Math.max(1.1, data.size * 1.7);
          }
        }
        return result;
      });

      function setHoveredNode(node?: string) {
        interactionRef.current.hoveredNode = node;
        interactionRef.current.hoveredNeighbors = node ? new Set(graph.neighbors(node)) : undefined;
        if (node) setLiveMessage(`${graph.getNodeAttribute(node, 'fullLabel')} 연결 관계 강조`);
        renderer.refresh({ skipIndexation: true });
      }

      renderer.on('enterNode', ({ node }) => setHoveredNode(node));
      renderer.on('leaveNode', () => setHoveredNode());
      let dragState = createRelationDragState();
      renderer.on('clickNode', ({ node }) => {
        const transition = transitionRelationDrag(dragState, { type: 'click' });
        dragState = transition.state;
        if (transition.suppressClick) return;
        cancelAutomatedLayoutRef.current();
        const fullLabel = graph.getNodeAttribute(node, 'fullLabel');
        setQuery(fullLabel);
        refreshSelection(node);
        focusRendererOnNode(renderer, node, normalizeMotion);
        announceSelection(node, fullLabel);
      });

      const layout = !normalizeMotion
        ? new FA2LayoutRuntime<RelationGraphNodeAttributes, RelationGraphEdgeAttributes>(graph, {
            getEdgeWeight: 'weight',
            settings: {
              adjustSizes: true,
              barnesHutOptimize: graph.order > 12,
              edgeWeightInfluence: 0.35,
              gravity: 0.45,
              linLogMode: true,
              outboundAttractionDistribution: true,
              scalingRatio: 12,
              slowDown: 8,
              strongGravityMode: false,
            },
          })
        : null;
      runtime.setLayout(layout);
      const cancelAutomatedLayout = () => {
        runtime.clearTimer();
        layout?.stop();
      };
      cancelAutomatedLayoutRef.current = cancelAutomatedLayout;

      function refitCamera() {
        renderer.setCustomBBox(null);
        renderer.refresh();
        const camera = renderer.getCamera();
        camera.setState({ angle: 0, ratio: 1, x: 0.5, y: 0.5 });
      }

      function releaseCustomBBox() {
        renderer.setCustomBBox(null);
        mountTarget.dataset.customBbox = 'released';
        renderer.refresh();
      }

      function scheduleLayoutStop(delay: number, refit = false, releaseBBox = false) {
        if (!layout) {
          if (refit) refitCamera();
          else if (releaseBBox) releaseCustomBBox();
          return;
        }
        const nextTimer = setTimeout(() => {
          layout.stop();
          if (refit) refitCamera();
          else if (releaseBBox) releaseCustomBBox();
        }, delay);
        if (releaseBBox) runtime.setBBoxTimer(nextTimer);
        else runtime.setTimer(nextTimer);
      }

      if (!normalizeMotion) {
        layout?.start();
        // Only the initial force settle refits the camera to frame the fresh
        // layout. Per-gesture releases never refit (see handleUp).
        scheduleLayoutStop(1_400, true);
      }

      renderer.on('downStage', cancelAutomatedLayout);
      renderer.on('wheelStage', cancelAutomatedLayout);
      renderer.on('downNode', ({ node, event }) => {
        runtime.clearTimer();
        runtime.clearBBoxTimer();
        dragState = transitionRelationDrag(dragState, {
          type: 'down',
          node,
          x: event.x,
          y: event.y,
        }).state;
        graph.mergeNodeAttributes(node, { fixed: true, highlighted: true });
        setLiveMessage(`${graph.getNodeAttribute(node, 'fullLabel')} 이동 중`);
        if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox());
        mountTarget.dataset.customBbox = 'fixed';
        layout?.start();
      });
      renderer.on('moveBody', ({ event }) => {
        const draggedNode = dragState.activeNode;
        if (!draggedNode) return;
        const transition = transitionRelationDrag(dragState, {
          type: 'move',
          x: event.x,
          y: event.y,
        });
        dragState = transition.state;
        // A sub-threshold jitter frame is not a drag: leave the node and native
        // gesture untouched so the release is still classified as a click.
        if (!transition.moved) return;
        const position = renderer.viewportToGraph(event);
        graph.mergeNodeAttributes(draggedNode, { x: position.x, y: position.y });
        event.preventSigmaDefault();
        event.original.preventDefault();
        event.original.stopPropagation();
      });
      const handleUp = () => {
        const transition = transitionRelationDrag(dragState, { type: 'up' });
        dragState = transition.state;
        if (!transition.completedNode) return;
        if (graph.hasNode(transition.completedNode)) {
          const isRoot = graph.getNodeAttribute(transition.completedNode, 'isRoot');
          graph.mergeNodeAttributes(transition.completedNode, {
            fixed: isRoot,
            highlighted: false,
          });
        }
        if (transition.moved) {
          setLiveMessage('관계 노드 배치 조정 완료');
          runtime.trackTimer(
            setTimeout(() => {
              dragState = transitionRelationDrag(dragState, {
                type: 'expire-click-suppression',
              }).state;
            }, 0),
          );
        }
        // Settle the worker after the node is pinned, but never reset the camera
        // on a gesture — that would yank away the focus/pan the user just set.
        // Camera reset stays user-initiated through the "원위치" control only.
        scheduleLayoutStop(650, false, true);
      };
      renderer.on('upNode', handleUp);
      renderer.on('upStage', handleUp);
      if (!disposed) setRuntimeState('ready');
    }

    void initialize().catch((error: unknown) => {
      release();
      if (!disposed) {
        setRuntimeState('error');
        console.error('Failed to initialize relationship graph', error);
      }
    });

    return () => {
      disposed = true;
      release();
    };
  }, [announceSelection, normalizeMotion, refreshSelection, runtimeRevision, source]);

  return (
    <div
      className={styles.graphFrame}
      data-runtime-state={runtimeState}
      data-testid="relation-graph"
    >
      <div className={styles.graphSearch} data-testid="relation-graph-search">
        <Combobox
          aria-label="관계 노드 검색"
          density="compact"
          options={searchOptions}
          placeholder="종목 검색"
          query={query}
          value={selectedNode ?? ''}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery);
            const exact = source.nodes.find(
              ({ label }) => label.toLocaleLowerCase() === nextQuery.trim().toLocaleLowerCase(),
            );
            refreshSelection(exact?.entityKey);
          }}
          onValueChange={(entityKey) => {
            if (entityKey) selectAndFocusNode(entityKey);
          }}
        />
      </div>

      {runtimeState === 'error' && (
        <ErrorState className={styles.graphRuntimeError} aria-atomic="true">
          <strong>관계 지도를 표시하지 못했습니다</strong>
          <p>텍스트 노드 목록은 계속 사용할 수 있습니다.</p>
          <Button
            motion="quiet"
            variant="secondary"
            onClick={() => setRuntimeRevision((value) => value + 1)}
          >
            관계 지도 다시 시도
          </Button>
        </ErrorState>
      )}

      <section
        ref={containerRef}
        className={styles.sigmaCanvas}
        data-layout-mode={normalizeMotion ? 'static' : 'force'}
        data-root-entity={source.rootEntityKey}
        data-directed-edges={directedEdgeCount}
        data-undirected-edges={undirectedEdgeCount}
        aria-label={`${relationRootLabel(source)} 관계 지도`}
        aria-describedby={descriptionId}
      />
      <p id={descriptionId} className={styles.relationSrOnly}>
        기준 시각까지 사람이 확인한 관계 {source.edges.length}개. 검색이나 아래 노드 목록으로 키보드
        탐색할 수 있습니다.
      </p>
      <output
        className={styles.relationSrOnly}
        aria-live="polite"
        data-testid="relation-interaction-status"
      >
        {liveMessage}
      </output>

      <ButtonGroup
        className={styles.graphControls}
        aria-label="관계 지도 카메라 제어"
        data-testid="relation-graph-controls"
        variant="inset"
      >
        <IconButton aria-label="확대" motion="quiet" onClick={() => zoom(0.72)}>
          <Plus aria-hidden="true" size={16} />
        </IconButton>
        <IconButton aria-label="축소" motion="quiet" onClick={() => zoom(1.38)}>
          <Minus aria-hidden="true" size={16} />
        </IconButton>
        <IconButton aria-label="관계 지도 원위치" motion="quiet" onClick={resetCamera}>
          <RotateCcw aria-hidden="true" size={16} />
        </IconButton>
      </ButtonGroup>

      <TruthLegend
        entries={[
          {
            basis: RELATION_BASIS,
            binding: RELATION_TRUTH,
            itemCount: source.edges.length,
          },
        ]}
        title="이 지도가 그리는 것"
      />

      <nav className={styles.graphNodeList} aria-label="관계 노드 목록">
        {source.nodes.map((node) => (
          <Button
            key={node.entityKey}
            type="button"
            motion="quiet"
            aria-current={selectedNode === node.entityKey ? 'true' : undefined}
            onClick={() => {
              setQuery(node.label);
              selectAndFocusNode(node.entityKey);
            }}
          >
            <span>{node.label}</span>
            <small>{node.market}</small>
          </Button>
        ))}
      </nav>
    </div>
  );
}
