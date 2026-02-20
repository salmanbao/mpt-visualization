import type { SimulationStep } from '../../mpt/simulator';
import type { NodeInspection } from '../../mpt/types';
import { buildPedagogicalSteps, normalizeStepForUi } from './stepPedagogy';
import { buildStepFrames } from './stepViewModel';

function inspection(overrides: Partial<NodeInspection> = {}): NodeInspection {
  return {
    type: 'branch',
    refKind: 'hash-ref',
    rlpHex: '0x01',
    rlpSize: 1,
    ...overrides,
  };
}

function step(partial: Partial<SimulationStep>): SimulationStep {
  return {
    id: 0,
    mode: 'lookup',
    title: 'STEP',
    log: 'step',
    rootRef: new Uint8Array(),
    keyNibbles: [],
    consumed: 0,
    changedNodeIds: [],
    dbEntries: [],
    ...partial,
  };
}

describe('stepViewModel', () => {
  it('normalizes consumed positions and active nibble position', () => {
    const prev = step({ id: 0, keyNibbles: [1, 2, 3], consumed: 0 });
    const current = step({ id: 1, log: 'Traverse branch index 2', keyNibbles: [2, 3], consumed: 1 });

    const normalized = normalizeStepForUi(current, prev, [1, 2, 3], '0x00');
    expect(normalized.consumedBefore).toBe(0);
    expect(normalized.consumedAfter).toBe(1);
    expect(normalized.decisionNibble).toBe(2);
    expect(normalized.activeNibblePosition).toBe(0);
  });

  it('builds witness, focus context, key derivation and cache experiment stats', () => {
    const steps: SimulationStep[] = [
      step({
        id: 0,
        title: 'LOOKUP START',
        keyNibbles: [10, 11],
        activeNodeId: '0xaaa',
        activeNode: inspection({ type: 'branch' }),
      }),
      step({
        id: 1,
        title: 'DB GET',
        log: 'DB GET 0xbbb',
        keyNibbles: [11],
        consumed: 1,
        dbAction: 'GET',
        highlightedDbKey: '0xbbb',
        activeNodeId: '0xaaa',
        activeNode: inspection({ type: 'branch' }),
        dbEntries: [{ keyHex: '0xbbb', valueHex: '0x1234', valueSize: 2, nodeType: 'leaf', insertedAt: 0 }],
      }),
      step({
        id: 2,
        title: 'DECISION',
        log: 'Traverse branch index b',
        keyNibbles: [],
        consumed: 2,
        activeNodeId: '0xccc',
        activeNode: inspection({
          type: 'branch',
          branchChildren: [{ index: 11, refKind: 'hash-ref', refHex: '0xddd' }],
        }),
      }),
    ];

    const ped = buildPedagogicalSteps(steps);
    const frames = buildStepFrames(steps, ped);

    expect(frames[1].witness.dbKeys).toContain('0xbbb');
    expect(frames[1].cacheExperiment.observedGets).toBe(1);
    expect(frames[1].cacheExperiment.decodedBytes).toBe(2);
    expect(frames[2].challenge?.answer).toBe('b');
    expect(frames[2].focusNodeIds).toContain('0xccc');
    expect(frames[2].focusEdgeIds).toContain('0xccc>0xddd');
    expect(frames[0].keyDerivation.keyHashHex).toBe('0xab');
    expect(frames[1].story.why.length).toBeGreaterThan(0);
    expect(frames[1].story.what.length).toBeGreaterThan(0);
    expect(frames[1].story.persistence.length).toBeGreaterThan(0);
  });
  it('derives nibble comparison for insert collisions against existing compact paths', () => {
    const steps: SimulationStep[] = [
      step({
        id: 0,
        mode: 'insert',
        title: 'INSERT ACCOUNT',
        keyNibbles: [10, 11, 12, 13],
      }),
      step({
        id: 1,
        mode: 'insert',
        title: 'VISIT',
        log: 'Visit leaf node',
        keyNibbles: [11, 12, 13],
        consumed: 1,
        activeNodeId: '0xleaf',
        activeNode: inspection({ type: 'leaf', compactPath: 'bcf', refKind: 'hash-ref' }),
      }),
    ];

    const ped = buildPedagogicalSteps(steps);
    const frames = buildStepFrames(steps, ped);

    expect(frames[1].nibbleComparison).toBeDefined();
    expect(frames[1].nibbleComparison?.incomingPath).toEqual([11, 12, 13]);
    expect(frames[1].nibbleComparison?.existingPath).toEqual([11, 12, 15]);
    expect(frames[1].nibbleComparison?.commonPrefix).toBe(2);
    expect(frames[1].nibbleComparison?.relation).toBe('diverge');
  });
});

