import { exploreOrgan, type ExploreState } from './anatomyExplore';
import type { BiologyArtifact } from '../scientificWorlds/biologyRunners';

/**
 * Where the Human Explorer is looking, as one path, and the hooks that will later lead from a cell
 * to a target, a candidate, an experiment and a measurement.
 *
 * The descent is one path: BODY → REGION → ORGAN → STRUCTURE → TISSUE → CELL → MICROSCOPY. The body
 * levels live in ExploreState, the micro levels in the microscope artifact; `focusLevel` reads both,
 * so Back (micro first, then the body levels) walks this same path in reverse.
 *
 * The discovery side is target-agnostic and empty today: no source links an organ or a cell type to a
 * molecular target, candidate or measurement yet. Every field says so (NOT_YET_AVAILABLE /
 * NOT_YET_MEASURED) instead of showing an invented value. When a real source is connected, it fills
 * `discoveryContextFor` and nothing else changes.
 */

export type FocusLevel = 'BODY' | 'REGION' | 'ORGAN' | 'STRUCTURE' | 'TISSUE' | 'CELL' | 'MICROSCOPY';
export const FOCUS_PATH: readonly FocusLevel[] = ['BODY', 'REGION', 'ORGAN', 'STRUCTURE', 'TISSUE', 'CELL', 'MICROSCOPY'];

/** Where a view comes from. The UI shows exactly one of these beside every view. */
export type EpistemicTag = 'MODEL' | 'SIMULATION' | 'PREDICTION' | 'REAL_DATA' | 'REAL_MEASUREMENT' | 'EXTERNAL_REFERENCE' | 'UNKNOWN' | 'BLOCKED';

export interface AnatomyContext {
  readonly organId: string | null;
  readonly tissueId: string | null;
  readonly cellTypeId: string | null;
  /** No neuron-type model exists yet; stays null until one does. */
  readonly neuronTypeId: string | null;
  readonly targetIds: readonly string[];
}

export type Availability<T> =
  | { readonly status: 'AVAILABLE'; readonly items: readonly T[]; readonly source: string }
  | { readonly status: 'NOT_YET_AVAILABLE' }
  | { readonly status: 'NOT_YET_MEASURED' };

export interface DiscoveryContext {
  readonly evidenceSources: Availability<string>;
  readonly candidateIds: Availability<string>;
  readonly predictions: Availability<string>;
  readonly uncertainty: Availability<string>;
  readonly experimentIds: Availability<string>;
  readonly measurementIds: Availability<string>;
}

export function focusLevel(explore: ExploreState, micro: BiologyArtifact | null): FocusLevel {
  if (micro?.kind === 'histology') return 'TISSUE';
  if (micro?.kind === 'hyperscope') return micro.capture.request.magnification >= 500 ? 'MICROSCOPY' : 'CELL';
  if (micro) return 'MICROSCOPY';
  return explore.level;
}

export function anatomyContextOf(explore: ExploreState, micro: BiologyArtifact | null): AnatomyContext {
  const tissue = micro?.kind === 'histology' ? micro.slide.tissueType : micro?.kind === 'hyperscope' ? micro.cell?.tissueType ?? null : null;
  const cell = micro?.kind === 'histology' ? micro.cell.cellId : micro?.kind === 'hyperscope' ? micro.cell?.cellId ?? null : null;
  return { organId: exploreOrgan(explore.organId)?.id ?? null, tissueId: tissue, cellTypeId: cell, neuronTypeId: null, targetIds: [] };
}

const NONE: Availability<string> = { status: 'NOT_YET_AVAILABLE' };

/** No target, candidate or measurement source is connected to the atlas yet, so every field is honestly empty. */
export function discoveryContextFor(_anatomy: AnatomyContext): DiscoveryContext {
  return { evidenceSources: NONE, candidateIds: NONE, predictions: NONE, uncertainty: NONE, experimentIds: NONE, measurementIds: { status: 'NOT_YET_MEASURED' } };
}

/** Every Human Explorer view today is a model: the reference atlas and the virtual microscope alike. */
export function epistemicOf(_level: FocusLevel): EpistemicTag {
  return 'MODEL';
}
