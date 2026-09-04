import type { GenesisEvent } from '../events/genesisEvent';
import type { WorldState } from './scientificWorldState';
import type { WorldCameraMode } from './cameraPolicy';

export interface InvestigationState {
  readonly question?: string;
  readonly selectedEntityId?: string;
  readonly priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

export interface ScienceDirectorContext {
  readonly state: WorldState;
  readonly events: readonly GenesisEvent[];
  readonly investigation: InvestigationState;
}

export interface ScienceDirectorDecision {
  readonly focusEntityId?: string;
  readonly cameraMode?: WorldCameraMode;
  readonly observationIds: readonly string[];
  readonly narration?: string;
}

/** Future director boundary: consumes truth, returns presentation priorities only. */
export interface ScienceDirector {
  decide(context: ScienceDirectorContext): ScienceDirectorDecision;
}

/** Conservative default; it never invents a focus or narration. */
export const passiveScienceDirector: ScienceDirector = {
  decide: ({ investigation }) => ({
    ...(investigation.selectedEntityId === undefined ? {} : { focusEntityId: investigation.selectedEntityId }),
    observationIds: [],
  }),
};
