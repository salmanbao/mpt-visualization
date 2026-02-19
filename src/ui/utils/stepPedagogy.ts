import type { SimulationStep } from '../../mpt/simulator';
import { bytesToHex, nibblesToString } from '../../mpt/bytes';

export type ConceptType =
  | 'Traversal'
  | 'Branch Decision'
  | 'Node Finalization'
  | 'DB Read'
  | 'DB Write'
  | 'Root Commit'
  | 'Result'
  | 'Setup';

export interface StepImpact {
  trieChanged: boolean;
  dbChanged: boolean;
  rootChanged: boolean;
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
  activeNibbleIndex?: number;
  branchIndex?: number;
  consumedDelta: number;
  consumedCount: number;
  fullKeyNibbles: number[];
  remainingNibbles: number[];
  relatedEntities: {
    nodeId?: string;
    dbKey?: string;
    branchIndex?: number;
  };
  refResolutionText?: string;
  encodingText?: string;
  referencedByActiveNode?: boolean;
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
  if (title.includes('build start') || title.includes('insert account') || title.includes('lookup start') || title.includes('update start')) {
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

function buildWhereLabel(step: SimulationStep, insertOrdinal: number, lookupOrdinal: number, updateOrdinal: number): string {
  if (step.mode === 'insert') {
    return insertOrdinal > 0 ? `Insert #${insertOrdinal}` : 'Insert';
  }
  if (step.mode === 'lookup') {
    return lookupOrdinal > 0 ? `Lookup #${lookupOrdinal}` : 'Lookup';
  }
  return updateOrdinal > 0 ? `Update #${updateOrdinal}` : 'Update';
}

function buildWhyText(step: SimulationStep, concept: ConceptType, branchIndex?: number): string {
  if (concept === 'DB Read') {
    return step.cacheHit
      ? 'The node reference was already cached, so no database read was needed.'
      : 'A hash reference must be resolved by fetching the node RLP from the KV database.';
  }
  if (concept === 'DB Write') {
    return 'The node RLP is at least 32 bytes, so it is persisted and referenced by hash.';
  }
  if (concept === 'Node Finalization') {
    const refKind = step.activeNode?.refKind;
    if (refKind === 'embedded') {
      return 'This encoded node is short, so the parent can embed it directly.';
    }
    return 'This node is finalized after path changes, producing a new content-addressed reference.';
  }
  if (concept === 'Branch Decision') {
    return `Traversal consumes nibble ${branchIndex?.toString(16) ?? '?'} to choose the next branch child.`;
  }
  if (concept === 'Root Commit') {
    return 'Any rewritten path node changes the root commitment that represents full trie state.';
  }
  if (concept === 'Result') {
    return 'Traversal ended with a found/missing account result after path matching checks.';
  }
  if (concept === 'Setup') {
    return 'This step initializes the next operation before traversal begins.';
  }
  return 'Traversal is following key nibbles through branch/extension/leaf decisions.';
}

function buildWhatText(step: SimulationStep, concept: ConceptType): string {
  if (concept === 'DB Read' && step.dbAction === 'GET') {
    return step.cacheHit ? 'Cache hit for node reference' : 'Read node from DB by hash reference';
  }
  if (concept === 'DB Write') {
    return 'Persist node RLP into DB (hash -> RLP)';
  }
  return step.log;
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

export function buildPedagogicalSteps(steps: SimulationStep[]): PedagogicalStep[] {
  const out: PedagogicalStep[] = [];
  let insertOrdinal = 0;
  let lookupOrdinal = 0;
  let updateOrdinal = 0;
  let fullKey: number[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const prev = index > 0 ? steps[index - 1] : undefined;
    const titleUpper = step.title.toUpperCase();

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

    const remainingNibbles = [...step.keyNibbles];
    const consumedFromLengths = fullKey.length > 0 ? Math.max(0, fullKey.length - remainingNibbles.length) : 0;
    const consumedCount = Math.max(step.consumed, consumedFromLengths);
    const prevConsumed = prev ? Math.max(prev.consumed, fullKey.length - prev.keyNibbles.length) : 0;
    const consumedDelta = Math.max(0, consumedCount - prevConsumed);

    const branchIndex = parseBranchIndex(step.log);
    const concept = inferConcept(step, branchIndex);
    const impact: StepImpact = {
      trieChanged: step.changedNodeIds.length > 0 || concept === 'Node Finalization',
      dbChanged: step.dbAction === 'PUT' || concept === 'DB Write',
      rootChanged: !!prev && toHexKey(prev.rootRef) !== toHexKey(step.rootRef),
    };

    const activeNibbleIndex =
      branchIndex !== undefined
        ? branchIndex
        : consumedCount < fullKey.length
          ? fullKey[consumedCount]
          : undefined;

    const whereLabel = buildWhereLabel(step, insertOrdinal, lookupOrdinal, updateOrdinal);
    const whatText = buildWhatText(step, concept);
    const whyText = buildWhyText(step, concept, branchIndex);
    const conciseText = `${concept}: ${whatText}`;

    out.push({
      index,
      step,
      concept,
      whereLabel,
      whatText,
      whyText,
      conciseText,
      impact,
      activeNibbleIndex,
      branchIndex,
      consumedDelta,
      consumedCount,
      fullKeyNibbles: [...fullKey],
      remainingNibbles,
      relatedEntities: {
        nodeId: step.activeNodeId,
        dbKey: step.highlightedDbKey,
        branchIndex,
      },
      refResolutionText: buildRefResolutionText(step),
      encodingText: buildEncodingText(step),
      referencedByActiveNode: isReferencedByActiveNode(step),
    });
  }

  return out;
}

export function formatNibbleArray(nibbles: number[]): string {
  return nibblesToString(nibbles);
}
