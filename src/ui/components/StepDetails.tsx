import { useEffect, useMemo, useState } from 'react';
import type { SimulationStep } from '../../mpt/simulator';
import { nibblesToString } from '../../mpt/bytes';
import type { FormattedStep } from '../utils/stepFormat';
import type { PedagogicalStep } from '../utils/stepPedagogy';
import type { LearningLens } from '../types/learning';
import type { StepFrame } from '../utils/stepViewModel';
import { CopyableHex } from './CopyableHex';

interface StepDetailsProps {
  step?: SimulationStep;
  formatted?: FormattedStep;
  pedStep?: PedagogicalStep;
  stepFrame?: StepFrame;
  debugMode: boolean;
  learningMode: boolean;
  lens: LearningLens;
  onRevealDbKey?: (key: string) => void;
  onFocusNode?: (nodeId: string) => void;
  forceInternalsKey?: number;
}

type DetailTab = 'concept' | 'internals';

function stepValueSize(step: SimulationStep, key?: string): number | undefined {
  if (!key) {
    return undefined;
  }
  return step.dbEntries.find((entry) => entry.keyHex === key)?.valueSize;
}

function lensShowsInternals(lens: LearningLens): boolean {
  return lens !== 'foundational';
}

function relationLabel(relation: NonNullable<StepFrame['nibbleComparison']>['relation']): string {
  if (relation === 'exact') {
    return 'Exact path match';
  }
  if (relation === 'incoming-extends') {
    return 'Incoming path continues after existing path';
  }
  if (relation === 'existing-extends') {
    return 'Existing path continues after incoming path';
  }
  return 'Paths diverge';
}

function renderNibbleRow(path: number[], commonPrefix: number, prefix: string) {
  return (
    <div className="nibble-compare-row">
      <span>{prefix}</span>
      <div className="nibble-compare-cells">
        {path.map((nibble, index) => (
          <span
            key={`${prefix}-${index}`}
            className={`nibble-compare-cell ${index < commonPrefix ? 'nibble-compare-match' : 'nibble-compare-diff'}`}
            title={`position ${index} | nibble ${nibble.toString(16)}`}
          >
            {nibble.toString(16)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StepDetails(props: StepDetailsProps) {
  const [tab, setTab] = useState<DetailTab>('concept');
  const [challengeGuess, setChallengeGuess] = useState<string>();
  const step = props.step;
  const formatted = props.formatted;
  const pedStep = props.pedStep;
  const frame = props.stepFrame;
  const challenge = frame?.challenge;

  const challengeResult = useMemo(() => {
    if (!challenge || !challengeGuess) {
      return undefined;
    }
    return challengeGuess === challenge.answer ? 'correct' : 'incorrect';
  }, [challenge, challengeGuess]);

  useEffect(() => {
    setChallengeGuess(undefined);
  }, [step?.id]);

  useEffect(() => {
    if (!props.learningMode || props.forceInternalsKey === undefined) {
      return;
    }
    setTab('internals');
  }, [props.forceInternalsKey, props.learningMode]);

  if (!step || !formatted || !pedStep || !frame) {
    return <div className="event-details-empty">No step selected.</div>;
  }

  const remainingPath = pedStep.remainingNibbles.length > 0 ? nibblesToString(pedStep.remainingNibbles) : '-';
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
          <h5>Causality Spine</h5>
          <p className="event-detail-summary">
            {formatted.index + 1}. {pedStep.lensText[props.lens]}
          </p>
          <div className="event-kv">
            <span>Question</span>
            <span>{frame.question}</span>
            <span>Mechanism</span>
            <span>{frame.mechanism}</span>
            <span>Persistence</span>
            <span>{frame.persistence}</span>
            <span>Consumed</span>
            <span>
              {pedStep.consumedBefore} -&gt; {pedStep.consumedAfter} (remaining {pedStep.remainingNibbles.length})
            </span>
          </div>
          {frame.nibbleComparison && (
            <div className="nibble-compare-block">
              <h5>Nibble Comparison</h5>
              <p className="muted">{relationLabel(frame.nibbleComparison.relation)}</p>
              {renderNibbleRow(frame.nibbleComparison.incomingPath, frame.nibbleComparison.commonPrefix, 'incoming')}
              {renderNibbleRow(frame.nibbleComparison.existingPath, frame.nibbleComparison.commonPrefix, 'existing')}
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
            <span>Mode</span>
            <span>{step.mode}</span>
          </div>

          {(formatted.dbAction || formatted.dbKey) && (
            <section className="event-details-section">
              <h5>DB</h5>
              <div className="event-kv">
                <span>Action</span>
                <span>{formatted.dbAction ?? '-'}</span>
                <span>Why access</span>
                <span>{frame.dbReason ?? '-'}</span>
                <span>Hash key</span>
                <span>
                  <CopyableHex value={formatted.dbKey} edge={12} />
                </span>
                <span>Value bytes</span>
                <span>{dbSize ?? step.activeNode?.rlpSize ?? '-'}</span>
                <span>Cache</span>
                <span>{step.cacheHit ? 'hit' : 'miss/na'}</span>
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
                  <CopyableHex value={formatted.trieNodeId} edge={12} allowCopyNonHex />
                </span>
                <span>Path (remaining)</span>
                <span>
                  <code>{remainingPath}</code>
                </span>
                <span>Decision nibble</span>
                <span>{pedStep.decisionNibble !== undefined ? pedStep.decisionNibble.toString(16) : '-'}</span>
                <span>Ref mode</span>
                <span>{step.activeNode?.refKind ?? '-'}</span>
                <span>Resolution</span>
                <span>{pedStep.refResolutionText ?? '-'}</span>
              </div>
              {formatted.trieNodeId && (
                <button type="button" className="mini-button" onClick={() => props.onFocusNode?.(formatted.trieNodeId!)}>
                  Focus node
                </button>
              )}
            </section>
          )}

          <section className="event-details-section">
            <h5>Commitment</h5>
            <div className="event-kv">
              <span>Root transition</span>
              <span className="hex-pair">
                <CopyableHex value={pedStep.rootTransition.beforeHex} edge={12} />
                <span>-&gt;</span>
                <CopyableHex value={pedStep.rootTransition.afterHex} edge={12} />
              </span>
              <span>Changed</span>
              <span>{pedStep.rootTransition.changed ? 'yes' : 'no'}</span>
              <span>Reason</span>
              <span>{frame.rootReason}</span>
            </div>
          </section>

          {lensShowsInternals(props.lens) && (
            <section className="event-details-section">
              <h5>Witness Path Mode</h5>
              <div className="event-kv">
                <span>Nodes in witness</span>
                <span>{frame.witness.nodeIds.length}</span>
                <span>DB keys in witness</span>
                <span>{frame.witness.dbKeys.length}</span>
                <span>Witness bytes</span>
                <span>{frame.witness.bytes}</span>
              </div>
            </section>
          )}

          {props.lens === 'researcher' && (
            <>
              <section className="event-details-section">
                <h5>Path Rewrite Diff</h5>
                <div className="event-kv">
                  <span>Newly rewritten</span>
                  <span>{frame.rewriteDiff.rewritten.length}</span>
                  <span>Retained from prior</span>
                  <span>{frame.rewriteDiff.retained.length}</span>
                </div>
              </section>

              <section className="event-details-section">
                <h5>Cache Experiment</h5>
                <div className="event-kv">
                  <span>Observed GETs</span>
                  <span>{frame.cacheExperiment.observedGets}</span>
                  <span>Cache hits</span>
                  <span>{frame.cacheExperiment.cacheHits}</span>
                  <span>Cache misses</span>
                  <span>{frame.cacheExperiment.cacheMisses}</span>
                  <span>Decoded bytes (actual)</span>
                  <span>{frame.cacheExperiment.decodedBytes}</span>
                  <span>Decoded bytes (no cache)</span>
                  <span>{frame.cacheExperiment.noCacheDecodedBytes}</span>
                </div>
              </section>

              {frame.challenge && (
                <section className="event-details-section">
                  <h5>Reconstruct-from-DB Challenge</h5>
                  <p className="event-detail-summary">{frame.challenge.prompt}</p>
                  <div className="challenge-options">
                    {frame.challenge.options.map((option) => (
                      <button
                        key={`choice-${option}`}
                        type="button"
                        className={`mini-button ${challengeGuess === option ? 'mini-button-active' : ''}`}
                        onClick={() => setChallengeGuess(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {challengeResult === 'correct' && <p className="challenge-result challenge-correct">Correct.</p>}
                  {challengeResult === 'incorrect' && (
                    <p className="challenge-result challenge-wrong">Incorrect. Correct answer: {frame.challenge.answer}</p>
                  )}
                </section>
              )}
            </>
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
