import { getKnowledgeDomain } from '../knowledge/registry';
import { listRouterModels, type RouterModel } from './router';
import type { ExperimentRoute } from './types';

export type CapabilityAdmissionStatus = 'CONNECTED' | 'MODEL_AVAILABLE' | 'VERIFY_REQUIRED' | 'PARKED';

export interface CapabilityAdmissionRecord {
  readonly modelId: string;
  readonly domainId: string;
  readonly modelVersion: string;
  readonly capability: string;
  readonly status: CapabilityAdmissionStatus;
  readonly engine: string;
  readonly route: ExperimentRoute;
  readonly routeRegistered: boolean;
  readonly parameterCount: number;
  readonly knowledgeSourceCount: number;
  readonly limitations: string;
  readonly proofBoundary: string;
}

function statusFor(model: RouterModel, capability: string): CapabilityAdmissionStatus {
  if (capability === 'HYPOTHETICAL_VISUALIZATION' || capability === 'CAPABILITY_SEAM' || capability === 'ENGINE_NOT_AVAILABLE') return 'PARKED';
  if (model.id === 'quantum-chemistry-pyscf-h2-rhf') return 'CONNECTED';
  if (capability === 'BACKEND_REAL_ENGINE') return 'VERIFY_REQUIRED';
  return 'MODEL_AVAILABLE';
}

export function buildCapabilityAdmissionMatrix(): readonly CapabilityAdmissionRecord[] {
  return listRouterModels().map((model) => {
    const domain = getKnowledgeDomain(model.domainId);
    const capability = model.capability ?? domain?.capability ?? 'VERIFY_REQUIRED';
    return {
      modelId: model.id,
      domainId: model.domainId,
      modelVersion: model.modelVersion,
      capability,
      status: statusFor(model, capability),
      engine: model.engine,
      route: model.route,
      routeRegistered: model.route.kind !== 'none',
      parameterCount: model.parameters.length,
      knowledgeSourceCount: model.knowledgeSources.length,
      limitations: model.rationale,
      proofBoundary: capability === 'BACKEND_REAL_ENGINE'
        ? 'Backend execution requires explicit confirmation, engine provenance and runtime availability.'
        : 'Model output remains bounded by the registered model rationale and route.',
    };
  });
}

export function assertCapabilityAdmissionMatrix(matrix: readonly CapabilityAdmissionRecord[] = buildCapabilityAdmissionMatrix()): void {
  const ids = new Set<string>();
  for (const record of matrix) {
    if (ids.has(record.modelId)) throw new Error(`Capability Admission Matrix contains duplicate model: ${record.modelId}`);
    ids.add(record.modelId);
    if (!record.modelVersion || !record.engine || !record.domainId || !record.capability) {
      throw new Error(`Capability Admission Matrix has incomplete identity for ${record.modelId}`);
    }
    if (!record.limitations || !record.proofBoundary) {
      throw new Error(`Capability Admission Matrix has no explicit limitation/proof boundary for ${record.modelId}`);
    }
    if (record.status === 'CONNECTED' && record.capability === 'ENGINE_NOT_AVAILABLE') {
      throw new Error(`Capability Admission Matrix cannot mark unavailable engine connected: ${record.modelId}`);
    }
  }
}

export function serializeCapabilityAdmissionMatrix(matrix: readonly CapabilityAdmissionRecord[] = buildCapabilityAdmissionMatrix()): string {
  assertCapabilityAdmissionMatrix(matrix);
  return JSON.stringify(matrix, null, 2);
}
