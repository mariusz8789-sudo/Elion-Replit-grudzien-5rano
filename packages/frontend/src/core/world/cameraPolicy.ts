import type { GenesisEvent } from '../events/genesisEvent';
import type { WorldEventBridge } from './worldContracts';

export type WorldCameraMode = 'HUMAN_EYE' | 'WIDE' | 'MACRO' | 'SCIENTIFIC' | 'CINEMATIC';
export interface CameraPolicyDecision { mode: WorldCameraMode; reason: string; eventId: string; timestamp: number; }
export type CameraPolicyListener = (decision: CameraPolicyDecision) => void;

const EVENT_MODES: Readonly<Record<string, WorldCameraMode>> = {
  'experiment.complete': 'WIDE',
  'observation.threshold-crossed': 'MACRO',
  'observation.anomaly': 'SCIENTIFIC',
  'prediction.divergence': 'SCIENTIFIC',
  'prediction.match': 'MACRO',
};

/** Maps canonical Genesis events to presentation intent; it never infers results. */
export function cameraDecisionFor(event: GenesisEvent): CameraPolicyDecision | null {
  const mode = EVENT_MODES[event.type];
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
