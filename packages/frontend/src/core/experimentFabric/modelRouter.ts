import { canonicalJson, fnv1a } from '../events/hash';
import type { EvidenceRecordInput, EvidenceSink } from '../scientificWorlds/humanLab/contracts';

/**
 * CANONICAL SCIENTIFIC-REASONING MODEL ROUTER.
 *
 * The only task-class-based AI-provider router in this repo. It never calls a provider
 * directly -- no SDK import, no credentials, no network call lives here. A caller injects a
 * `ModelInvokePort` that performs the actual call; this module's whole job is: given a
 * caller-declared list of provider descriptors (which task classes each one claims, and
 * whether it is currently available), deterministically pick one for a task class, record
 * the routing decision through the canonical `EvidenceSink` seam
 * (`core/scientificWorlds/humanLab/contracts.ts::EvidenceSink`, the same contract
 * `genesisEvidencePort.ts`/`biologyRunners.ts::createLedgerSink` already bind to the one
 * canonical `EvidenceLedger` — no second ledger or sink type is introduced here), and enforce
 * that a provider's own text can never upgrade itself into a solver-verified result.
 */

export const MODEL_ROUTER_CONTRACT_VERSION = '1.0.0';

export type ModelRouterTaskClass =
  | 'WORLD_AUTHOR'
  | 'CYBER_DEFENSIVE_REVIEW'
  | 'CYBER_SCIENTIST_REASONING'
  | 'SCIENTIFIC_REASONING'
  | 'DRUG_CANDIDATE_RESEARCH'
  | 'META_COGNITION'
  | 'GENERAL_CODING';

const TASK_CLASSES: readonly ModelRouterTaskClass[] = [
  'WORLD_AUTHOR',
  'CYBER_DEFENSIVE_REVIEW',
  'CYBER_SCIENTIST_REASONING',
  'SCIENTIFIC_REASONING',
  'DRUG_CANDIDATE_RESEARCH',
  'META_COGNITION',
  'GENERAL_CODING',
];

export function isModelRouterTaskClass(value: string): value is ModelRouterTaskClass {
  return (TASK_CLASSES as readonly string[]).includes(value);
}

export type ModelProviderIdentity = 'OPENAI_ASTRA' | 'ANTHROPIC_CLAUDE' | 'PRIVATE_LOCAL';

/** Declared, caller-supplied provider capability/availability. Never discovered, cached, or persisted here. */
export interface ModelProviderDescriptor {
  readonly providerId: ModelProviderIdentity;
  readonly taskClasses: readonly ModelRouterTaskClass[];
  readonly available: boolean;
}

export interface EvidenceRef {
  readonly id: string;
  readonly contentHash: string;
}

/** A real solver/tool's own claim of what it computed. Never synthesized by this router. */
export interface SolverVerification {
  readonly solverId: string;
  readonly solverVersion: string;
  readonly evidenceRefs: readonly EvidenceRef[];
}

export type ModelResultKind = 'REASONING_ONLY' | 'VERIFIED_BY_SOLVER';

/** `taskClass` is a plain string, not `ModelRouterTaskClass`, so an unrecognized value can be
 * rejected at runtime as BLOCKED rather than refused at the type level before it ever reaches
 * routing logic — callers may pass through caller-declared or externally-sourced task names. */
export interface ModelReasoningRequest {
  readonly taskClass: string;
  readonly prompt: string;
}

/** What the injected port returns: plain text, nothing this router can misinterpret as a scientific result. */
export interface ModelInvokeResult {
  readonly outputText: string;
}

export interface ModelInvokePort {
  invoke(providerId: ModelProviderIdentity, request: ModelReasoningRequest): Promise<ModelInvokeResult>;
}

export interface ModelRoutingBlocked {
  readonly status: 'BLOCKED';
  readonly taskClass: string;
  readonly reason: string;
}

export interface ModelRoutingResult {
  readonly status: 'ROUTED';
  readonly taskClass: ModelRouterTaskClass;
  readonly providerId: ModelProviderIdentity;
  readonly kind: 'REASONING_ONLY';
  readonly outputText: string;
  readonly evidenceRef: EvidenceRef | null;
  readonly requestFingerprint: string;
}

export type ModelRouterOutcome = ModelRoutingBlocked | ModelRoutingResult;

export interface SolverVerifiedResult {
  readonly status: 'ROUTED';
  readonly taskClass: ModelRouterTaskClass;
  readonly providerId: ModelProviderIdentity;
  readonly kind: 'VERIFIED_BY_SOLVER';
  readonly outputText: string;
  readonly evidenceRef: EvidenceRef | null;
  readonly requestFingerprint: string;
  readonly solverVerification: SolverVerification;
}

function requestFingerprint(request: ModelReasoningRequest): string {
  return `modelroute_${fnv1a(canonicalJson({ taskClass: request.taskClass, prompt: request.prompt }))}`;
}

/**
 * Deterministic selection: the FIRST descriptor (in caller-supplied order) that declares the
 * task class AND is currently available. Priority is controlled entirely by list order; this
 * function adds no hidden scoring or randomness, so the same input list always yields the same
 * pick.
 */
function selectProvider(
  taskClass: ModelRouterTaskClass,
  providers: readonly ModelProviderDescriptor[],
): ModelProviderDescriptor | null {
  for (const provider of providers) {
    if (provider.available && provider.taskClasses.includes(taskClass)) return provider;
  }
  return null;
}

function emitRoutingEvidence(
  sink: EvidenceSink | undefined,
  outcome: {
    readonly taskClass: string;
    readonly providerId: ModelProviderIdentity | null;
    readonly status: 'BLOCKED' | 'ROUTED';
    readonly reason: string;
  },
): EvidenceRef | null {
  if (!sink) return null;
  const input: EvidenceRecordInput = {
    sourceUrl: `genesis://model-router/${outcome.status.toLowerCase()}`,
    claim: `ModelRouter ${outcome.status}: taskClass=${outcome.taskClass} providerId=${outcome.providerId ?? 'none'} reason=${outcome.reason}`,
    claimType: 'MODEL_ROUTING_DECISION',
    confidence: 1,
    provenance: { taskClass: outcome.taskClass, providerId: outcome.providerId, contractVersion: MODEL_ROUTER_CONTRACT_VERSION },
  };
  const result = sink.addRecord(input);
  return { id: result.record.id, contentHash: result.record.contentHash };
}

/**
 * Routes one reasoning request. Never calls a provider's SDK: `invokePort` does that, this
 * function only decides WHICH provider (if any) and records the decision. The returned
 * result's `kind` is ALWAYS `REASONING_ONLY` — there is no code path here that produces
 * `VERIFIED_BY_SOLVER`. See `attachSolverVerification`.
 */
export async function routeModelRequest(
  request: ModelReasoningRequest,
  providers: readonly ModelProviderDescriptor[],
  invokePort: ModelInvokePort,
  evidenceSink?: EvidenceSink,
): Promise<ModelRouterOutcome> {
  if (!isModelRouterTaskClass(request.taskClass)) {
    const reason = `Nieznana klasa zadania: ${request.taskClass}.`;
    emitRoutingEvidence(evidenceSink, { taskClass: request.taskClass, providerId: null, status: 'BLOCKED', reason });
    return { status: 'BLOCKED', taskClass: request.taskClass, reason };
  }
  const taskClass = request.taskClass;
  const provider = selectProvider(taskClass, providers);
  if (!provider) {
    const reason = `Brak dostępnego dostawcy dla klasy zadania ${taskClass}.`;
    emitRoutingEvidence(evidenceSink, { taskClass, providerId: null, status: 'BLOCKED', reason });
    return { status: 'BLOCKED', taskClass, reason };
  }
  const invoked = await invokePort.invoke(provider.providerId, request);
  const evidenceRef = emitRoutingEvidence(evidenceSink, { taskClass, providerId: provider.providerId, status: 'ROUTED', reason: 'ok' });
  return {
    status: 'ROUTED',
    taskClass,
    providerId: provider.providerId,
    kind: 'REASONING_ONLY',
    outputText: invoked.outputText,
    evidenceRef,
    requestFingerprint: requestFingerprint(request),
  };
}

/**
 * The ONLY way a routed result's kind becomes `VERIFIED_BY_SOLVER`. Requires a real
 * `SolverVerification` naming a solver id/version and at least one real Evidence reference —
 * an empty `evidenceRefs` throws, because that would be a provider's own text promoting
 * itself with nothing behind it, which is exactly what this function must never allow.
 */
export function attachSolverVerification(result: ModelRoutingResult, verification: SolverVerification): SolverVerifiedResult {
  if (verification.evidenceRefs.length === 0) {
    throw new Error('MODEL_ROUTER_VERIFICATION_REJECTED: solverVerification musi zawierać co najmniej jedno realne Evidence.');
  }
  return { ...result, kind: 'VERIFIED_BY_SOLVER', solverVerification: verification };
}
