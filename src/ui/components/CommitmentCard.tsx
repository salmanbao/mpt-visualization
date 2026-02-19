import { shortHex } from '../../mpt/bytes';

interface CommitmentCardProps {
  previousRoot?: string;
  currentRoot?: string;
  changedNodes: number;
}

export function CommitmentCard(props: CommitmentCardProps) {
  const previous = props.previousRoot ?? '0x';
  const current = props.currentRoot ?? '0x';
  const changed = previous !== current;

  return (
    <section className="commitment-card">
      <div className="commitment-title">Commitment Change</div>
      <div className="commitment-grid">
        <span>Previous root</span>
        <code>{shortHex(previous, 12)}</code>
        <span>Current root</span>
        <code>{shortHex(current, 12)}</code>
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
    </section>
  );
}
