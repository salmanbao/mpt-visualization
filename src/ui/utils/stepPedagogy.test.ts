import type { SimulationStep } from '../../mpt/simulator';
import type { NodeInspection } from '../../mpt/types';
import { buildPedagogicalSteps } from './stepPedagogy';

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
    mode: 'insert',
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

describe('stepPedagogy', () => {
  it('infers branch decisions and nibble progress', () => {
    const steps: SimulationStep[] = [
      step({ title: 'INSERT ACCOUNT', keyNibbles: [1, 2, 10, 4], consumed: 0 }),
      step({
        id: 1,
        title: 'VISIT',
        log: 'Visit branch node',
        keyNibbles: [1, 2, 10, 4],
        consumed: 0,
        activeNodeId: 'branch-a',
        activeNode: inspection({ type: 'branch' }),
      }),
      step({
        id: 2,
        title: 'DECISION',
        log: 'Traverse branch index a',
        keyNibbles: [2, 10, 4],
        consumed: 1,
        activeNodeId: 'branch-a',
        activeNode: inspection({ type: 'branch' }),
      }),
    ];

    const ped = buildPedagogicalSteps(steps);
    expect(ped[2].concept).toBe('Branch Decision');
    expect(ped[2].branchIndex).toBe(10);
    expect(ped[2].activeNibbleIndex).toBe(10);
    expect(ped[2].consumedDelta).toBe(1);
  });

  it('marks db/root impacts and reference linkage', () => {
    const steps: SimulationStep[] = [
      step({
        id: 0,
        title: 'ROOT UPDATED',
        log: 'Root hash updated: 0x01',
        rootRef: new Uint8Array([0x01]),
      }),
      step({
        id: 1,
        title: 'FINALIZE',
        log: 'Finalize node -> hash-ref',
        rootRef: new Uint8Array([0x02]),
        dbAction: 'PUT',
        highlightedDbKey: '0xabc',
        changedNodeIds: ['0xabc'],
        activeNode: inspection({
          type: 'leaf',
          refKind: 'hash-ref',
          hashHex: '0xabc',
          branchChildren: [{ index: 1, refKind: 'hash-ref', refHex: '0xabc' }],
        }),
      }),
    ];

    const ped = buildPedagogicalSteps(steps);
    expect(ped[1].concept).toBe('DB Write');
    expect(ped[1].impact.dbChanged).toBe(true);
    expect(ped[1].impact.rootChanged).toBe(true);
    expect(ped[1].referencedByActiveNode).toBe(true);
  });
});
