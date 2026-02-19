import type { PedagogicalStep } from '../utils/stepPedagogy';

interface LessonRailProps {
  pedStep?: PedagogicalStep;
  stepIndex: number;
  totalSteps: number;
}

export function LessonRail(props: LessonRailProps) {
  if (!props.pedStep || props.totalSteps === 0) {
    return (
      <section className="lesson-rail">
        <div className="lesson-item">
          <strong>Where</strong>
          <span>No active operation</span>
        </div>
        <div className="lesson-item">
          <strong>What</strong>
          <span>Generate accounts and build trie to begin guided learning.</span>
        </div>
        <div className="lesson-item">
          <strong>Why</strong>
          <span>Each step explains traversal, persistence, and root commitment changes.</span>
        </div>
      </section>
    );
  }

  const impact = props.pedStep.impact;
  return (
    <section className="lesson-rail">
      <div className="lesson-item">
        <strong>Where</strong>
        <span>
          {props.pedStep.whereLabel} | step {props.stepIndex + 1}/{props.totalSteps}
        </span>
      </div>
      <div className="lesson-item">
        <strong>What</strong>
        <span>{props.pedStep.whatText}</span>
      </div>
      <div className="lesson-item">
        <strong>Why</strong>
        <span>{props.pedStep.whyText}</span>
      </div>
      <div className="lesson-impact">
        <span className={`lesson-chip ${impact.trieChanged ? 'lesson-chip-on' : ''}`}>Trie {impact.trieChanged ? 'changed' : 'stable'}</span>
        <span className={`lesson-chip ${impact.dbChanged ? 'lesson-chip-on' : ''}`}>DB {impact.dbChanged ? 'changed' : 'stable'}</span>
        <span className={`lesson-chip ${impact.rootChanged ? 'lesson-chip-on' : ''}`}>Root {impact.rootChanged ? 'changed' : 'stable'}</span>
      </div>
    </section>
  );
}
