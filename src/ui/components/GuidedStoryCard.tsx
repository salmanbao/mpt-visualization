import type { StepFrame } from '../utils/stepViewModel';

interface GuidedStoryCardProps {
  stepFrame?: StepFrame;
  stepIndex: number;
  totalSteps: number;
  onShowInternals: () => void;
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

export function GuidedStoryCard(props: GuidedStoryCardProps) {
  if (!props.stepFrame || props.totalSteps === 0) {
    return (
      <section className="guided-story-card">
        <header className="guided-story-head">
          <h3>Guided Story</h3>
          <span>Step 0 / 0</span>
        </header>
        <div className="guided-story-grid">
          <article>
            <strong>Why</strong>
            <p>Generate accounts and build the trie to begin a step-by-step causal explanation.</p>
          </article>
          <article>
            <strong>What</strong>
            <p>Traversal, node finalization, DB access, and root commitment transitions will be narrated here.</p>
          </article>
          <article>
            <strong>Persistence</strong>
            <p>Each step shows if DB/root changed and why that happened.</p>
          </article>
        </div>
      </section>
    );
  }

  return (
    <section className="guided-story-card">
      <header className="guided-story-head">
        <h3>Guided Story</h3>
        <span>
          Step {props.stepIndex + 1} / {props.totalSteps}
        </span>
      </header>

      <div className="guided-story-grid">
        <article>
          <strong>Why</strong>
          <p>{props.stepFrame.story.why}</p>
        </article>
        <article>
          <strong>What</strong>
          <p>{props.stepFrame.story.what}</p>
        </article>
        <article>
          <strong>Persistence</strong>
          <p>{props.stepFrame.story.persistence}</p>
        </article>
      </div>

      {props.stepFrame.nibbleComparison && (
        <section className="nibble-compare-block">
          <h4>Nibble Comparison (incoming vs existing node path)</h4>
          <p className="muted">{relationLabel(props.stepFrame.nibbleComparison.relation)}</p>
          {renderNibbleRow(props.stepFrame.nibbleComparison.incomingPath, props.stepFrame.nibbleComparison.commonPrefix, 'incoming')}
          {renderNibbleRow(props.stepFrame.nibbleComparison.existingPath, props.stepFrame.nibbleComparison.commonPrefix, 'existing')}
        </section>
      )}

      <footer className="guided-story-foot">
        <span>{props.stepFrame.pedStep.whereLabel}</span>
        <button type="button" className="mini-button" onClick={props.onShowInternals}>
          Show internals
        </button>
      </footer>
    </section>
  );
}
