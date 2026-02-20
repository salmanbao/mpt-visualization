import { CopyableHex } from './CopyableHex';

export interface RootTransitionPoint {
  stepIndex: number;
  beforeRoot: string;
  afterRoot: string;
}

interface CommitmentCardProps {
  beforeRoot?: string;
  afterRoot?: string;
  operationStartRoot?: string;
  changedNodes: number;
  transitions: RootTransitionPoint[];
  onJumpToStep: (index: number) => void;
}

export function CommitmentCard(props: CommitmentCardProps) {
  const before = props.beforeRoot ?? props.operationStartRoot ?? '0x';
  const after = props.afterRoot ?? '0x';
  const operationStart = props.operationStartRoot ?? before;
  const changed = before !== after;

  return (
    <section className="commitment-card">
      <div className="commitment-title">Commitment Change</div>
      <div className="commitment-grid">
        <span>Operation start</span>
        <CopyableHex value={operationStart} edge={12} />
        <span>Previous root</span>
        <CopyableHex value={before} edge={12} />
        <span>Current root</span>
        <CopyableHex value={after} edge={12} />
        <span>Changed</span>
        <span>{changed ? 'Yes' : 'No'}</span>
        <span>Rewritten nodes</span>
        <span>{props.changedNodes}</span>
      </div>
      <p className="commitment-note">
        {changed
          ? 'Root changes because path nodes were rewritten.'
          : 'Root is stable when traversal reads state without rewriting nodes.'}
      </p>
      <div className="commitment-timeline">
        <strong>Root transitions</strong>
        {props.transitions.length === 0 ? (
          <span className="muted">No root transitions in this operation.</span>
        ) : (
          <div className="commitment-transition-list">
            {props.transitions.map((transition) => (
              <div key={`root-${transition.stepIndex}`} className="commitment-transition-row">
                <button
                  type="button"
                  className="mini-button commitment-transition"
                  onClick={() => props.onJumpToStep(transition.stepIndex)}
                  title={`${transition.beforeRoot} -> ${transition.afterRoot}`}
                >
                  step {transition.stepIndex + 1}
                </button>
                <div className="commitment-transition-hex">
                  <CopyableHex value={transition.beforeRoot} edge={8} />
                  <span>-&gt;</span>
                  <CopyableHex value={transition.afterRoot} edge={8} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
