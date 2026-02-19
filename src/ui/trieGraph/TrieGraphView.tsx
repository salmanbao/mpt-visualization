import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrieGraph, TrieGraphNode } from '../../mpt/types';
import type { SimulationStep } from '../../mpt/simulator';
import { KeyProgressRibbon } from '../components/KeyProgressRibbon';
import { buildRenderGraph, shortIdentifier } from './buildGraph';
import { computeDagreLayout } from './layout';

interface TrieGraphViewProps {
  graph: TrieGraph;
  activeNodeId?: string;
  changedNodeIds: string[];
  selectedNodeId?: string;
  currentStep?: SimulationStep;
  keyNibbles: number[];
  consumedCount: number;
  activeNibbleIndex?: number;
  learningMode: boolean;
  playing: boolean;
  onSelectNode: (node: TrieGraphNode) => void;
  onSelectNodeId?: (nodeId: string) => void;
  debugMode: boolean;
}

interface BranchDecision {
  nodeId?: string;
  index: number;
}

const LABEL_MAX = 30;

function fitLabel(text: string, max = LABEL_MAX): string {
  if (text.length <= max) {
    return text;
  }
  if (max < 7) {
    return `${text.slice(0, max)}...`;
  }
  const head = Math.ceil((max - 3) * 0.7);
  const tail = Math.floor((max - 3) * 0.3);
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function nodeFill(type: TrieGraphNode['type']): string {
  if (type === 'branch') return '#234854';
  if (type === 'extension') return '#51412f';
  return '#4a2946';
}

function inferBranchDecision(step?: SimulationStep): BranchDecision | undefined {
  if (!step) {
    return undefined;
  }
  const message = step.log ?? '';
  const match = message.match(/index\s+([0-9a-f])\b/i) ?? message.match(/@([0-9a-f])\b/i);
  if (!match) {
    return undefined;
  }
  if (step.activeNode?.type && step.activeNode.type !== 'branch' && !/branch/i.test(message)) {
    return undefined;
  }
  return {
    nodeId: step.activeNodeId,
    index: Number.parseInt(match[1], 16),
  };
}

interface ViewState {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function TrieGraphView(props: TrieGraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const [view, setView] = useState<ViewState>({ zoom: 1, offsetX: 40, offsetY: 24 });
  const [focusLock, setFocusLock] = useState(false);

  const renderGraph = useMemo(() => buildRenderGraph(props.graph), [props.graph]);
  const layout = useMemo(() => computeDagreLayout(renderGraph), [renderGraph]);
  const fallbackDecision = useMemo(() => inferBranchDecision(props.currentStep), [props.currentStep]);

  const fitView = useCallback(() => {
    const root = containerRef.current;
    if (!root || renderGraph.nodes.length === 0) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const padding = 40;
    const availableWidth = Math.max(1, rect.width - padding * 2);
    const availableHeight = Math.max(1, rect.height - padding * 2);
    const baseScale = Math.min(availableWidth / layout.bounds.width, availableHeight / layout.bounds.height);
    const zoom = clamp(baseScale, 0.25, 1.9);
    const offsetX = padding + (availableWidth - layout.bounds.width * zoom) / 2 - layout.bounds.minX * zoom;
    const offsetY = padding + (availableHeight - layout.bounds.height * zoom) / 2 - layout.bounds.minY * zoom;
    setView({ zoom, offsetX, offsetY });
  }, [layout.bounds.height, layout.bounds.minX, layout.bounds.minY, layout.bounds.width, renderGraph.nodes.length]);

  const centerOnNode = useCallback((nodeId: string): void => {
    const root = containerRef.current;
    const position = layout.positions[nodeId];
    if (!root || !position) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const nodeCenterX = position.x + position.width / 2;
    const nodeCenterY = position.y + position.height / 2;
    setView((prev) => ({
      ...prev,
      offsetX: rect.width / 2 - nodeCenterX * prev.zoom,
      offsetY: rect.height / 2 - nodeCenterY * prev.zoom,
    }));
  }, [layout.positions]);

  useEffect(() => {
    fitView();
  }, [fitView, layout.signature]);

  useEffect(() => {
    if (!focusLock || !props.playing || !props.activeNodeId) {
      return;
    }
    centerOnNode(props.activeNodeId);
  }, [centerOnNode, focusLock, props.activeNodeId, props.playing]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    dragRef.current = { x: event.clientX, y: event.clientY, active: true };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current.active) {
      return;
    }
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    dragRef.current = { x: event.clientX, y: event.clientY, active: true };
    setView((prev) => ({
      ...prev,
      offsetX: prev.offsetX + deltaX,
      offsetY: prev.offsetY + deltaY,
    }));
  };

  const onPointerUp = (): void => {
    dragRef.current.active = false;
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const root = containerRef.current;
    if (!root) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const pointX = event.clientX - rect.left;
    const pointY = event.clientY - rect.top;
    setView((prev) => {
      const factor = event.deltaY < 0 ? 1.12 : 0.89;
      const zoom = clamp(prev.zoom * factor, 0.22, 2.8);
      const worldX = (pointX - prev.offsetX) / prev.zoom;
      const worldY = (pointY - prev.offsetY) / prev.zoom;
      const offsetX = pointX - worldX * zoom;
      const offsetY = pointY - worldY * zoom;
      return { zoom, offsetX, offsetY };
    });
  };

  const positionedNodes = renderGraph.nodes.map((node) => {
    const position = layout.positions[node.id];
    return {
      ...node,
      x: position?.x ?? 0,
      y: position?.y ?? 0,
    };
  });

  const nodesById = useMemo(() => {
    const map = new Map<string, (typeof positionedNodes)[number]>();
    for (const node of positionedNodes) {
      map.set(node.id, node);
    }
    return map;
  }, [positionedNodes]);

  const changedSet = useMemo(() => new Set(props.changedNodeIds), [props.changedNodeIds]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Trie Visualization</h3>
        <div className="trie-head-controls">
          <span>Pan + zoom. Dagre layered layout.</span>
          <button type="button" className="mini-button" onClick={fitView}>
            Recenter
          </button>
          <label className="toggle">
            <input type="checkbox" checked={focusLock} onChange={(event) => setFocusLock(event.target.checked)} />
            Focus lock
          </label>
          <span className="trie-zoom-indicator">Zoom {(view.zoom * 100).toFixed(0)}%</span>
        </div>
      </div>

      {props.learningMode && (
        <>
          <KeyProgressRibbon
            fullKeyNibbles={props.keyNibbles}
            consumedCount={props.consumedCount}
            activeNibbleIndex={props.activeNibbleIndex}
          />
          <div className="trie-legend">
            <span><i className="legend-swatch legend-branch" /> Branch</span>
            <span><i className="legend-swatch legend-extension" /> Extension</span>
            <span><i className="legend-swatch legend-leaf" /> Leaf</span>
            <span><i className="legend-line legend-embedded" /> embedded edge</span>
            <span><i className="legend-line legend-hash" /> hash-ref edge</span>
            <span><i className="legend-cell legend-cell-used" /> used branch index</span>
          </div>
        </>
      )}

      {positionedNodes.length === 0 ? (
        <div className="panel-empty">Build a trie first to visualize nodes.</div>
      ) : (
        <div
          className="trie-canvas"
          ref={containerRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <svg width="100%" height="100%" role="img" aria-label="Trie graph">
            <g transform={`translate(${view.offsetX},${view.offsetY}) scale(${view.zoom})`}>
              {renderGraph.edges.map((edge) => {
                const from = nodesById.get(edge.source);
                const to = nodesById.get(edge.target);
                if (!from || !to) {
                  return null;
                }
                const x1 = from.x + from.width / 2;
                const y1 = from.y + from.height;
                const x2 = to.x + to.width / 2;
                const y2 = to.y;
                const bendY = y1 + Math.max(20, (y2 - y1) * 0.5);
                const labelX = (x1 + x2) / 2;
                const labelY = bendY - 6;
                const isActiveEdge = props.activeNodeId === edge.source || props.activeNodeId === edge.target;
                return (
                  <g key={edge.id} className={isActiveEdge ? 'edge-active' : ''}>
                    <path
                      d={`M ${x1} ${y1} L ${x1} ${bendY} L ${x2} ${bendY} L ${x2} ${y2}`}
                      className={`edge edge-${edge.refKind}`}
                    />
                    <text x={labelX} y={labelY} className="edge-label">
                      {edge.label}
                    </text>
                  </g>
                );
              })}

              {positionedNodes.map((node) => {
                const isActive = props.activeNodeId === node.id;
                const isChanged = changedSet.has(node.id);
                const isSelected = props.selectedNodeId === node.id;
                const showBranchGrid = node.source.type === 'branch' && !!node.branchMeta;
                const branchDecision = fallbackDecision;
                const decisionIndex =
                  (branchDecision?.nodeId === node.id ? branchDecision.index : undefined) ??
                  (props.activeNodeId === node.id ? props.activeNibbleIndex : undefined);
                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    className="trie-node"
                    onClick={() => props.onSelectNode(node.source)}
                  >
                    <title>{node.tooltip}</title>
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={10}
                      className={[
                        'node-box',
                        isActive ? 'node-active' : '',
                        isChanged ? 'node-changed' : '',
                        isSelected ? 'node-selected' : '',
                      ].join(' ')}
                      fill={nodeFill(node.source.type)}
                    />
                    <text x={12} y={22} className="node-title">
                      {fitLabel(node.title)}
                    </text>
                    <text x={12} y={42} className="node-subtitle">
                      {fitLabel(node.summary, 34)}
                    </text>
                    <text x={12} y={62} className="node-subtitle">
                      {fitLabel(node.detail, 34)}
                    </text>
                    {showBranchGrid ? (
                      <g transform="translate(12,72)">
                        {node.branchMeta!.children.map((child) => {
                          const col = child.index % 4;
                          const row = Math.floor(child.index / 4);
                          const x = col * 24;
                          const y = row * 24;
                          const chosen = decisionIndex === child.index;
                          const tooltip = child.present
                            ? [
                                `index: ${child.index.toString(16)}`,
                                `ref: ${child.refType ?? 'unknown'}`,
                                `target: ${child.targetId ? shortIdentifier(child.targetId) : '-'}`,
                              ].join('\n')
                            : `index: ${child.index.toString(16)}\nempty`;
                          return (
                            <g
                              key={`${node.id}-child-${child.index}`}
                              className={[
                                'branch-cell',
                                child.present ? 'branch-cell-used' : 'branch-cell-empty',
                                chosen ? 'branch-cell-current' : '',
                              ].join(' ')}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!child.present || !child.targetId) {
                                  return;
                                }
                                const target = nodesById.get(child.targetId);
                                if (target) {
                                  props.onSelectNode(target.source);
                                  return;
                                }
                                props.onSelectNodeId?.(child.targetId);
                              }}
                            >
                              <title>{tooltip}</title>
                              <rect x={x} y={y} width={20} height={20} rx={4} />
                              <text x={x + 10} y={y + 13} className="branch-cell-text">
                                {child.index.toString(16)}
                              </text>
                              {child.present && <circle cx={x + 16} cy={y + 4} r={2.2} className="branch-cell-dot" />}
                            </g>
                          );
                        })}
                      </g>
                    ) : (
                      <text x={12} y={84} className="node-subtitle">
                        {node.meta}
                      </text>
                    )}
                    {!showBranchGrid && props.debugMode && (
                      <text x={12} y={100} className="node-debug">
                        {fitLabel(node.id, 34)}
                      </text>
                    )}
                    {showBranchGrid && props.debugMode && (
                      <text x={12} y={170} className="node-debug">
                        {fitLabel(node.id, 34)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      )}
    </section>
  );
}
