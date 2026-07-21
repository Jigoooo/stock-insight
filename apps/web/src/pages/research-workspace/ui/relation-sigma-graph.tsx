import { Minus, Plus, RotateCcw, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type Sigma from 'sigma';
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';

import styles from './research-workspace-page.module.css';

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
import { useMotionPreferences } from '@/shared/ui/motion/use-motion-preferences';
import { Button, IconButton } from '@/shared/ui/primitives';
import type { EntityRelationGraph } from '@stock-insight/contracts/research-workspace';

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
  onSelectEntity: (entityKey: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<RelationRenderer | null>(null);
  const graphRef = useRef<RelationGraphology | null>(null);
  const interactionRef = useRef<GraphInteractionState>({});
  const onSelectEntityRef = useRef(onSelectEntity);
  const pendingSelectionRef = useRef<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<string>();
  const [liveMessage, setLiveMessage] = useState('관계 지도를 탐색할 수 있습니다.');
  const suggestionId = useId();
  const descriptionId = useId();
  const { forcedColors, reducedMotion } = useMotionPreferences();
  const normalizeMotion = forcedColors || reducedMotion;

  const directedEdgeCount = source.edges.reduce(
    (count, edge) => (edge.direction === 'directed' ? count + 1 : count),
    0,
  );
  const undirectedEdgeCount = source.edges.length - directedEdgeCount;

  useEffect(() => {
    onSelectEntityRef.current = onSelectEntity;
  }, [onSelectEntity]);

  const refreshSelection = useCallback((selectedNode?: string) => {
    interactionRef.current.selectedNode = selectedNode;
    setSelectedNode(selectedNode);
    rendererRef.current?.refresh({ skipIndexation: true });
  }, []);

  function selectAndFocusNode(node: string) {
    const renderer = rendererRef.current;
    if (!renderer || !graphRef.current?.hasNode(node)) return;
    const fullLabel = graphRef.current.getNodeAttribute(node, 'fullLabel');
    setQuery(fullLabel);
    refreshSelection(node);
    focusRendererOnNode(renderer, node, normalizeMotion);
    pendingSelectionRef.current = node;
    setLiveMessage(`${fullLabel} 관계를 불러오는 중`);
    onSelectEntityRef.current(node);
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
    const renderer = rendererRef.current;
    if (!renderer) return;
    const camera = renderer.getCamera();
    const current = camera.getState();
    const ratio = Math.min(2.5, Math.max(0.35, current.ratio * multiplier));
    if (normalizeMotion) camera.setState({ ratio });
    else camera.animate({ ratio }, { duration: 260 });
  }

  function resetCamera() {
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

    let disposed = false;
    let ownedRenderer: RelationRenderer | null = null;
    let ownedGraph: RelationGraphology | null = null;
    const runtime = createRelationRuntimeCleanup();
    const release = () => {
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
        const fullLabel = graph.getNodeAttribute(node, 'fullLabel');
        setQuery(fullLabel);
        refreshSelection(node);
        focusRendererOnNode(renderer, node, normalizeMotion);
        pendingSelectionRef.current = node;
        setLiveMessage(`${fullLabel} 관계를 불러오는 중`);
        onSelectEntityRef.current(node);
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

      function refitCamera() {
        renderer.setCustomBBox(null);
        renderer.refresh();
        const camera = renderer.getCamera();
        if (normalizeMotion) camera.setState({ angle: 0, ratio: 1, x: 0.5, y: 0.5 });
        else camera.animatedReset({ duration: 360 });
      }

      function scheduleLayoutStop(delay: number, refit = false) {
        if (!layout) {
          if (refit) refitCamera();
          return;
        }
        runtime.setTimer(
          setTimeout(() => {
            layout.stop();
            if (refit) refitCamera();
          }, delay),
        );
      }

      if (!normalizeMotion) {
        layout?.start();
        // Only the initial force settle refits the camera to frame the fresh
        // layout. Per-gesture releases never refit (see handleUp).
        scheduleLayoutStop(1_400, true);
      }

      renderer.on('downNode', ({ node, event }) => {
        dragState = transitionRelationDrag(dragState, {
          type: 'down',
          node,
          x: event.x,
          y: event.y,
        }).state;
        graph.mergeNodeAttributes(node, { fixed: true, highlighted: true });
        setLiveMessage(`${graph.getNodeAttribute(node, 'fullLabel')} 이동 중`);
        if (!renderer.getCustomBBox()) renderer.setCustomBBox(renderer.getBBox());
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
        scheduleLayoutStop(650, false);
      };
      renderer.on('upNode', handleUp);
      renderer.on('upStage', handleUp);
    }

    void initialize().catch((error: unknown) => {
      release();
      if (!disposed) console.error('Failed to initialize relationship graph', error);
    });

    return () => {
      disposed = true;
      release();
    };
  }, [normalizeMotion, refreshSelection, source]);

  const matchingNodes = query.trim()
    ? source.nodes.filter(({ label }) =>
        label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )
    : source.nodes;

  return (
    <div className={styles.graphFrame} data-testid="relation-graph">
      <div className={styles.graphSearch} data-testid="relation-graph-search">
        <Search aria-hidden="true" />
        <input
          aria-label="관계 노드 검색"
          autoComplete="off"
          list={suggestionId}
          placeholder="종목 검색"
          value={query}
          onBlur={() => {
            if (!query) refreshSelection();
          }}
          onChange={(event) => {
            const nextQuery = event.currentTarget.value;
            setQuery(nextQuery);
            const exact = source.nodes.find(
              ({ label }) => label.toLocaleLowerCase() === nextQuery.trim().toLocaleLowerCase(),
            );
            refreshSelection(exact?.entityKey);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            const first = matchingNodes[0];
            if (!first) return;
            event.preventDefault();
            setQuery(first.label);
            selectAndFocusNode(first.entityKey);
          }}
        />
        <datalist id={suggestionId}>
          {source.nodes.map((node) => (
            <option key={node.entityKey} value={node.label}>
              {node.label} ({node.market})
            </option>
          ))}
        </datalist>
      </div>

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
      <p id={descriptionId} className={styles.srOnly}>
        기준 시각까지 사람이 확인한 관계 {source.edges.length}개. 검색이나 아래 노드 목록으로 키보드
        탐색할 수 있습니다.
      </p>
      <output
        className={styles.srOnly}
        aria-live="polite"
        data-testid="relation-interaction-status"
      >
        {liveMessage}
      </output>

      <div
        className={styles.graphControls}
        aria-label="관계 지도 카메라 제어"
        data-testid="relation-graph-controls"
      >
        <IconButton aria-label="확대" motion="quiet" onClick={() => zoom(0.72)}>
          <Plus aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="축소" motion="quiet" onClick={() => zoom(1.38)}>
          <Minus aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="관계 지도 원위치" motion="quiet" onClick={resetCamera}>
          <RotateCcw aria-hidden="true" />
        </IconButton>
      </div>

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
