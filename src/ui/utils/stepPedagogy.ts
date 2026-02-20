import type { SimulationStep } from '../../mpt/simulator';
import { bytesToHex, nibblesToString } from '../../mpt/bytes';
import { humanizeStepMessage } from './stepText';
import type { LearningLens } from '../types/learning';

export type ConceptType =
  | 'Traversal'
  | 'Branch Decision'
  | 'Node Finalization'
  | 'DB Read'
  | 'DB Write'
  | 'Root Commit'
  | 'Result'
  | 'Setup';

export type ProgressState = 'advance' | 'read-only' | 'rewrite' | 'result';

export interface StepImpact {
  trieChanged: boolean;
  dbChanged: boolean;
  rootChanged: boolean;
}

export interface RootTransition {
  beforeHex: string;
  afterHex: string;
  operationStartHex: string;
  changed: boolean;
}

export interface PedagogicalStep {
  index: number;
  step: SimulationStep;
  concept: ConceptType;
  whereLabel: string;
  whatText: string;
  whyText: string;
  conciseText: string;
  impact: StepImpact;
  progressState: ProgressState;
  activeNibbleIndex?: number;
  decisionNibble?: number;
  activeNibblePosition?: number;
  branchIndex?: number;
  consumedBefore: number;
  consumedAfter: number;
  consumedDelta: number;
  consumedCount: number;
  fullKeyNibbles: number[];
  remainingNibbles: number[];
  rootTransition: RootTransition;
  causalityChain: [string, string, string];
  relatedEntities: {
    nodeId?: string;
    dbKey?: string;
    branchIndex?: number;
  };
  refResolutionText?: string;
  encodingText?: string;
  referencedByActiveNode?: boolean;
  lensText: Record<LearningLens, string>;
}

interface NormalizedStep {
  consumedBefore: number;
  consumedAfter: number;
  consumedDelta: number;
  decisionNibble?: number;
  activeNibblePosition?: number;
  remainingNibbles: number[];
  rootTransition: RootTransition;
}

function toHexKey(bytes: Uint8Array): string {
  return bytesToHex(bytes);
}

function parseBranchIndex(message: string): number | undefined {
  const match = message.match(/index\s+([0-9a-f])\b/i) ?? message.match(/@([0-9a-f])\b/i);
  if (!match) {
    return undefined;
  }
  return Number.parseInt(match[1], 16);
}

function inferConcept(step: SimulationStep, branchIndex?: number): ConceptType {
  const title = step.title.toLowerCase();
  const message = step.log.toLowerCase();
  if (step.dbAction === 'GET') {
    return step.cacheHit ? 'Traversal' : 'DB Read';
  }
  if (step.dbAction === 'PUT') {
    return 'DB Write';
  }
  if (title.includes('root') || message.includes('root')) {
    return 'Root Commit';
  }
  if (
    title.includes('build start') ||
    title.includes('insert account') ||
    title.includes('lookup start') ||
    title.includes('update start')
  ) {
    return 'Setup';
  }
  if (title.includes('result') || message.includes('found') || message.includes('mismatch') || message.includes('complete')) {
    return 'Result';
  }
  if (message.includes('finalize') || title.includes('finalize')) {
    return 'Node Finalization';
  }
  if (branchIndex !== undefined || message.includes('branch index')) {
    return 'Branch Decision';
  }
  return 'Traversal';
}

function inferProgressState(step: SimulationStep, concept: ConceptType): ProgressState {
  if (concept === 'Result') {
    return 'result';
  }
  if (step.changedNodeIds.length > 0 || step.dbAction === 'PUT' || concept === 'Node Finalization' || concept === 'Root Commit') {
    return 'rewrite';
  }
  if (step.consumed > 0 || concept === 'Branch Decision' || concept === 'Traversal') {
    return 'advance';
  }
  return 'read-only';
}

function buildWhereLabel(step: SimulationStep, insertOrdinal: number, lookupOrdinal: number, updateOrdinal: number): string {
  if (step.mode === 'insert') {
    return insertOrdinal > 0 ? `Insert #${insertOrdinal}` : 'Insert';
  }
  if (step.mode === 'lookup') {
    return lookupOrdinal > 0 ? `Lookup #${lookupOrdinal}` : 'Lookup';
  }
  return updateOrdinal > 0 ? `Update #${updateOrdinal}` : 'Update';
}

function buildWhyText(step: SimulationStep, concept: ConceptType, decisionNibble?: number): string {
  if (concept === 'DB Read') {
    return step.cacheHit
      ? 'The node reference was already cached, so no database read was needed.'
      : 'A hash reference must be resolved by fetching node RLP from the KV database.';
  }
  if (concept === 'DB Write') {
    return 'The node RLP is at least 32 bytes, so the parent stores a hash and DB persists hash -> RLP.';
  }
  if (concept === 'Node Finalization') {
    if (step.activeNode?.refKind === 'embedded') {
      return 'The encoded node is short enough to embed directly in the parent node.';
    }
    return 'Path updates finalized this node, yielding a new content-addressed hash reference.';
  }
  if (concept === 'Branch Decision') {
    return `Traversal consumes nibble ${decisionNibble?.toString(16) ?? '?'} to choose the branch child.`;
  }
  if (concept === 'Root Commit') {
    return 'Rewriting any node on the key path changes the root commitment to full state.';
  }
  if (concept === 'Result') {
    return 'Traversal reached a terminal match/mismatch condition and produced a result.';
  }
  if (concept === 'Setup') {
    return 'This step initializes operation context before traversal and persistence steps.';
  }
  return 'Traversal follows key nibbles through branch, extension, and leaf path checks.';
}

function buildWhatText(step: SimulationStep, concept: ConceptType): string {
  if (concept === 'DB Read' && step.dbAction === 'GET') {
    return step.cacheHit ? 'Resolve hash reference from cache' : 'DB GET by hash reference';
  }
  if (concept === 'DB Write') {
    return 'Persist node encoding: DB PUT hash -> RLP';
  }
  return humanizeStepMessage(step.log);
}

function buildRefResolutionText(step: SimulationStep): string | undefined {
  if (step.activeNode?.refKind === 'hash-ref') {
    return 'Child ref resolves via hash-ref';
  }
  if (step.activeNode?.refKind === 'embedded') {
    return 'Child ref resolves via embedded RLP';
  }
  return undefined;
}

function buildEncodingText(step: SimulationStep): string | undefined {
  if (!step.log.toLowerCase().includes('finalize')) {
    return undefined;
  }
  const refKind = step.activeNode?.refKind === 'embedded' ? 'embedded' : 'hashed';
  const dbWrite = step.dbAction === 'PUT' ? 'yes' : 'no';
  return `Node encoded -> ${refKind} -> DB write ${dbWrite}`;
}

function isReferencedByActiveNode(step: SimulationStep): boolean {
  const key = step.highlightedDbKey;
  if (!key || !step.activeNode) {
    return false;
  }
  if (step.activeNode.hashHex === key || step.activeNode.refHex === key) {
    return true;
  }
  return (step.activeNode.branchChildren ?? []).some((child) => child.refHex === key);
}

function buildLensText(
  step: SimulationStep,
  concept: ConceptType,
  whatText: string,
  whyText: string,
  consumedBefore: number,
  consumedAfter: number,
): Record<LearningLens, string> {
  const hasNodeRef = !!(step.activeNodeId ?? step.activeNode?.hashHex ?? step.activeNode?.refHex);
  const hasDbRef = !!step.highlightedDbKey;
  return {
    foundational: `${concept}. ${whyText}`,
    developer: `${concept}. ${whatText}. Consumed ${consumedBefore} -> ${consumedAfter}.`,
    researcher: `${concept}. ${whatText}. nodeRef=${hasNodeRef ? 'present' : 'none'} dbRef=${hasDbRef ? 'present' : 'none'} consumed=${consumedBefore}->${consumedAfter}`,
  };
}

function isOperationStartStep(step: SimulationStep): boolean {
  const title = step.title.toUpperCase();
  if (title.includes('LOOKUP START') || title.includes('UPDATE START') || title.includes('BUILD START')) {
    return true;
  }
  if (step.mode === 'insert' && title.includes('INSERT ACCOUNT')) {
    return true;
  }
  return false;
}

export function normalizeStepForUi(
  step: SimulationStep,
  prev: SimulationStep | undefined,
  fullKeyNibbles: number[],
  operationStartRootHex: string,
): NormalizedStep {
  const remainingNibbles = [...step.keyNibbles];
  const consumedFromLengths = fullKeyNibbles.length > 0 ? Math.max(0, fullKeyNibbles.length - remainingNibbles.length) : 0;
  const consumedAfter = Math.max(step.consumed, consumedFromLengths);
  const prevConsumedRaw = prev
    ? Math.max(prev.consumed, fullKeyNibbles.length > 0 ? Math.max(0, fullKeyNibbles.length - prev.keyNibbles.length) : 0)
    : 0;
  const consumedDelta = Math.max(0, consumedAfter - prevConsumedRaw);
  const consumedBefore = Math.max(0, consumedAfter - consumedDelta);

  const explicitNibble = parseBranchIndex(step.log);
  const derivedDecisionNibble =
    explicitNibble !== undefined
      ? explicitNibble
      : consumedDelta > 0 && consumedAfter > 0 && consumedAfter - 1 < fullKeyNibbles.length
        ? fullKeyNibbles[consumedAfter - 1]
        : undefined;

  const activeNibblePosition =
    derivedDecisionNibble !== undefined && consumedAfter > 0
      ? consumedAfter - 1
      : consumedAfter < fullKeyNibbles.length
        ? consumedAfter
        : undefined;

  const beforeHex = prev ? toHexKey(prev.rootRef) : operationStartRootHex;
  const afterHex = toHexKey(step.rootRef);

  return {
    consumedBefore,
    consumedAfter,
    consumedDelta,
    decisionNibble: derivedDecisionNibble,
    activeNibblePosition,
    remainingNibbles,
    rootTransition: {
      beforeHex,
      afterHex,
      operationStartHex: operationStartRootHex,
      changed: beforeHex !== afterHex,
    },
  };
}

export function buildPedagogicalSteps(steps: SimulationStep[]): PedagogicalStep[] {
  const out: PedagogicalStep[] = [];
  let insertOrdinal = 0;
  let lookupOrdinal = 0;
  let updateOrdinal = 0;
  let fullKey: number[] = [];
  let operationStartRootHex = steps.length > 0 ? toHexKey(steps[0].rootRef) : '0x';

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const prev = index > 0 ? steps[index - 1] : undefined;
    const titleUpper = step.title.toUpperCase();

    if (isOperationStartStep(step)) {
      operationStartRootHex = toHexKey(step.rootRef);
    }

    if (titleUpper.includes('INSERT ACCOUNT') || titleUpper.includes('BUILD START')) {
      if (titleUpper.includes('INSERT ACCOUNT')) {
        insertOrdinal += 1;
      }
      if (step.keyNibbles.length > 0) {
        fullKey = [...step.keyNibbles];
      }
    } else if (titleUpper.includes('LOOKUP START')) {
      lookupOrdinal += 1;
      if (step.keyNibbles.length > 0) {
        fullKey = [...step.keyNibbles];
      }
    } else if (titleUpper.includes('UPDATE START')) {
      updateOrdinal += 1;
      if (step.keyNibbles.length > 0) {
        fullKey = [...step.keyNibbles];
      }
    } else if (fullKey.length === 0 && step.keyNibbles.length > 0) {
      fullKey = [...step.keyNibbles];
    }

    const normalized = normalizeStepForUi(step, prev, fullKey, operationStartRootHex);
    const concept = inferConcept(step, normalized.decisionNibble);
    const impact: StepImpact = {
      trieChanged: step.changedNodeIds.length > 0 || concept === 'Node Finalization',
      dbChanged: step.dbAction === 'PUT' || concept === 'DB Write',
      rootChanged: normalized.rootTransition.changed,
    };

    const whereLabel = buildWhereLabel(step, insertOrdinal, lookupOrdinal, updateOrdinal);
    const whatText = buildWhatText(step, concept);
    const whyText = buildWhyText(step, concept, normalized.decisionNibble);
    const conciseText = `${concept}: ${whatText}`;
    const progressState = inferProgressState(step, concept);

    const causalityChain: [string, string, string] = [
      `Why: ${whyText}`,
      `Mechanism: ${step.activeNode?.type ?? 'node'} ${step.activeNode?.refKind ?? 'ref'}${
        normalized.decisionNibble !== undefined ? ` @${normalized.decisionNibble.toString(16)}` : ''
      }`,
      `Persistence: ${impact.dbChanged ? 'DB changed' : 'DB stable'} | ${impact.rootChanged ? 'root changed' : 'root stable'}`,
    ];

    out.push({
      index,
      step,
      concept,
      whereLabel,
      whatText,
      whyText,
      conciseText,
      impact,
      progressState,
      activeNibbleIndex: normalized.decisionNibble,
      decisionNibble: normalized.decisionNibble,
      activeNibblePosition: normalized.activeNibblePosition,
      branchIndex: normalized.decisionNibble,
      consumedBefore: normalized.consumedBefore,
      consumedAfter: normalized.consumedAfter,
      consumedDelta: normalized.consumedDelta,
      consumedCount: normalized.consumedAfter,
      fullKeyNibbles: [...fullKey],
      remainingNibbles: normalized.remainingNibbles,
      rootTransition: normalized.rootTransition,
      causalityChain,
      relatedEntities: {
        nodeId: step.activeNodeId,
        dbKey: step.highlightedDbKey,
        branchIndex: normalized.decisionNibble,
      },
      refResolutionText: buildRefResolutionText(step),
      encodingText: buildEncodingText(step),
      referencedByActiveNode: isReferencedByActiveNode(step),
      lensText: buildLensText(
        step,
        concept,
        whatText,
        whyText,
        normalized.consumedBefore,
        normalized.consumedAfter,
      ),
    });
  }

  return out;
}

export function formatNibbleArray(nibbles: number[]): string {
  return nibblesToString(nibbles);
}


