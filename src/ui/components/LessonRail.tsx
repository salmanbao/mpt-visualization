import type { LearningLens } from '../types/learning';
import type { StepFrame } from '../utils/stepViewModel';

interface LessonRailProps {
  stepFrame?: StepFrame;
  stepIndex: number;
  totalSteps: number;
  lens: LearningLens;
}

export function LessonRail(props: LessonRailProps) {
  if (!props.stepFrame || props.totalSteps === 0) {
    return (
      <section className="lesson-rail">
        <div className="lesson-item">
          <strong>Question</strong>
          <span>Why did this step happen now?</span>
        </div>
        <div className="lesson-item">
          <strong>Mechanism</strong>
          <span>Generate accounts and build trie to start guided traversal and persistence events.</span>
        </div>
        <div className="lesson-item">
          <strong>Persistence</strong>
          <span>Each step explains whether DB entries and root commitment changed.</span>
        </div>
      </section>
    );
  }

  const impact = props.stepFrame.pedStep.impact;
  const lensSummary = props.stepFrame.pedStep.lensText[props.lens];

  return (
    <section className="lesson-rail">
      <div className="lesson-item">
        <strong>Question</strong>
        <span>{props.stepFrame.question}</span>
      </div>
      <div className="lesson-item">
        <strong>Mechanism</strong>
        <span>{props.stepFrame.mechanism}</span>
      </div>
      <div className="lesson-item">
        <strong>Persistence</strong>
        <span>{props.stepFrame.persistence}</span>
      </div>
      <div className="lesson-item lesson-item-meta">
        <strong>Context</strong>
        <span>
          {props.stepFrame.pedStep.whereLabel} | step {props.stepIndex + 1}/{props.totalSteps}
        </span>
        <span className="lesson-summary">{lensSummary}</span>
      </div>
      <div className="lesson-impact">
        <span className={`lesson-chip ${impact.trieChanged ? 'lesson-chip-on' : ''}`}>Trie {impact.trieChanged ? 'changed' : 'stable'}</span>
        <span className={`lesson-chip ${impact.dbChanged ? 'lesson-chip-on' : ''}`}>DB {impact.dbChanged ? 'changed' : 'stable'}</span>
        <span className={`lesson-chip ${impact.rootChanged ? 'lesson-chip-on' : ''}`}>Root {impact.rootChanged ? 'changed' : 'stable'}</span>
      </div>
    </section>
  );
}
