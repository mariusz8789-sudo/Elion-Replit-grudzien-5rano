/**
 * VIRTUAL BIO / VIRTUAL MICROSCOPE — contracts (docs/DECISIONS.md D-054).
 *
 * Integration of an externally authored bundle as its own, narrowly scoped
 * module. Every model here is `toy: true` and every result's evidence class
 * is fixed to `IN_SILICO_MODEL` — never a real ranking/adjudication/
 * falsification engine, never wet-lab/animal/human/clinical evidence. See
 * this file's sibling modules' headers for what each piece does and does
 * not do; `gov.ts` documents how the G1-G4 pillars relate to (but never
 * call into) the EXISTING Genesis pipelines.
 */

export type BioFamily = 'CELL_POPULATION' | 'PBPK' | 'RECEPTOR' | 'AMR';
export type GovPillar = 'G1' | 'G2' | 'G3' | 'G4';
export type BioStatus = 'COMPLETED' | 'FAILED_CLOSED';

export interface BioModelCard {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly family: BioFamily;
  /** Always true — every model in this module is a pipeline-validation toy, never production biological evidence. */
  readonly toy: true;
  readonly validityDomain: string;
  readonly assumptions: readonly string[];
  readonly knownLimitations: readonly string[];
  readonly numericalMethod: string;
  readonly uncertaintyModel: string;
  /** What this model is NOT — carried into every BioExperimentRecord and every UI surface. */
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

export interface BioExperimentDefinition {
  readonly experimentId: string;
  readonly pillar: GovPillar;
  readonly problemId: string;
  readonly hypothesisId: string;
  readonly modelId: string;
  readonly parameters: readonly ParamSpec[];
  readonly seed: number;
  readonly observable: string;
  readonly provenance: readonly ProvenanceRef[];
  readonly toyAccepted?: boolean;
  readonly decisionRule?: string;
}

export interface BioResult {
  readonly observable: string;
  readonly unit: string;
  readonly values: readonly number[];
  readonly summary: Readonly<Record<string, number>>;
  readonly uncertainty: Readonly<Record<string, number>>;
}

export interface BioExperimentRecord {
  readonly experimentId: string;
  readonly pillar: GovPillar;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly parameters: readonly ParamSpec[];
  readonly assumptions: readonly string[];
  readonly numericalMethod: string;
  readonly seed: number;
  readonly provenance: readonly ProvenanceRef[];
  readonly uncertainty: Readonly<Record<string, number>>;
  readonly result: BioResult;
  readonly modelCardHash: string;
  readonly reproducibilityFingerprint: string;
  readonly createdAt: string;
  readonly status: BioStatus;
  readonly disclosure: string;
  readonly toy: true;
  /** Fixed for every record this module produces — see item 3 of the mandate: IN_SILICO_MODEL never satisfies evidence-minimum for a WINNER (`core/agent/practicalCandidateGate.ts::MINIMUM_OBSERVATIONS`/`EVIDENCE_SUFFICIENT`), because nothing in this module feeds that gate. */
  readonly evidenceClass: 'IN_SILICO_MODEL';
  readonly failReason?: string;
}

export type Stain = 'VIABILITY' | 'STATE' | 'NONE';

export interface MicroscopeViewSpec {
  readonly recordFingerprint: string;
  readonly seed: number;
  readonly zoom: number;
  readonly fieldIndex: number;
  readonly stain: Stain;
}

export type CellState = 'LIVE' | 'APOPTOTIC' | 'NECROTIC' | 'RESISTANT';

export interface DrawCommand {
  readonly kind: 'cell';
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly state: CellState;
  readonly color: string;
}

export interface MicroscopeFrame {
  readonly commands: readonly DrawCommand[];
  readonly viewFingerprint: string;
  readonly note?: string;
}

export interface TaggedValue {
  readonly value: string;
  readonly tag: 'NO_DATA' | 'ASSUMPTION' | 'MODEL_OUTPUT';
}

export interface PublicValueDraft {
  readonly pillar: GovPillar;
  readonly fields: Readonly<Record<string, TaggedValue>>;
  readonly firewall: string;
}

export class FailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: 'PARAMS' | 'TOY_NOT_ACCEPTED' | 'MODEL',
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'FailClosedError';
  }
}
