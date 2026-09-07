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
  // C3 Scientific World Model event types (Genesis Scientific World Model 3.0, section 16) — the
  // SAME table, extended with real canonical event types C3's world model actually emits (see
  // core/worldModel/domains/genesisScientificCity3.ts and generation/worldGenerator.ts), not a
  // second camera-policy mechanism. Literal strings match this table's own existing convention
  // rather than importing C3 constants into C1's presentation layer.
  'world.generation.completed': 'WIDE', // a newly created world: establish it wide before anything else
  'environment.rainfall.extreme': 'WIDE', // environmental/city-scale context, not a single entity
  'hydraulics.pumppipe.tripped': 'SCIENTIFIC', // an equipment failure worth close scientific inspection
  'building.waterservice.interrupted': 'MACRO', // building-scale consequence
  'population.hospitalaccess.impaired': 'WIDE', // population/city-scale consequence
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
