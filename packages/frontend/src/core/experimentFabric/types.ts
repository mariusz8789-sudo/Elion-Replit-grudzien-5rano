import type { BiologicalEvidence, BiologicalTarget } from '../biotechDiscoveryContract';
import type { KnowledgeCapability, KnowledgeCorpusFile, KnowledgeVisualization } from '../knowledge/registry';

/** Public contract version for the Genesis Experiment Fabric. */
export const EXPERIMENT_FABRIC_VERSION = '1.0.0';

export type ExperimentOperation = 'compute' | 'simulate' | 'visualize' | 'explain';
export type ExperimentRunStatus = 'completed' | 'hypothetical_visualization' | 'rejected' | 'knowledge_only' | 'capability_seam' | 'engine_not_available' | 'failed';
export type ExperimentSeries = readonly number[];
export type ExperimentValue = number | string | boolean;
export type ExperimentOutputValue = ExperimentValue | ExperimentSeries;

/**
 * Observable shape is explicit so a trajectory/profile is never silently coerced
 * into a scalar. Arrays are ordered: reordering or changing one sample changes
 * the canonical value and therefore the run fingerprint.
 */
export type ExperimentObservableKind = 'scalar' | 'series';

export function experimentObservableKind(value: ExperimentOutputValue): ExperimentObservableKind {
  return Array.isArray(value) ? 'series' : 'scalar';
}

/**
 * Validated data produced from user language. It never contains a computed
 * scientific result; parsing and execution are separate phases.
 */
export type StructuredRequestExecutionStatus = 'NOT_EXECUTED' | 'BLOCKED';

export interface StructuredExperimentRequest {
  contractVersion: string;
  /** Original human command is retained for audit, not evaluated as code. */
  sourceText: string;
  domainId: string;
  operation: ExperimentOperation;
  /** Requested existing model ID, if the user named or parser identified one. */
  modelId?: string;
  /** Flat primitive data only; actual allowed keys are checked by the router. */
  parameters: Record<string, ExperimentValue>;
  requestedVisualization?: KnowledgeVisualization;
  seed?: number;
  /** Explicit status for structured domains without an available executor. */
  executionStatus?: StructuredRequestExecutionStatus;
}

/** The parser's explicit decision before planning or executing anything. */
export interface ExperimentIntent {
  contractVersion: string;
  request: StructuredExperimentRequest;
  capability: KnowledgeCapability;
  confidence: 'high' | 'medium' | 'low';
  /** User-facing reason when a model is absent or a request is ambiguous. */
  rationale: string;
  requiredSolver: string;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  /** Additive, source-bound records; they never upgrade a model capability. */
  supplementalKnowledgeIds: readonly string[];
}

/** Immutable plan presented or consumed before a real engine is called. */
export interface ExperimentPlan {
  contractVersion: string;
  planId: string;
  intent: ExperimentIntent;
  engine: string | null;
  modelVersion: string | null;
  parameterSchema: readonly ExperimentParameterSpec[];
  runnable: boolean;
  route?: ExperimentRoute;
}

export interface ExperimentParameterSpec {
  id: string;
  label: string;
  unit: string;
  type: 'number' | 'boolean' | 'string';
  required: boolean;
  min?: number;
  max?: number;
  default?: ExperimentValue;
}

/** A route is data for an existing engine/UI, never an alternative World State. */
export type ExperimentRoute =
  | { kind: 'analytic'; target: string }
  | { kind: 'live-world'; target: 'epidemic-city'; hash: '#/hf-slice' | '#/city3d' | '#/city' }
  | { kind: 'hypothetical-visualization'; scenarioId: 'philadelphia-legend'; hash: '#/hf-slice?scenario=philadelphia' }
  | { kind: 'lab'; labId: string; experimentId?: string }
  | { kind: 'none' };

export interface ExperimentProvenance {
  contractVersion: string;
  requestFingerprint: string;
  runFingerprint: string;
  knowledgeSources: readonly KnowledgeCorpusFile[];
  supplementalKnowledgeIds: readonly string[];
  domainId: string;
  modelId?: string;
  modelVersion?: string;
  engine: string | null;
  parameterSnapshot: Readonly<Record<string, ExperimentValue>>;
  seed?: number;
  deterministic: boolean;
  /** The source of all numeric output: real engine, never parser or LLM. */
  resultOrigin: 'real-engine' | 'hypothetical-visualization' | 'knowledge-only' | 'capability-seam' | 'engine-not-available';
  /** Present only when this canonical run was executed by the existing backend Fabric endpoint. */
  backendExecution?: {
    backendRunId: string;
    backendEngine: string;
    backendModelVersion: string;
    backendProvenance: Readonly<Record<string, string>>;
  };
}

export interface ExperimentResult {
  contractVersion: string;
  status: ExperimentRunStatus;
  summary: string;
  outputs: Readonly<Record<string, ExperimentOutputValue>>;
  units: Readonly<Record<string, string>>;
  warnings: readonly string[];
  validity?: string;
  assumptions: readonly string[];
  visualization: readonly KnowledgeVisualization[];
  route: ExperimentRoute;
  /** A spatial run may expose count/IDs without duplicating the EventRegistry. */
  eventSummary?: { count: number; types: readonly string[] };
  /** Optional source-bound biological records; present only for knowledge-only biotech results. */
  biologicalTarget?: BiologicalTarget;
  biologicalEvidence?: BiologicalEvidence;
}

/** Canonical record: request → plan → real engine/result → provenance. */
export interface ExperimentRun {
  contractVersion: string;
  runId: string;
  request: StructuredExperimentRequest;
  intent: ExperimentIntent;
  plan: ExperimentPlan;
  result: ExperimentResult;
  provenance: ExperimentProvenance;
}
