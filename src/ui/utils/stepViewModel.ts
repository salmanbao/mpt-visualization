import { bytesToHex, nibblesToPackedBytes } from '../../mpt/bytes';
import type { SimulationStep } from '../../mpt/simulator';
import type { PedagogicalStep } from './stepPedagogy';

export interface StepFrame {
  index: number;
  step: SimulationStep;
  pedStep: PedagogicalStep;
  summary: string;
  question: string;
  mechanism: string;
  persistence: string;
  story: {
    why: string;
    what: string;
    persistence: string;
  };
  causalitySpine: [string, string, string];
  dbReason?: string;
  rootReason: string;
  witness: {
    nodeIds: string[];
    dbKeys: string[];
    bytes: number;
  };
  rewriteDiff: {
    rewritten: string[];
    retained: string[];
  };
  cacheExperiment: {
    observedGets: number;
    cacheHits: number;
    cacheMisses: number;
    decodedBytes: number;
    noCacheGets: number;
    noCacheDecodedBytes: number;
  };
  focusNodeIds: string[];
  focusEdgeIds: string[];
  focusReason: string;
  keyDerivation: {
    addressHex?: string;
    keyHashHex?: string;
    nibbleCount: number;
  };
  nibbleComparison?: {
    existingPath: number[];
    incomingPath: number[];
    commonPrefix: number;
    relation: 'exact' | 'incoming-extends' | 'existing-extends' | 'diverge';
  };
  challenge?: {
    prompt: string;
    options: string[];
    answer: string;
  };
}

function isOperationStart(step: SimulationStep): boolean {
  const title = step.title.toUpperCase();
  if (title.includes('LOOKUP START') || title.includes('UPDATE START') || title.includes('BUILD START')) {
    return true;
  }
  if (step.mode === 'insert' && title.includes('INSERT ACCOUNT')) {
    return true;
  }
  return false;
}

function entrySize(step: SimulationStep, key: string | undefined): number {
  if (!key) {
    return 0;
  }
  const entry = step.dbEntries.find((item) => item.keyHex === key);
  return entry?.valueSize ?? 0;
}

function challengeOptions(answer: string, index: number): string[] {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
  const used = new Set<string>([answer]);
  const options: string[] = [answer];
  let cursor = (index * 5 + 3) % digits.length;
  while (options.length < 4) {
    const candidate = digits[cursor];
    if (!used.has(candidate)) {
      used.add(candidate);
      options.push(candidate);
    }
    cursor = (cursor + 3) % digits.length;
  }
  return options.sort();
}

function buildQuestion(step: SimulationStep, pedStep: PedagogicalStep): string {
  if (pedStep.decisionNibble !== undefined) {
    return `Why was branch nibble ${pedStep.decisionNibble.toString(16)} selected now?`;
  }
  if (step.dbAction === 'GET') {
    return 'Why was a DB GET needed at this step?';
  }
  if (step.dbAction === 'PUT') {
    return 'Why does this step write a new hash -> RLP entry?';
  }
  if (pedStep.impact.rootChanged) {
    return 'Why did the root commitment change here?';
  }
  return 'Why did this step happen now?';
}

function buildFocusReason(step: SimulationStep, pedStep: PedagogicalStep): string {
  if (step.dbAction === 'GET') {
    return 'Path focus keeps the node resolving the hash-ref and witness chain in view.';
  }
  if (step.dbAction === 'PUT' || pedStep.impact.trieChanged) {
    return 'Path focus highlights rewritten path nodes that affect persistence and commitment.';
  }
  if (pedStep.decisionNibble !== undefined) {
    return `Path focus follows branch decision nibble ${pedStep.decisionNibble.toString(16)}.`;
  }
  return 'Path focus follows the active traversal context for this step.';
}

function deriveKeyHashHex(pedStep: PedagogicalStep): string | undefined {
  const full = pedStep.fullKeyNibbles;
  if (full.length === 0 || full.length % 2 !== 0) {
    return undefined;
  }
  return bytesToHex(nibblesToPackedBytes(full));
}

function parseCompactPath(path?: string): number[] {
  if (!path) {
    return [];
  }
  const out: number[] = [];
  for (const char of path.toLowerCase()) {
    if (!/[0-9a-f]/.test(char)) {
      continue;
    }
    out.push(Number.parseInt(char, 16));
  }
  return out;
}

function commonPrefix(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let i = 0;
  while (i < length && a[i] === b[i]) {
    i += 1;
  }
  return i;
}

function deriveNibbleComparison(step: SimulationStep, pedStep: PedagogicalStep): StepFrame['nibbleComparison'] {
  if (step.mode !== 'insert') {
    return undefined;
  }
  if (step.activeNode?.type !== 'leaf' && step.activeNode?.type !== 'extension') {
    return undefined;
  }
  const existingPath = parseCompactPath(step.activeNode?.compactPath);
  const incomingPath = pedStep.remainingNibbles.length > 0 ? [...pedStep.remainingNibbles] : [...step.keyNibbles];
  if (existingPath.length === 0 || incomingPath.length === 0) {
    return undefined;
  }

  const common = commonPrefix(existingPath, incomingPath);
  let relation: NonNullable<StepFrame['nibbleComparison']>['relation'] = 'diverge';
  if (common === existingPath.length && common === incomingPath.length) {
    relation = 'exact';
  } else if (common === existingPath.length) {
    relation = 'incoming-extends';
  } else if (common === incomingPath.length) {
    relation = 'existing-extends';
  }

  return {
    existingPath,
    incomingPath,
    commonPrefix: common,
    relation,
  };
}

export function buildStepFrames(steps: SimulationStep[], pedSteps: PedagogicalStep[]): StepFrame[] {
  const out: StepFrame[] = [];
  let opStartIndex = 0;
  let witnessNodeSet = new Set<string>();
  let witnessDbSet = new Set<string>();
  let observedGets = 0;
  let cacheHits = 0;
  let decodedBytes = 0;
  let noCacheDecodedBytes = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const pedStep = pedSteps[index];
    const prevStep = index > 0 ? steps[index - 1] : undefined;

    if (isOperationStart(step) || index === 0) {
      opStartIndex = index;
      witnessNodeSet = new Set<string>();
      witnessDbSet = new Set<string>();
      observedGets = 0;
      cacheHits = 0;
      decodedBytes = 0;
      noCacheDecodedBytes = 0;
    }

    const nodeId = step.activeNodeId ?? step.activeNode?.hashHex ?? step.activeNode?.refHex;
    if (nodeId) {
      witnessNodeSet.add(nodeId);
    }

    const dbKey = step.highlightedDbKey;
    if (dbKey) {
      witnessDbSet.add(dbKey);
    }

    if (step.dbAction === 'GET') {
      observedGets += 1;
      const size = entrySize(step, step.highlightedDbKey);
      noCacheDecodedBytes += size;
      if (step.cacheHit) {
        cacheHits += 1;
      } else {
        decodedBytes += size;
      }
    }

    const rewriteCurrent = [...step.changedNodeIds];
    const rewritePrev = prevStep && index > opStartIndex ? new Set(prevStep.changedNodeIds) : new Set<string>();
    const rewriteDiff = {
      rewritten: rewriteCurrent.filter((id) => !rewritePrev.has(id)),
      retained: rewriteCurrent.filter((id) => rewritePrev.has(id)),
    };

    const cacheMisses = observedGets - cacheHits;
    const cacheExperiment = {
      observedGets,
      cacheHits,
      cacheMisses,
      decodedBytes,
      noCacheGets: observedGets,
      noCacheDecodedBytes,
    };

    const witnessDbKeys = Array.from(witnessDbSet);
    const witnessBytes = witnessDbKeys.reduce((sum, key) => sum + entrySize(step, key), 0);

    const mechanism = pedStep.causalityChain[1];
    const persistence = pedStep.causalityChain[2];
    const rootReason = pedStep.rootTransition.changed
      ? 'Root moved because rewritten path nodes changed the commitment.'
      : 'Root unchanged for this step';

    const focusNodeSet = new Set<string>([...witnessNodeSet, ...step.changedNodeIds]);
    if (nodeId) {
      focusNodeSet.add(nodeId);
    }
    const prevNodeId = prevStep?.activeNodeId ?? prevStep?.activeNode?.hashHex ?? prevStep?.activeNode?.refHex;
    if (prevNodeId && index > opStartIndex) {
      focusNodeSet.add(prevNodeId);
    }

    const focusEdgeSet = new Set<string>();
    if (prevNodeId && nodeId && index > opStartIndex) {
      focusEdgeSet.add(`${prevNodeId}>${nodeId}`);
    }
    if (nodeId) {
      for (const child of step.activeNode?.branchChildren ?? []) {
        if (child.refHex) {
          focusEdgeSet.add(`${nodeId}>${child.refHex}`);
        }
      }
    }

    const keyHashHex = deriveKeyHashHex(pedStep);
    const nibbleComparison = deriveNibbleComparison(step, pedStep);

    const frame: StepFrame = {
      index,
      step,
      pedStep,
      summary: pedStep.conciseText,
      question: buildQuestion(step, pedStep),
      mechanism,
      persistence,
      story: {
        why: frameWhy(step, pedStep),
        what: frameWhat(step, pedStep, mechanism),
        persistence: framePersistence(step, pedStep, rootReason),
      },
      causalitySpine: pedStep.causalityChain,
      dbReason:
        step.dbAction === 'GET'
          ? 'resolve hash-ref from active node'
          : step.dbAction === 'PUT'
            ? 'node finalized and hashed because RLP >= 32 bytes'
            : undefined,
      rootReason,
      witness: {
        nodeIds: Array.from(witnessNodeSet),
        dbKeys: witnessDbKeys,
        bytes: witnessBytes,
      },
      rewriteDiff,
      cacheExperiment,
      focusNodeIds: Array.from(focusNodeSet),
      focusEdgeIds: Array.from(focusEdgeSet),
      focusReason: buildFocusReason(step, pedStep),
      keyDerivation: {
        keyHashHex,
        nibbleCount: pedStep.fullKeyNibbles.length,
      },
      nibbleComparison,
    };

    if (pedStep.decisionNibble !== undefined) {
      const answer = pedStep.decisionNibble.toString(16);
      frame.challenge = {
        prompt: 'Which nibble is consumed for this branch decision?',
        options: challengeOptions(answer, index),
        answer,
      };
    }

    out.push(frame);
  }

  return out;
}

function frameWhy(step: SimulationStep, pedStep: PedagogicalStep): string {
  if (step.dbAction === 'GET') {
    return 'A hash reference had to be resolved from the KV database before traversal could continue.';
  }
  if (step.dbAction === 'PUT') {
    return 'Finalized node encoding crossed the inline threshold and was persisted by content hash.';
  }
  if (pedStep.decisionNibble !== undefined) {
    return `Traversal consumed nibble ${pedStep.decisionNibble.toString(16)} to choose the next branch child.`;
  }
  if (pedStep.impact.rootChanged) {
    return 'Path rewrites changed the commitment at the root.';
  }
  return pedStep.whyText;
}

function frameWhat(step: SimulationStep, pedStep: PedagogicalStep, mechanism: string): string {
  const nodeType = step.activeNode?.type ?? 'node';
  const refMode = step.activeNode?.refKind ? ` (${step.activeNode.refKind})` : '';
  if (pedStep.decisionNibble !== undefined) {
    return `At ${nodeType}${refMode}, decision nibble ${pedStep.decisionNibble.toString(16)} is applied.`;
  }
  return mechanism.replace(/^Mechanism:\s*/i, '');
}

function framePersistence(step: SimulationStep, pedStep: PedagogicalStep, rootReason: string): string {
  const dbPart =
    step.dbAction === 'GET'
      ? 'DB read'
      : step.dbAction === 'PUT'
        ? 'DB write'
        : pedStep.impact.dbChanged
          ? 'DB changed'
          : 'DB unchanged';
  const rootPart = pedStep.impact.rootChanged ? 'root changed' : 'root unchanged';
  return `${dbPart}; ${rootPart}. ${rootReason}`;
}


