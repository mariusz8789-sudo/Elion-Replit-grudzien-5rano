import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export interface WorldEntityState {
  readonly entityId: string;
  readonly kind: string;
  readonly position: readonly [number, number, number];
  readonly scalarState: Readonly<Record<string, number>>;
  readonly labels: Readonly<Record<string, string>>;
}

export interface RenderProbeResult {
  readonly entityId: string;
  readonly visible: boolean;
  readonly frameFingerprint: string;
  readonly renderedScalarState: Readonly<Record<string, number>>;
}

/**
 * Transfer seam for the EXISTING canonical Genesis WorldGraph/renderer.
 * During real integration Claude must adapt this to the repository's actual WorldGraph,
 * never create a second world or renderer.
 */
export interface CanonicalWorldVisualizationPort {
  upsertScientificEntity(entity: WorldEntityState): void;
  readScientificEntity(entityId: string): WorldEntityState | undefined;
  renderProbe(entityId: string): RenderProbeResult;
}

export interface WorldTwinBindingInput {
  readonly entityId: string;
  readonly kind: string;
  readonly position: readonly [number, number, number];
  readonly predictedValue: number;
  readonly measuredValue: number;
  readonly residual: number;
  readonly unit: string;
  readonly provenance: readonly string[];
}

export interface WorldTwinBindingResult {
  readonly entityId: string;
  readonly visible: boolean;
  readonly worldStateFingerprint: string;
  readonly frameFingerprint: string;
}

export function bindTwinStateToCanonicalWorld(
  runtime: LabRuntime,
  world: CanonicalWorldVisualizationPort,
  input: WorldTwinBindingInput,
): WorldTwinBindingResult {
  const entity: WorldEntityState = {
    entityId: input.entityId,
    kind: input.kind,
    position: input.position,
    scalarState: {
      predictedValue: input.predictedValue,
      measuredValue: input.measuredValue,
      residual: input.residual,
    },
    labels: { unit: input.unit, epistemicStatus: 'HYBRID_DERIVED' },
  };
  world.upsertScientificEntity(entity);
  const stored = world.readScientificEntity(input.entityId);
  if (stored === undefined) throw new Error('Canonical world did not retain bound scientific entity');
  const probe = world.renderProbe(input.entityId);
  if (!probe.visible) throw new Error('Canonical render probe did not observe bound scientific entity');
  if (probe.renderedScalarState.residual !== input.residual) throw new Error('Rendered scientific state does not match twin residual');
  const result: WorldTwinBindingResult = {
    entityId: input.entityId,
    visible: probe.visible,
    worldStateFingerprint: runtime.deterministic.fingerprint(stored),
    frameFingerprint: probe.frameFingerprint,
  };
  emitLabEvidence(runtime, {
    type: 'WORLD_TWIN_VISUALIZED',
    modelId: 'D140_WORLD_TWIN_BINDING',
    solverId: 'canonical-world-adapter-v1',
    input,
    result,
    epistemicStatus: 'HYBRID_DERIVED',
    evidenceClass: 'DERIVED',
    provenance: input.provenance,
    limitations: ['Standalone E2E uses a deterministic canonical-world fixture. Real Genesis integration must bind this seam to the existing WorldGraph and renderer.'],
  });
  return result;
}
