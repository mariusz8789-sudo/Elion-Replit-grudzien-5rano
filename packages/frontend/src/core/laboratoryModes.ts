/** The ONE Genesis Laboratory and its modes. Routes stay as deep links; users see a single Laboratory. */
export type LaboratoryModeId = 'physics' | 'biology' | 'scenarios' | 'quantum';

export interface LaboratoryMode {
  readonly id: LaboratoryModeId;
  readonly label: string;
  readonly hash: string;
}

export const LABORATORY_MODES: readonly LaboratoryMode[] = Object.freeze([
  { id: 'physics', label: 'Fizyka i chemia', hash: '#/scientific-worlds' },
  { id: 'biology', label: 'Biologia człowieka', hash: '#/human-biology-lab' },
  { id: 'scenarios', label: 'Scenariusze', hash: '#/first-person-lab' },
  { id: 'quantum', label: 'Kwantowy FPV', hash: '#/lab-fpv' },
]);

export function laboratoryModeOf(hash: string): LaboratoryModeId {
  if (hash.startsWith('#/human-biology-lab')) return 'biology';
  if (hash === '#/first-person-lab' || hash === '#/lab-3d') return 'scenarios';
  if (hash === '#/lab-fpv') return 'quantum';
  return 'physics';
}
