import type { TrieGraph, TrieGraphNode } from '../mpt/types';
import type { SimulationStep } from '../mpt/simulator';
import type { LearningLens } from './types/learning';
import type { StepFrame } from './utils/stepViewModel';
import { TrieGraphView } from './trieGraph/TrieGraphView';

interface TriePanelProps {
  graph: TrieGraph;
  activeNodeId?: string;
  changedNodeIds: string[];
  selectedNodeId?: string;
  currentStep?: SimulationStep;
  keyNibbles: number[];
  consumedCount: number;
  activeNibblePosition?: number;
  decisionNibble?: number;
  learningMode: boolean;
  lens: LearningLens;
  stepFrame?: StepFrame;
  focusNodeIds: string[];
  focusEdgeIds: string[];
  pathOnlyFocusEnabled: boolean;
  playing: boolean;
  onSelectNode: (node: TrieGraphNode) => void;
  onSelectNodeId?: (nodeId: string) => void;
  debugMode: boolean;
}

export function TriePanel(props: TriePanelProps) {
  return <TrieGraphView {...props} />;
}
