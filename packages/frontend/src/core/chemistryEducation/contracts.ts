import type { ExperimentPresentationLevel } from '../../components/ComputationalExperimentPlayback';
import type { ScientificExecutionEvent } from '../backend/client';
import type { ExperimentProtocol } from '../lab/experimentProtocol';
import type { ExperimentSession, ReplayVerdict } from '../scientificWorlds/experimentSession';
import type { SimParams } from '../types';

/**
 * CHEMISTRY LIVE LAB — the education layer's contracts.
 *
 * This layer owns no chemistry. Every number it shows is produced by an
 * existing canonical model (core/physics.ts, labs/experiments/*,
 * core/modelGraph/chemistryKineticsGraph.ts, @genesis/core ThermodynamicLabEngine)
 * or read from an existing dataset (data/elements.ts, data/electronegativity.ts,
 * data/periodicTrends.ts). It adds the governed catalog, the reaction-model
 * boundary, the safety classification, the live stage timeline and the three
 * presentation depths around them.
 */

/** COMPUTATIONAL_LIVE = a real registered engine executes and only its real events are shown. */
export type ChemistryLiveKind = 'COMPUTATIONAL_LIVE' | 'EDUCATIONAL_PROCEDURE_MODEL';

export const EDUCATIONAL_PROCEDURE_LABEL = 'EDUCATIONAL PROCEDURE MODEL — NOT PHYSICAL LAB TELEMETRY';

export type ChemistrySafetyClass = 'CLASSROOM_SAFE_MODEL' | 'TEACHER_REVIEW' | 'BLOCKED_HAZARDOUS';

/** The same three depths ComputationalExperimentPlayback / VirtualLabPanel already use. */
export type ChemistryPresentationLevel = ExperimentPresentationLevel;
export const CHEMISTRY_PRESENTATION_LEVELS: readonly ChemistryPresentationLevel[] = ['SCHOOL', 'UNIVERSITY', 'RESEARCH'];

export type ChemistryPlanStatus =
  | 'READY'
  | 'REQUIRES_TEACHER_REVIEW'
  | 'BLOCKED_HAZARDOUS'
  | 'UNSUPPORTED_REACTION_MODEL'
  | 'UNKNOWN_EXPERIMENT'
  | 'BLOCKED_MISSING_DATA'
  | 'BLOCKED_INVALID_PARAMETERS'
  | 'BLOCKED_PHYSICAL_ACTUATION';

export type ChemistryExperimentId =
  | 'acid-base-titration'
  | 'vsepr-geometry'
  | 'bond-polarity'
  | 'element-structure'
  | 'reaction-thermochemistry'
  | 'arrhenius-kinetics';

/** Where the numbers come from. A binding always names an existing, tested implementation. */
export interface ChemistryModelBinding {
  readonly kind: 'LOCAL_CANONICAL_RUNNER' | 'BACKEND_FABRIC_MODEL' | 'CANONICAL_DATASET';
  /** Source path + symbol of the canonical implementation. */
  readonly ref: string;
  /** The backend registry model that runs the same shared runner, when one exists. */
  readonly backendModelId?: string;
  readonly version: string;
}

export type ChemistryParamValue = string | number;
export type ChemistryParams = Readonly<Record<string, ChemistryParamValue>>;

export interface ChemistryParameterSpec {
  readonly key: string;
  readonly label: string;
  readonly type: 'select' | 'number' | 'element';
  readonly options?: readonly { readonly value: string; readonly label: string }[];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly unit?: string;
  readonly default: ChemistryParamValue;
}

export interface ChemistryQuizQuestion {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correctIndex: number;
  readonly explanation: string;
}

/** Which existing lab scene renders this experiment (labs/*: ExperimentDef createSim / createSim3D). */
export interface ChemistryVisualBinding {
  readonly labId: 'chemistry';
  readonly experimentId: 'titration' | 'bond-polarity-2d' | 'chemistry-vsepr';
}

export interface ChemistryExperimentTemplate {
  readonly experimentId: ChemistryExperimentId;
  readonly title: string;
  /** The question the learner is answering. */
  readonly question: string;
  readonly levels: readonly ChemistryPresentationLevel[];
  readonly liveKind: ChemistryLiveKind;
  readonly modelBinding: ChemistryModelBinding;
  /** Class before parameters are known; the planner refines it per reaction/element. */
  readonly defaultSafetyClass: ChemistrySafetyClass;
  readonly parameters: readonly ChemistryParameterSpec[];
  readonly expectedObservations: readonly string[];
  /** Only where the model actually uses it. */
  readonly equation?: string;
  readonly sources: readonly string[];
  readonly limitations: readonly string[];
  readonly quiz: readonly ChemistryQuizQuestion[];
  readonly protocol: ExperimentProtocol;
  readonly visual?: ChemistryVisualBinding;
}

/** Everything the planner decided, before anything runs. */
export interface ChemistryExperimentPlan {
  readonly status: ChemistryPlanStatus;
  readonly experimentId: string;
  readonly template?: ChemistryExperimentTemplate;
  readonly params?: ChemistryParams;
  readonly safetyClass?: ChemistrySafetyClass;
  readonly reason?: string;
  /** For a hazardous-but-modelled case: what may still be explained safely, without procedure steps. */
  readonly conceptOnly?: { readonly equation: string; readonly explanation: string };
}

export type ChemistryStageKind =
  | 'QUESTION'
  | 'EXPERIMENT_SELECTED'
  | 'PLAN'
  | 'SAFETY_CHECK'
  | 'PREPARATION'
  | 'STEP'
  | 'OBSERVATION'
  | 'ANALYSIS'
  | 'RESULT'
  | 'EXPLANATION'
  | 'LEARNING_CHECK';

/** A value on screen always says it was computed by a model; nothing here is ever an instrument reading. */
export interface ChemistryObservation {
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly origin: 'MODEL_COMPUTED' | 'CANONICAL_DATASET' | 'BACKEND_ENGINE_OUTPUT';
}

export interface ChemistryStage {
  readonly stageId: string;
  readonly kind: ChemistryStageKind;
  readonly label: string;
  readonly detail: string;
  readonly observation?: ChemistryObservation;
  /** Parameters for the existing lab scene at this stage (e.g. titrant volume). */
  readonly visualParams?: SimParams;
}

/** The artifact of one run: the stages and values shown are this run's and nothing else. */
export interface ChemistryRunArtifact {
  readonly stages: readonly ChemistryStage[];
  readonly equation?: string;
  readonly resultSummary: string;
  readonly explanation: { readonly school: string; readonly university: string };
  readonly assumptions: readonly string[];
}

export interface ChemistryTimelineEvent {
  readonly eventId: string;
  readonly stageId: string;
  readonly kind: ChemistryStageKind;
  readonly label: string;
  readonly detail: string;
  /** Deterministic offset for EDUCATIONAL_PROCEDURE_MODEL playback; never used for computational runs. */
  readonly atMs: number;
  readonly observation?: ChemistryObservation;
}

export type ChemistryEvidenceEligibility =
  | { readonly eligible: false; readonly code: 'EDUCATIONAL_MODEL_NOT_EVIDENCE' | 'EPHEMERAL_RUN_NOT_PERSISTED' | 'EXECUTION_NOT_COMPLETED'; readonly reason: string }
  | { readonly eligible: true; readonly code: 'PERSISTED_PROJECT_RUN'; readonly reason: string };

/** A completed educational run: sealed as a canonical ExperimentSession. */
export interface ChemistryEducationalRun {
  readonly liveKind: 'EDUCATIONAL_PROCEDURE_MODEL';
  readonly label: typeof EDUCATIONAL_PROCEDURE_LABEL;
  readonly plan: ChemistryExperimentPlan;
  readonly session: ExperimentSession;
  readonly artifact: ChemistryRunArtifact;
  readonly timeline: readonly ChemistryTimelineEvent[];
  readonly evidence: ChemistryEvidenceEligibility;
}

/** One real backend execution in a computational run. */
export interface ChemistryBackendExecution {
  readonly runId: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly engine: string | null;
  readonly inputs: Readonly<Record<string, number>>;
  readonly outputs: Readonly<Record<string, number>>;
  readonly persisted: boolean;
  readonly provenance: { readonly source: string; readonly formula: string; readonly honesty: string } | null;
}

export interface ChemistryComputationalRun {
  readonly liveKind: 'COMPUTATIONAL_LIVE';
  readonly plan: ChemistryExperimentPlan;
  readonly status: 'COMPLETED' | 'FAILED' | 'BLOCKED';
  readonly events: readonly ScientificExecutionEvent[];
  readonly executions: readonly ChemistryBackendExecution[];
  /** Sealed from the backend outputs; replay re-executes the same shared runner. */
  readonly session: ExperimentSession | null;
  readonly artifact: ChemistryRunArtifact | null;
  readonly evidence: ChemistryEvidenceEligibility;
  readonly failureReason?: string;
}

export type ChemistryRun = ChemistryEducationalRun | ChemistryComputationalRun;

export type ChemistryReplay = ReplayVerdict;
