import type { RootDisplay, TrieGraphNode } from '../mpt/types';
import type { SimulationStep } from '../mpt/simulator';
import type { PedagogicalStep } from './utils/stepPedagogy';
import type { LearningLens } from './types/learning';
import { CopyableHex } from './components/CopyableHex';

interface InfoBarProps {
  root: RootDisplay;
  currentStep?: SimulationStep;
  pedStep?: PedagogicalStep;
  selectedNode?: TrieGraphNode;
  debugMode: boolean;
  learningMode: boolean;
  lens: LearningLens;
}

export function InfoBar(props: InfoBarProps) {
  const rootHex = props.root.isEmbedded ? props.root.rootRefHex : props.root.commitmentHex;
  const compactFoundational = props.learningMode && props.lens === 'foundational';

  return (
    <footer className="info-bar">
      <div className="info-grid info-grid-compact">
        <section>
          <h4>Root</h4>
          <p>{props.root.isEmbedded ? 'embedded root ref' : props.root.isEmpty ? 'empty trie' : 'hash-ref root'}</p>
          <CopyableHex value={rootHex} edge={props.root.isEmbedded ? 10 : undefined} />
          {props.root.isEmbedded && (
            <p className="muted">
              commitment keccak: <CopyableHex value={props.root.commitmentHex} edge={12} className="inline-copyable" />
            </p>
          )}
        </section>

        <section>
          <h4>Active Step</h4>
          {!props.currentStep ? (
            <p>No operation running.</p>
          ) : (
            <>
              <p>{props.currentStep.title}</p>
              <p className="muted">
                mode {props.currentStep.mode} | consumed {props.pedStep?.consumedAfter ?? props.currentStep.consumed}
              </p>
            </>
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
              <p>
                RLP bytes: {props.selectedNode.inspection.rlpSize} | hash{' '}
                {props.selectedNode.inspection.hashHex ? (
                  <CopyableHex value={props.selectedNode.inspection.hashHex} edge={12} className="inline-copyable" />
                ) : (
                  'embedded'
                )}
              </p>
            </div>
          )}
        </section>
      </div>

      <details className="concept-guide">
        <summary>Concept Guide</summary>
        <div className="concept-guide-grid">
          <p>
            Trie is conceptual. Clients persist hashed RLP node encodings in a KV DB and reconstruct traversal by decoding refs.
          </p>
          <p>
            Embedded vs hash-ref: if RLP(node) is shorter than 32 bytes parent embeds it, otherwise parent stores hash and DB stores hash -&gt; RLP.
          </p>
          <p>
            Lookups consume key nibbles (keccak(address)). Hash refs require DB GET or cache hit before traversal continues.
          </p>
          <p>
            Root hash commits to full state. Updating one account rewrites only path nodes and produces a new root.
          </p>
        </div>
      </details>

      {props.debugMode && props.selectedNode && (
        <pre className="node-debug-raw">{JSON.stringify(props.selectedNode.inspection, null, 2)}</pre>
      )}

      {!compactFoundational && !props.learningMode && props.currentStep && <p className="muted">Operation log: {props.currentStep.log}</p>}
    </footer>
  );
}
