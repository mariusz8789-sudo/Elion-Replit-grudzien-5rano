/**
 * PHYSICS WORLD — contracts (integration of the external "Physics World
 * Engine v2" bundle into Genesis, per docs/DECISIONS.md D-052).
 *
 * SCOPE NOTE (read before touching this file): this is a hardening +
 * integration pass over an externally authored design, not a redesign.
 * Every toy model's numerical method is ported as given — the only changes
 * from the source bundle are: (1) reusing Genesis's existing hash provider
 * (`core/events/hash.ts`, FNV-1a) instead of introducing a second,
 * SHA-256-based crypto system (see `core.ts` for why), and (2) wiring the
 * demo's hypothesis-test decision through the existing Genesis Adjudication
 * Protocol (D-047) instead of a bespoke verdict function (see
 * `genesisAdapter.ts`).
 *
 * EVERY model here is `toy: true`. `PYTHIA_ADAPTER` / `GEANT4_ADAPTER` /
 * `EXTERNAL_MATTER` are fail-closed contracts only — `backends.ts` reports
 * them unavailable and `requireBackend()` refuses to run anything against
 * them. No PYTHIA/Geant4 integration is implemented in this pass.
 */

export type ModelFamily = 'PARTICLE_TRANSPORT' | 'ATOMIC' | 'MOLECULAR' | 'MATERIAL' | 'HIGH_ENERGY';
export type BackendKind = 'NATIVE_TOY' | 'PYTHIA_ADAPTER' | 'GEANT4_ADAPTER' | 'EXTERNAL_MATTER';
export type ExperimentStatus = 'COMPLETED' | 'FAILED_CLOSED' | 'ADAPTER_UNAVAILABLE';

export interface ModelCard {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly family: ModelFamily;
  readonly backend: BackendKind;
  /** Always true in this pass — every model here is a pipeline-validation toy, never production physics evidence. */
  readonly toy: boolean;
  readonly validityDomain: string;
  readonly assumptions: readonly string[];
  readonly knownLimitations: readonly string[];
  readonly numericalMethod: string;
  readonly uncertaintyModel: string;
  /** What this model is NOT — carried into every ExperimentRecord and every UI surface, never trimmed. */
  readonly disclosure: string;
}

export interface ParamSpec {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly min: number;
  readonly max: number;
  readonly required: boolean;
}

export interface ProvenanceRef {
  readonly source: string;
  readonly retrievedAt: string;
  readonly hash?: string;
}

export interface ExperimentDefinition {
  readonly experimentId: string;
  readonly problemId: string;
  readonly hypothesisId: string;
  readonly modelId: string;
  readonly parameters: readonly ParamSpec[];
  readonly seed: number;
  readonly observable: string;
  readonly decisionRule?: string;
  readonly provenance: readonly ProvenanceRef[];
  /** Explicit, pipeline-validation-only acceptance of a toy model. Required whenever the resolved ModelCard.toy is true. */
  readonly toyAccepted?: boolean;
  /** Request a specific non-toy backend. Unavailable ⇒ FAIL CLOSED — never a silent fallback to the toy model. */
  readonly backendRequest?: BackendKind;
}

export interface ResultDataset {
  readonly observable: string;
  readonly unit: string;
  readonly values: readonly number[];
  readonly summary: Readonly<Record<string, number>>;
  readonly uncertainty: Readonly<Record<string, number>>;
}

export interface ExperimentRecord {
  readonly experimentId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly parameters: readonly ParamSpec[];
  readonly assumptions: readonly string[];
  readonly numericalMethod: string;
  readonly seed: number;
  readonly provenance: readonly ProvenanceRef[];
  readonly uncertainty: Readonly<Record<string, number>>;
  readonly result: ResultDataset;
  readonly modelCardHash: string;
  readonly reproducibilityFingerprint: string;
  readonly createdAt: string;
  readonly status: ExperimentStatus;
  readonly disclosure: string;
  readonly toy: boolean;
  readonly failReason?: string;
}

export interface BackendAvailability {
  readonly kind: BackendKind;
  readonly available: boolean;
  readonly reason: string;
  readonly version?: string;
}

/** Fail-closed adapter contract only — no PYTHIA integration in this pass. `backends.ts` never reports this available. */
export interface EventGeneratorBackend {
  readonly kind: 'PYTHIA_ADAPTER';
  generate(def: ExperimentDefinition): Promise<ResultDataset>;
}
/** Fail-closed adapter contract only — no Geant4 integration in this pass. `backends.ts` never reports this available. */
export interface TransportBackend {
  readonly kind: 'GEANT4_ADAPTER';
  transport(def: ExperimentDefinition): Promise<ResultDataset>;
}
/** Fail-closed adapter contract only — no external matter engine in this pass. `backends.ts` never reports this available. */
export interface MatterBackend {
  readonly kind: 'EXTERNAL_MATTER';
  solve(def: ExperimentDefinition): Promise<ResultDataset>;
}

export class FailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: 'PARAMS' | 'ADAPTER_UNAVAILABLE' | 'TOY_NOT_ACCEPTED' | 'MODEL',
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'FailClosedError';
  }
}
