import { shortHex } from '../mpt/bytes';
import type { RootDisplay, TrieGraphNode } from '../mpt/types';
import type { SimulationStep } from '../mpt/simulator';

interface InfoBarProps {
  root: RootDisplay;
  currentStep?: SimulationStep;
  selectedNode?: TrieGraphNode;
  debugMode: boolean;
}

export function InfoBar(props: InfoBarProps) {
  const currentLog = props.currentStep?.log ?? 'No operation running.';
  return (
    <footer className="info-bar">
      <div className="info-grid">
        <section>
          <h4>Root Hash</h4>
          <p>
            {props.root.isEmbedded ? 'embedded root ref' : props.root.isEmpty ? 'empty trie' : 'hash-ref root'}
          </p>
          <code>{props.root.isEmbedded ? shortHex(props.root.rootRefHex, 10) : props.root.commitmentHex}</code>
          {props.root.isEmbedded && (
            <p className="muted">
              commitment keccak: <code>{props.root.commitmentHex}</code>
            </p>
          )}
        </section>

        <section>
          <h4>Operation Log</h4>
          <p>{currentLog}</p>
          {props.currentStep && (
            <p className="muted">
              step {props.currentStep.id + 1} | consumed nibbles: {props.currentStep.consumed}
            </p>
          )}
        </section>

        <section>
          <h4>Selected Node</h4>
          {!props.selectedNode ? (
            <p>Click a node for decoded fields.</p>
          ) : (
            <div className="node-detail">
              <p>
                {props.selectedNode.type} ({props.selectedNode.refKind})
              </p>
              <p>{props.selectedNode.summary}</p>
              <p>{props.selectedNode.detail}</p>
              <p>
                RLP bytes: {props.selectedNode.inspection.rlpSize} | hash:{' '}
                {props.selectedNode.inspection.hashHex ?? 'embedded'}
              </p>
              {props.debugMode && <pre>{JSON.stringify(props.selectedNode.inspection, null, 2)}</pre>}
            </div>
          )}
        </section>

        <section>
          <h4>Explain</h4>
          <details open>
            <summary>Trie is conceptual, DB stores hashes</summary>
            <p>Clients persist hashed RLP node encodings in a KV DB. The pointer-like trie is reconstructed by decoding references.</p>
          </details>
          <details>
            <summary>Embedded vs hash-ref node references</summary>
            <p>If RLP(node) is shorter than 32 bytes, parent embeds it directly; otherwise parent stores a 32-byte hash and DB has hash -&gt; RLP.</p>
          </details>
          <details>
            <summary>Why clients reconstruct nodes</summary>
            <p>Lookups consume key nibbles. Each hash-ref triggers DB GET (or cache hit), decode, then continue traversal.</p>
          </details>
          <details>
            <summary>Root commits to full state</summary>
            <p>Changing one account rewrites only its path nodes, producing a new root hash while old content-addressed nodes can remain.</p>
          </details>
        </section>
      </div>
    </footer>
  );
}
