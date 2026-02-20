import { useMemo, useState } from 'react';
import type { GeneratedAccount } from '../../mpt/account';
import { bytesToHex } from '../../mpt/bytes';
import { CopyableHex } from './CopyableHex';
import type { StepFrame } from '../utils/stepViewModel';

interface KeyDerivationCardProps {
  account?: GeneratedAccount;
  stepFrame?: StepFrame;
}

const DEFAULT_NIBBLE_PREVIEW = 20;

export function KeyDerivationCard(props: KeyDerivationCardProps) {
  const [expanded, setExpanded] = useState(false);

  const nibbles = props.account?.keyNibbles ?? props.stepFrame?.pedStep.fullKeyNibbles ?? [];
  const consumed = props.stepFrame?.pedStep.consumedAfter ?? 0;
  const activePos = props.stepFrame?.pedStep.activeNibblePosition;
  const shownLength = expanded ? nibbles.length : Math.min(DEFAULT_NIBBLE_PREVIEW, nibbles.length);

  const keyHashHex = useMemo(() => {
    if (props.account) {
      return bytesToHex(props.account.keyHash);
    }
    return props.stepFrame?.keyDerivation.keyHashHex;
  }, [props.account, props.stepFrame?.keyDerivation.keyHashHex]);

  return (
    <section className="key-derivation-card">
      <header className="key-derivation-head">
        <h3>Key Derivation</h3>
        <span>{props.stepFrame?.keyDerivation.nibbleCount ?? nibbles.length} nibbles</span>
      </header>

      <div className="key-derivation-grid">
        <div>
          <strong>Address (20 bytes)</strong>
          <CopyableHex value={props.account?.address} edge={12} />
        </div>
        <div>
          <strong>keccak(address)</strong>
          <CopyableHex value={keyHashHex} edge={14} />
        </div>
        <div>
          <strong>Trie key nibbles</strong>
          {nibbles.length === 0 ? (
            <p className="muted">No key selected.</p>
          ) : (
            <div className="key-derivation-nibbles">
              {nibbles.slice(0, shownLength).map((nibble, index) => {
                const isConsumed = index < consumed;
                const isActive = activePos !== undefined && index === activePos;
                return (
                  <span
                    key={`k-${index}`}
                    className={`key-nibble ${isConsumed ? 'key-nibble-consumed' : 'key-nibble-remaining'} ${
                      isActive ? 'key-nibble-active' : ''
                    }`}
                    title={`position ${index} | nibble ${nibble.toString(16)}`}
                  >
                    {nibble.toString(16)}
                  </span>
                );
              })}
              {!expanded && nibbles.length > shownLength && <span className="muted">... (+{nibbles.length - shownLength})</span>}
            </div>
          )}
        </div>
      </div>

      {nibbles.length > DEFAULT_NIBBLE_PREVIEW && (
        <footer className="key-derivation-foot">
          <button type="button" className="mini-button" onClick={() => setExpanded((prev) => !prev)}>
            {expanded ? 'Show less' : 'Show full key'}
          </button>
        </footer>
      )}
    </section>
  );
}
