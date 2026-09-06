import type { GenesisEvent } from '../events/genesisEvent';
import type { WorldEventBridge } from './worldContracts';

export type WorldCameraMode = 'HUMAN_EYE' | 'WIDE' | 'MACRO' | 'SCIENTIFIC' | 'CINEMATIC';
export interface CameraPolicyDecision { mode: WorldCameraMode; reason: string; eventId: string; timestamp: number; }
export type CameraPolicyListener = (decision: CameraPolicyDecision) => void;

const EVENT_MODES: Readonly<Record<string, WorldCameraMode>> = {
  'experiment.complete': 'WIDE',
  'infection.transmission': 'MACRO',
  'observation.threshold-crossed': 'MACRO',
  'observation.anomaly': 'SCIENTIFIC',
  'prediction.divergence': 'SCIENTIFIC',
  'prediction.match': 'MACRO',
};

/**
 * The camera mode a canonical event type asks for, or null when that event
 * type has no presentation opinion. Exposed separately from
 * `cameraDecisionFor` so an offline planner (the Looking Glass shot plan)
 * can reuse the SAME table from a stored event type, without having to
 * fabricate a whole `GenesisEvent` just to look one value up.
 */
export function cameraModeForEventType(type: string): WorldCameraMode | null {
  return EVENT_MODES[type] ?? null;
}

/** Maps canonical Genesis events to presentation intent; it never infers results. */
export function cameraDecisionFor(event: GenesisEvent): CameraPolicyDecision | null {
  const mode = cameraModeForEventType(event.type);
  if (!mode) return null;
  return { mode, eventId: event.id, timestamp: event.timestamp, reason: `Camera response to ${event.type} (${event.id})` };
}

export class ObservationCameraPolicy {
  private unsubscribe: (() => void) | null = null;
  private last: CameraPolicyDecision | null = null;
  constructor(private readonly bridge: WorldEventBridge, private readonly listener: CameraPolicyListener) {}
  connect(): void {
    this.disconnect();
    this.unsubscribe = this.bridge.subscribe((event) => {
      const decision = cameraDecisionFor(event);
      if (!decision) return;
      this.last = decision;
      this.listener(decision);
    });
  }
  disconnect(): void { this.unsubscribe?.(); this.unsubscribe = null; }
  get lastDecision(): CameraPolicyDecision | null { return this.last; }
}
