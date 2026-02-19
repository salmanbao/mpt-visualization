import { useState } from 'react';
import type { SimulationStep } from '../../mpt/simulator';
import { nibblesToString, shortHex } from '../../mpt/bytes';
import type { FormattedStep } from '../utils/stepFormat';
import type { PedagogicalStep } from '../utils/stepPedagogy';

interface StepDetailsProps {
  step?: SimulationStep;
  formatted?: FormattedStep;
  pedStep?: PedagogicalStep;
  debugMode: boolean;
  learningMode: boolean;
  onRevealDbKey?: (key: string) => void;
  onFocusNode?: (nodeId: string) => void;
}

type DetailTab = 'concept' | 'internals';

function stepValueSize(step: SimulationStep, key?: string): number | undefined {
  if (!key) {
    return undefined;
  }
  return step.dbEntries.find((entry) => entry.keyHex === key)?.valueSize;
}

export function StepDetails(props: StepDetailsProps) {
  const [tab, setTab] = useState<DetailTab>('concept');
  const step = props.step;
  const formatted = props.formatted;
  const pedStep = props.pedStep;
  if (!step || !formatted) {
    return <div className="event-details-empty">No step selected.</div>;
  }

  const remainingPath = step.keyNibbles.length > 0 ? nibblesToString(step.keyNibbles) : '-';
  const dbSize = stepValueSize(step, formatted.dbKey);
  const showConcept = !props.learningMode || tab === 'concept';
  const showInternals = !props.learningMode || tab === 'internals';

  return (
    <div className="event-details">
      <h4>Step Details</h4>
      {props.learningMode && (
        <div className="details-tabs">
          <button
            type="button"
            className={`mini-button ${tab === 'concept' ? 'mini-button-active' : ''}`}
            onClick={() => setTab('concept')}
          >
            Concept
          </button>
          <button
            type="button"
            className={`mini-button ${tab === 'internals' ? 'mini-button-active' : ''}`}
            onClick={() => setTab('internals')}
          >
            Internals
          </button>
        </div>
      )}

      {showConcept && (
        <section className="event-details-section">
          <h5>Concept</h5>
          <p className="event-detail-summary">
            {formatted.index + 1}. {pedStep?.conciseText ?? formatted.message}
          </p>
          {pedStep && (
            <div className="event-kv">
              <span>Where</span>
              <span>{pedStep.whereLabel}</span>
              <span>Why</span>
              <span>{pedStep.whyText}</span>
              <span>Impact</span>
              <span>
                trie {pedStep.impact.trieChanged ? 'changed' : 'stable'} | db {pedStep.impact.dbChanged ? 'changed' : 'stable'} | root{' '}
                {pedStep.impact.rootChanged ? 'changed' : 'stable'}
              </span>
            </div>
          )}
        </section>
      )}

      {showInternals && (
        <>
          <div className="event-kv">
            <span>Category</span>
            <span>{formatted.category}</span>
            <span>Badge</span>
            <span>{formatted.badge}</span>
            <span>Consumed</span>
            <span>{step.consumed}</span>
          </div>

          {(formatted.dbAction || formatted.dbKey) && (
            <section className="event-details-section">
              <h5>DB</h5>
              <div className="event-kv">
                <span>Action</span>
                <span>{formatted.dbAction ?? '-'}</span>
                <span>Hash key</span>
                <span className="event-inline">
                  <code>{formatted.dbKey ? shortHex(formatted.dbKey, 12) : '-'}</code>
                  {formatted.dbKey && (
                    <button
                      type="button"
                      className="mini-button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(formatted.dbKey!);
                      }}
                    >
                      copy
                    </button>
                  )}
                </span>
                <span>Value bytes</span>
                <span>{dbSize ?? step.activeNode?.rlpSize ?? '-'}</span>
                <span>Node type</span>
                <span>{formatted.nodeType ?? '-'}</span>
                <span>Cache</span>
                <span>{step.cacheHit ? 'hit' : 'miss/na'}</span>
                <span>Referenced by active node</span>
                <span>{pedStep?.referencedByActiveNode ? 'yes' : 'unknown/no'}</span>
              </div>
              {formatted.dbKey && (
                <button type="button" className="mini-button" onClick={() => props.onRevealDbKey?.(formatted.dbKey!)}>
                  Reveal in DB
                </button>
              )}
            </section>
          )}

          {(formatted.trieNodeId || formatted.nodeType) && (
            <section className="event-details-section">
              <h5>Trie</h5>
              <div className="event-kv">
                <span>Node type</span>
                <span>{formatted.nodeType ?? '-'}</span>
                <span>Node id</span>
                <span>
                  <code>{formatted.trieNodeId ? shortHex(formatted.trieNodeId, 12) : '-'}</code>
                </span>
                <span>Remaining path</span>
                <span>
                  <code>{remainingPath}</code>
                </span>
                <span>Ref mode</span>
                <span>{step.activeNode?.refKind ?? '-'}</span>
                <span>Resolution</span>
                <span>{pedStep?.refResolutionText ?? '-'}</span>
                <span>Encoding path</span>
                <span>{pedStep?.encodingText ?? '-'}</span>
              </div>
              {formatted.trieNodeId && (
                <button type="button" className="mini-button" onClick={() => props.onFocusNode?.(formatted.trieNodeId!)}>
                  Focus node
                </button>
              )}
            </section>
          )}

          {props.debugMode && (
            <section className="event-details-section">
              <h5>Raw Step (Debug)</h5>
              <pre className="event-raw-json">{JSON.stringify(step, null, 2)}</pre>
            </section>
          )}
        </>
      )}
    </div>
  );
}
