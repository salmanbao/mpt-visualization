export type LearningLens = 'foundational' | 'developer' | 'researcher';

export const LEARNING_LENSES: LearningLens[] = ['foundational', 'developer', 'researcher'];

export function lensLabel(lens: LearningLens): string {
  if (lens === 'foundational') {
    return 'Foundational';
  }
  if (lens === 'developer') {
    return 'Developer';
  }
  return 'Researcher';
}
