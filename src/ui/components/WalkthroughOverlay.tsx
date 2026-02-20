interface WalkthroughOverlayProps {
  open: boolean;
  onClose: () => void;
  onNeverShow: () => void;
}

const WALKTHROUGH_STEPS = [
  {
    title: '1. Account -> Trie Key',
    body: 'Each account address is hashed with keccak256 to produce the state trie key. The key nibbles drive traversal.',
  },
  {
    title: '2. Key Progress Ribbon',
    body: 'Consumed nibbles show traversal progress. The highlighted nibble is the current decision point.',
  },
  {
    title: '3. Path-only Focus',
    body: 'Only the relevant nodes and edges stay bright. Dimmed elements are not on the active path for this step.',
  },
  {
    title: '4. DB Reads/Writes',
    body: 'Hash references trigger DB GET. Finalized nodes with RLP >= 32 trigger DB PUT hash -> RLP.',
  },
  {
    title: '5. Root Commitment',
    body: 'When path nodes are rewritten, the root changes and commits to the updated state.',
  },
];

export function WalkthroughOverlay(props: WalkthroughOverlayProps) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="walkthrough-backdrop" role="presentation" onClick={props.onClose}>
      <section className="walkthrough-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="walkthrough-head">
          <h3>MPT Quick Walkthrough</h3>
          <button type="button" className="mini-button" onClick={props.onClose}>
            Close
          </button>
        </header>
        <ol className="walkthrough-list">
          {WALKTHROUGH_STEPS.map((entry) => (
            <li key={entry.title}>
              <strong>{entry.title}</strong>
              <p>{entry.body}</p>
            </li>
          ))}
        </ol>
        <footer className="walkthrough-foot">
          <button type="button" className="button" onClick={props.onClose}>
            Continue
          </button>
          <button type="button" className="button" onClick={props.onNeverShow}>
            Don&apos;t show again
          </button>
        </footer>
      </section>
    </div>
  );
}
