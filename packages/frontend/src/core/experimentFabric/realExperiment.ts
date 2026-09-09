import { canonicalJson, fnv1a } from '../events/hash';
import type { DataProvenance } from '../dataProvenance';
import { fingerprintExperimentPlan, fingerprintStructuredRequest } from './provenance';
import {
  EXPERIMENT_FABRIC_VERSION,
  type ExperimentOutputValue,
  type ExperimentPlan,
  type ExperimentResult,
  type ExperimentRun,
  type StructuredExperimentRequest,
} from './types';

/**
 * THE REAL EXPERIMENT CONTRACT — an EXTENSION of the existing Experiment
 * Fabric, not a second Fabric. A real experiment answers the SAME kind of
 * question a solver-executed run already answers (a `StructuredExperimentRequest`),
 * through a different execution path: a physical apparatus instead of
 * `executor.ts`'s solver dispatch. So a completed real experiment is built to
 * BE an `ExperimentRun` — the exact type `evidencePack.ts`, `scienceMemory.ts`,
 * `experimentGraph.ts` and every other Evidence/Memory/UI consumer already
 * accepts — rather than a parallel record type those consumers would need new
 * code to understand.
 *
 * ## What this file deliberately does NOT do
 *
 * It does not talk to any instrument, lab, or external API — "Nie
 * integrować jeszcze konkretnego sprzętu ani laboratorium" is the standing
 * instruction. `createRealExperimentRun` below takes `RawMeasurement`s and
 * `DerivedMeasurement`s that SOME caller already obtained — typed in by a
 * human reading a lab notebook today, an automated instrument feed
 * tomorrow — and assembles them into a properly-shaped, honestly-provenanced
 * `ExperimentRun`. That is the whole contract: the shape a later real result
 * can be entered through without any architecture change, not a connection
 * to real hardware.
 *
 * ## Why `EvidencePackage` and `ExperimentalAssessment` are not redefined here
 *
 * They already exist. `ScientificEvidencePack` (`evidencePack.ts`) is the
 * portable evidence record; `ScientificEvidenceChain['assessment']`
 * (`scientificDiscovery.ts`) is the falsification verdict. A real experiment
 * run participates in both unchanged, once it is a valid `ExperimentRun` —
 * `createScientificEvidencePack` and `assessPredeclaredCriterion` do not
 * care whether the run behind an `ExperimentArm` came from a solver or a
 * bench, only that it is a real, completed `ExperimentRun`. Inventing new
 * types for these would be exactly the duplicate-Fabric risk this contract
 * is required to avoid.
 *
 * ## The two honest reuses that make this possible
 *
 * - `resultOrigin: 'real-engine'` — its own doc comment already says "the
 *   source of all numeric output: real engine, never parser or LLM." A
 *   physical measurement is even more legitimately that than a solver run,
 *   so every existing `=== 'real-engine'` gate (cascade eligibility, Evidence
 *   Pack construction, Scenario Capsule checks) correctly admits a real
 *   experiment run without modification.
 * - `dataProvenance: 'REAL_EXPERIMENTAL'` — the NEW, separate axis
 *   (`core/dataProvenance.ts`) that disambiguates WHICH kind of "real":
 *   this is what stops a real measurement from ever being displayed or
 *   reasoned about as if Genesis's own solver produced it.
 */

/**
 * A request for a real, physical measurement. Wraps the same
 * `StructuredExperimentRequest` a solver would answer — same domain,
 * operation, parameters, question — plus exactly what a solver-side request
 * has no field for: which physical protocol answers it. No instrument or lab
 * identifier is required or assumed; `physicalProtocolRef` is an opaque
 * reference a future integration is free to define.
 */
export interface RealExperimentRequest {
  readonly structuredRequest: StructuredExperimentRequest;
  readonly physicalProtocolRef: string;
  /** Links back to the Discovery Engine hypothesis this measurement tests, when there is one. */
  readonly hypothesisId?: string;
}

/**
 * One raw instrument/observer reading, before any processing. Never itself
 * an `ExperimentOutputValue` — that would silently promote an unprocessed
 * number to a reportable result. `DerivedMeasurement.derivedFrom` is the
 * only place raw readings connect to a result, and that connection must be
 * explicit.
 */
export interface RawMeasurement {
  readonly channel: string;
  readonly value: number;
  readonly unit: string;
  readonly capturedAt: string;
}

/**
 * A raw measurement processed into the same output shape
 * `ExperimentResult.outputs` already uses, so a real experiment's derived
 * data needs no new consumer code anywhere in Fabric/Evidence/Memory/UI —
 * only a new PRODUCER (this file) of the same shape.
 */
export interface DerivedMeasurement {
  /** Matches an `ExperimentResult.outputs` key. */
  readonly outputKey: string;
  readonly value: ExperimentOutputValue;
  readonly unit: string;
  /** Honest lineage — a derived value with no raw readings behind it is a fabrication, not a measurement. */
  readonly derivedFrom: readonly RawMeasurement[];
}

/**
 * A completed real-experiment run. Structurally `ExperimentRun` exactly —
 * every existing consumer already knows this shape — narrowed only by the
 * convention that `provenance.dataProvenance` is always `'REAL_EXPERIMENTAL'`.
 * There is no separate `RealExperimentRun` runtime type to keep in sync with
 * `ExperimentRun`; there is exactly one `ExperimentRun`, and this is what a
 * real-experimental instance of it looks like.
 */
export type RealExperimentRun = ExperimentRun;

function realExperimentProvenanceDataProvenance(): DataProvenance {
  return 'REAL_EXPERIMENTAL';
}

/**
 * THE SECOND HONEST BRIDGE — a cited, published REFERENCE figure (never a
 * physical measurement, never Genesis's own solver), assembled into the same
 * `ExperimentRun` shape as `createRealExperimentRun` above. This exists so
 * "close the loop with real data" does not have to wait on a physical lab
 * partner: a real, citable number (e.g. generator-sizing manufacturer
 * guidance already quoted in `electricalGenerator.ts`'s own doc comment) can
 * be compared against a Genesis prediction TODAY, honestly tagged
 * `dataProvenance: 'REFERENCE'` — never `REAL_EXPERIMENTAL` (no instrument
 * produced it) and never `SIMULATED` (Genesis's own solver did not compute
 * it).
 *
 * `resultOrigin: 'knowledge-only'` is the existing, correct mapping —
 * `dataProvenanceForResultOrigin('knowledge-only')` already returns
 * `'REFERENCE'` (see `provenance.ts`). This reuses that mapping rather than
 * inventing a new one.
 */
export interface ReferenceCitation {
  /** The published claim itself, quoted or closely paraphrased — never invented. */
  readonly citationText: string;
  /** Where this figure comes from — a source name, URL, or an in-repo pointer to an existing cited constant. */
  readonly sourceRef: string;
}

export interface ReferenceMeasurementRequest {
  readonly structuredRequest: StructuredExperimentRequest;
  readonly citation: ReferenceCitation;
  /** Links back to the Discovery Engine hypothesis this reference figure tests, when there is one. */
  readonly hypothesisId?: string;
}

/**
 * A cited value, already shaped like `ExperimentResult.outputs` so it needs
 * no new consumer code anywhere in Fabric/Evidence/Memory/UI — only a new
 * PRODUCER (this file) of the same shape. No raw-reading lineage: a citation
 * is not derived from instrument samples, it is quoted from a source.
 */
export interface DerivedReferenceValue {
  readonly outputKey: string;
  readonly value: ExperimentOutputValue;
  readonly unit: string;
}

/** Structurally `ExperimentRun` exactly, narrowed by `provenance.dataProvenance === 'REFERENCE'`. */
export type ReferenceMeasurementRun = ExperimentRun;

function referenceProvenanceDataProvenance(): DataProvenance {
  return 'REFERENCE';
}

/**
 * Assembles an already-obtained citation into a valid, honestly-provenanced
 * `ExperimentRun`. Calls no external API, invents no source: every citation
 * text and source reference was already produced by the caller.
 */
export function createReferenceMeasurementRun(input: {
  request: ReferenceMeasurementRequest;
  derived: readonly DerivedReferenceValue[];
  summary: string;
  assumptions?: readonly string[];
  warnings?: readonly string[];
}): ReferenceMeasurementRun {
  const { request } = input;
  if (request.citation.citationText.trim().length === 0) {
    throw new Error('A reference measurement needs a non-empty citationText — an unattributed claim cannot become a reference measurement.');
  }
  if (request.citation.sourceRef.trim().length === 0) {
    throw new Error('A reference measurement needs a non-empty sourceRef — a citation with no traceable source cannot be verified.');
  }
  if (input.derived.length === 0) {
    throw new Error('A reference measurement run needs at least one derived value — nothing was cited.');
  }
  for (const measurement of input.derived) {
    if (!Number.isFinite(measurement.value)) {
      throw new Error(`Cited value "${measurement.outputKey}" is not a finite number.`);
    }
  }

  const outputs: Record<string, ExperimentOutputValue> = {};
  const units: Record<string, string> = {};
  for (const measurement of input.derived) {
    outputs[measurement.outputKey] = measurement.value;
    units[measurement.outputKey] = measurement.unit;
  }

  const result: ExperimentResult = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status: 'completed',
    summary: input.summary,
    outputs,
    units,
    warnings: input.warnings ?? [],
    assumptions: input.assumptions ?? [request.citation.citationText],
    visualization: [],
    route: { kind: 'none' },
  };

  const plan: ExperimentPlan = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    planId: `reference-measurement-plan_${fnv1a(canonicalJson({ source: request.citation.sourceRef, request: request.structuredRequest }))}`,
    intent: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      request: request.structuredRequest,
      // Honest reuse of the SAME mapping `dataProvenanceForResultOrigin` already
      // makes for a static corpus lookup — not a fabricated capability.
      capability: 'KNOWLEDGE_ONLY',
      confidence: 'high',
      rationale: `Cited reference figure from ${request.citation.sourceRef}, not a Genesis solver route.`,
      requiredSolver: 'none',
      knowledgeSources: [],
      supplementalKnowledgeIds: [],
    },
    engine: null,
    modelVersion: null,
    parameterSchema: [],
    runnable: true,
    route: { kind: 'none' },
  };

  const requestFingerprint = fingerprintStructuredRequest(request.structuredRequest);
  const runFingerprint = `run_${fnv1a(canonicalJson({
    requestFingerprint,
    planFingerprint: fingerprintExperimentPlan(plan),
    sourceRef: request.citation.sourceRef,
    status: result.status,
    outputs: result.outputs,
    units: result.units,
  }))}`;

  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: runFingerprint,
    request: request.structuredRequest,
    intent: plan.intent,
    plan,
    result,
    provenance: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      requestFingerprint,
      runFingerprint,
      knowledgeSources: [],
      supplementalKnowledgeIds: [],
      domainId: request.structuredRequest.domainId,
      modelId: request.structuredRequest.modelId,
      engine: null,
      parameterSnapshot: { ...request.structuredRequest.parameters },
      // A cited figure is stable and reproducible by construction — re-quoting
      // the same source always yields the same value, unlike a fresh physical
      // reading's real noise.
      deterministic: true,
      resultOrigin: 'knowledge-only',
      dataProvenance: referenceProvenanceDataProvenance(),
    },
  };
}

/**
 * Assembles already-obtained raw and derived measurements into a valid,
 * honestly-provenanced `ExperimentRun` — the seam a later real result enters
 * through. Calls no instrument, no lab API, no network: every value it
 * touches was already produced by its caller.
 *
 * `derived` becomes `ExperimentResult.outputs` unchanged in shape, so it
 * flows into `createScientificEvidencePack`, `scienceMemory.ts`,
 * `experimentGraph.ts` exactly as a solver's outputs already do.
 */
export function createRealExperimentRun(input: {
  request: RealExperimentRequest;
  derived: readonly DerivedMeasurement[];
  summary: string;
  assumptions?: readonly string[];
  warnings?: readonly string[];
}): RealExperimentRun {
  const { request } = input;
  if (request.physicalProtocolRef.trim().length === 0) {
    throw new Error('A real experiment request needs a non-empty physicalProtocolRef — an unattributed request cannot become a real measurement.');
  }
  if (input.derived.length === 0) {
    throw new Error('A real experiment run needs at least one derived measurement — nothing was entered.');
  }
  for (const measurement of input.derived) {
    if (measurement.derivedFrom.length === 0) {
      throw new Error(`Derived measurement "${measurement.outputKey}" has no raw readings behind it (derivedFrom is empty) — that is a fabrication, not a measurement.`);
    }
    if (!Number.isFinite(measurement.value)) {
      throw new Error(`Derived measurement "${measurement.outputKey}" is not a finite number.`);
    }
    for (const raw of measurement.derivedFrom) {
      if (!Number.isFinite(raw.value)) {
        throw new Error(`Raw reading on channel "${raw.channel}" backing "${measurement.outputKey}" is not a finite number.`);
      }
      if (raw.channel.trim().length === 0) {
        throw new Error(`Derived measurement "${measurement.outputKey}" has a raw reading with no channel — an orphaned reading cannot back a real measurement.`);
      }
    }
  }
  const outputs: Record<string, ExperimentOutputValue> = {};
  const units: Record<string, string> = {};
  for (const measurement of input.derived) {
    outputs[measurement.outputKey] = measurement.value;
    units[measurement.outputKey] = measurement.unit;
  }

  const result: ExperimentResult = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status: 'completed',
    summary: input.summary,
    outputs,
    units,
    warnings: input.warnings ?? [],
    assumptions: input.assumptions ?? [],
    visualization: [],
    route: { kind: 'none' },
  };

  const plan: ExperimentPlan = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    planId: `real-experiment-plan_${fnv1a(canonicalJson({ protocol: request.physicalProtocolRef, request: request.structuredRequest }))}`,
    intent: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      request: request.structuredRequest,
      // Honest reuse, not a fabricated capability: `REAL_ENGINE` means "a real
      // process produced this, not a parser or LLM" — true of a physical
      // measurement, and it is what lets every existing `resultOrigin ===
      // 'real-engine'` gate downstream correctly admit this run.
      capability: 'REAL_ENGINE',
      confidence: 'high',
      rationale: `Real physical measurement via protocol ${request.physicalProtocolRef}, not a Genesis solver route.`,
      requiredSolver: 'none',
      knowledgeSources: [],
      supplementalKnowledgeIds: [],
    },
    // Not a software engine — no `RouterModel.engine` string names a physical
    // apparatus, and inventing one would misrepresent it as compiled code.
    engine: null,
    modelVersion: null,
    parameterSchema: [],
    runnable: true,
    // No existing `ExperimentRoute` kind describes a physical experiment —
    // `'lab'` already means a Genesis UI lab screen. `'none'` is the honest
    // choice until a real route kind is deliberately added.
    route: { kind: 'none' },
  };

  const requestFingerprint = fingerprintStructuredRequest(request.structuredRequest);
  const runFingerprint = `run_${fnv1a(canonicalJson({
    requestFingerprint,
    planFingerprint: fingerprintExperimentPlan(plan),
    physicalProtocolRef: request.physicalProtocolRef,
    status: result.status,
    outputs: result.outputs,
    units: result.units,
    derivedFrom: input.derived.map((measurement) => measurement.derivedFrom),
  }))}`;

  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: runFingerprint,
    request: request.structuredRequest,
    intent: plan.intent,
    plan,
    result,
    provenance: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      requestFingerprint,
      runFingerprint,
      knowledgeSources: [],
      supplementalKnowledgeIds: [],
      domainId: request.structuredRequest.domainId,
      modelId: request.structuredRequest.modelId,
      engine: null,
      parameterSnapshot: { ...request.structuredRequest.parameters },
      // A physical measurement is not reproducible bit-for-bit like a seeded
      // solver — real noise is real, not a missing seed.
      deterministic: false,
      resultOrigin: 'real-engine',
      dataProvenance: realExperimentProvenanceDataProvenance(),
    },
  };
}
