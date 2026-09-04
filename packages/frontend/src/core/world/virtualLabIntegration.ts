import type { ExperimentRun } from '../experimentFabric/types';
import { ObservationCameraPolicy, type CameraPolicyListener } from './cameraPolicy';
import { captureWorldTimeline, type WorldCaptureTimeline } from './worldCapture';
import { ScientificWorldRuntime, type WorldScene, type WorldSnapshot } from './worldRuntime';
import { DeterministicWorldEventBridge } from './worldContracts';
import type { WorldState } from './scientificWorldState';

export interface VirtualLabIntegration {
  readonly runtime: ScientificWorldRuntime;
  readonly bridge: DeterministicWorldEventBridge;
  readonly camera: ObservationCameraPolicy;
  load(state: WorldState): WorldSnapshot;
  sync(state: WorldState): WorldSnapshot;
  capture(run: ExperimentRun, states: readonly WorldState[]): WorldCaptureTimeline;
  dispose(): void;
}

/** Composition root for an existing Virtual Lab scene; no science or renderer logic lives here. */
export function createVirtualLabIntegration(scene: WorldScene, onCameraDecision: CameraPolicyListener): VirtualLabIntegration {
  const bridge = new DeterministicWorldEventBridge();
  const runtime = new ScientificWorldRuntime(scene);
  const camera = new ObservationCameraPolicy(bridge, onCameraDecision);
  camera.connect();
  const publishStateEvents = (state: WorldState) => { for (const event of state.events) bridge.publish(event); };
  return {
    runtime, bridge, camera,
    load: (state) => { const snapshot = runtime.load(state); publishStateEvents(state); return snapshot; },
    sync: (state) => { const snapshot = runtime.sync(state); publishStateEvents(state); return snapshot; },
    capture: (run, states) => captureWorldTimeline(run, states),
    dispose: () => { camera.disconnect(); runtime.dispose(); bridge.clear(); },
  };
}
