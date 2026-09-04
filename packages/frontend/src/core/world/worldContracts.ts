import type { GenesisEvent } from '../events/genesisEvent';
import type { Observation, WorldEntity, WorldState } from './scientificWorldState';

/** Observation exposed to presentation is the canonical scientific observation. */
export type WorldObservation = Observation;
export type WorldEvent = GenesisEvent;

export interface WorldEventBridge {
  publish(event: WorldEvent): void;
  subscribe(listener: (event: WorldEvent) => void): () => void;
}

/** Small in-process bridge; it forwards events and owns no scientific state. */
export class DeterministicWorldEventBridge implements WorldEventBridge {
  private readonly listeners = new Set<(event: WorldEvent) => void>();
  publish(event: WorldEvent): void { for (const listener of this.listeners) listener(event); }
  subscribe(listener: (event: WorldEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  clear(): void { this.listeners.clear(); }
}

export type WorldInteractionAction =
  | 'INSPECT' | 'START_EXPERIMENT' | 'PAUSE_EXPERIMENT' | 'RESUME_EXPERIMENT'
  | 'RESET_EXPERIMENT' | 'CHANGE_PARAMETER' | 'RUN_AGAIN' | 'COMPARE_RUN';

export interface WorldInteraction {
  readonly interactionId: string;
  readonly entity: WorldEntity['ref'];
  readonly action: WorldInteractionAction;
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
}

export interface WorldInteractionResult {
  readonly accepted: boolean;
  readonly reason?: string;
  /** Scientific state returned by the scientific command handler, if accepted. */
  readonly state?: WorldState;
}

export type WorldInteractionHandler = (request: WorldInteraction) => WorldInteractionResult;

/** Validates shape and delegates truth-changing actions to the scientific owner. */
export function dispatchWorldInteraction(
  request: WorldInteraction,
  handler: WorldInteractionHandler,
): WorldInteractionResult {
  if (!request.interactionId.trim()) return { accepted: false, reason: 'interactionId is required' };
  if (!request.entity.kind.trim() || request.entity.id === '') return { accepted: false, reason: 'entity reference is required' };
  if (request.action === 'CHANGE_PARAMETER' && (!request.parameters || Object.keys(request.parameters).length === 0)) {
    return { accepted: false, reason: 'CHANGE_PARAMETER requires declared parameters' };
  }
  return handler(request);
}
