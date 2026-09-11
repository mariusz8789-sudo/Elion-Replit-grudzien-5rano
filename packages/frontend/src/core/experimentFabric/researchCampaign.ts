import { canonicalJson, fnv1a } from '../events/hash';
import {
  buildSavedHypothesisLoop, executePreregisteredHypothesesAsync, generateCompetingHypotheses,
  preregisterHypotheses, selectNextHypothesisExperiment, type HypothesisProblem,
} from './hypothesisLoop';
import {
  buildCrossHypothesisAnalysis, buildEvidenceChain, runScientificDiscoveryLoopAsync,
  SCIENTIFIC_DISCOVERY_LOOP_VERSION, type ScientificDiscoveryLoopResult,
} from './scientificDiscoveryLoop';
import type { StructuredExperimentRequest } from './types';

/**
 * RESEARCH CAMPAIGN — chains real Scientific Discovery Loop cycles
 * (`scientificDiscoveryLoop.ts::runScientificDiscoveryLoopAsync`) into a
 * multi-step investigation: Cycle #1 → its real `nextExperiment` → Cycle #2
 * that executes EXACTLY that request → its real `nextExperiment` → Cycle #3
 * → ...
 *
 * THIS IS A THIN LAYER, NOT A SECOND ENGINE. Every stage below is an
 * existing, unchanged Genesis function:
 *  - Cycle #1: `runScientificDiscoveryLoopAsync` itself, verbatim.
 *  - Every later cycle: the exact same pipeline
 *    `runScientificDiscoveryLoopAsync` already runs internally
 *    (`generateCompetingHypotheses` -> `preregisterHypotheses` ->
 *    `executePreregisteredHypothesesAsync` -> `buildEvidenceChain` ->
 *    `selectNextHypothesisExperiment` -> `buildCrossHypothesisAnalysis`),
 *    called here directly because `runScientificDiscoveryLoopAsync` only
 *    accepts a catalog `problemId` and always resolves it at that
 *    problem's DECLARED seed — it has no way to replay a specific
 *    `StructuredExperimentRequest` a previous cycle actually proposed.
 *  - Fingerprinting: `buildSavedHypothesisLoop` (already used by
 *    `scienceMemory.ts` for exactly this purpose — detecting drift in a
 *    persisted loop). No second fingerprint scheme is invented here.
 *
 * THE CONTRACT THIS MODULE EXISTS TO ENFORCE:
 *  1. A cycle NEVER starts from a freshly generated question. It starts
 *     ONLY from the immediately preceding cycle's REAL
 *     `nextExperiment.request` (see `continueResearchCampaign`).
 *  2. If the preceding cycle's `nextExperiment.status` is not
 *     `READY_TO_RUN` — `VALIDATION_REQUIRED`, `BLOCKED`, or `RESOLVED` all
 *     included — no cycle starts. This function returns the explicit
 *     `NO_JUSTIFIED_NEXT_QUESTION` sentinel instead of guessing a
 *     replacement question.
 *  3. Before the next cycle actually runs anything, this module PROVES
 *     (not assumes) that what it is about to execute really is the
 *     previous cycle's request: every candidate `hypothesisLoop.ts`
 *     ever proposes as a next step differs from its own declared problem
 *     by at most the seed lever (an unchanged re-run, or seed+1 — see
 *     `selectNextHypothesisExperiment`), so the next cycle replays the
 *     SAME declared `HypothesisProblem` with its seed lever overridden to
 *     the request's own seed, then verifies one of the resulting
 *     candidate requests is scientifically identical (same domain,
 *     operation, model, parameters, seed — everything except the human
 *     `sourceText` label) to `nextExperiment.request`. A mismatch throws
 *     rather than silently substituting a different request.
 */
export const RESEARCH_CAMPAIGN_CONTRACT_VERSION = '1.0.0';

export const NO_JUSTIFIED_NEXT_QUESTION = 'NO_JUSTIFIED_NEXT_QUESTION' as const;

export interface CycleProvenance {
  readonly previousCycleId: string;
  /** Literal quote of the previous cycle's `nextExperiment.resolves` — never paraphrased. */
  readonly resolvedFrom: string;
  /** `buildSavedHypothesisLoop(previousCycle.result.loop).loopFingerprint` — the same fingerprint Science Memory would persist for that cycle. */
  readonly previousCycleFingerprint: string;
}

export interface ResearchCycle {
  readonly contractVersion: string;
  /** 1 for the cycle a campaign starts with; increments by exactly one per chained continuation. */
  readonly cycleIndex: number;
  readonly cycleId: string;
  readonly problemId: string;
  readonly result: ScientificDiscoveryLoopResult;
  /** null only for the cycle a campaign starts with — there is no previous cycle to resolve from. */
  readonly provenance: CycleProvenance | null;
}

export interface NoJustifiedNextQuestion {
  readonly status: typeof NO_JUSTIFIED_NEXT_QUESTION;
  readonly previousCycleId: string;
  readonly previousCycleProblemId: string;
  readonly reason: string;
}

export type ResearchCampaignStep = ResearchCycle | NoJustifiedNextQuestion;

export function isNoJustifiedNextQuestion(step: ResearchCampaignStep): step is NoJustifiedNextQuestion {
  return (step as NoJustifiedNextQuestion).status === NO_JUSTIFIED_NEXT_QUESTION;
}

/**
 * A cycle's own fingerprint. Reuses `buildSavedHypothesisLoop` — which
 * already refuses (throws) to fingerprint a loop whose preregistration was
 * violated — for the normal case, and falls back to fingerprinting the
 * violation itself only in that one abnormal case, so a BLOCKED cycle can
 * still be reported honestly instead of crashing the campaign.
 */
function cycleFingerprint(result: ScientificDiscoveryLoopResult): string {
  if (result.loop.preregistrationIntact.intact) {
    return buildSavedHypothesisLoop(result.loop).loopFingerprint;
  }
  return fnv1a(canonicalJson({ problemId: result.problem.problemId, preregistrationIntact: result.loop.preregistrationIntact }));
}

function cycleIdFor(result: ScientificDiscoveryLoopResult): string {
  return `cycle_${cycleFingerprint(result)}`;
}

/** Everything that makes a request scientifically THE SAME arm — never the narrative `sourceText`, which two legitimately-identical arms (an unchanged re-run vs. a tie-break vs. a single-seed check) may phrase differently. */
function requestIdentity(request: StructuredExperimentRequest) {
  return { domainId: request.domainId, operation: request.operation, modelId: request.modelId, parameters: request.parameters, seed: request.seed };
}

function requestsMatch(a: StructuredExperimentRequest, b: StructuredExperimentRequest): boolean {
  return canonicalJson(requestIdentity(a)) === canonicalJson(requestIdentity(b));
}

/**
 * `selectNextHypothesisExperiment` never invents a new problem — every
 * `request` it proposes is the declared problem's own request, at most with
 * the seed lever shifted (see file header). So replaying "exactly this
 * request" is: the same declared problem, with its seed lever overridden to
 * match the request's own seed.
 */
function overrideProblemSeed(problem: HypothesisProblem, request: StructuredExperimentRequest): HypothesisProblem {
  if (typeof request.seed !== 'number' || typeof problem.sharedLevers.seed !== 'number' || request.seed === problem.sharedLevers.seed) {
    return problem;
  }
  return { ...problem, sharedLevers: { ...problem.sharedLevers, seed: request.seed } };
}

/**
 * Starts a Research Campaign at its first, real Research Cycle. This is
 * exactly `runScientificDiscoveryLoopAsync`, wrapped only with the same
 * provenance envelope every later cycle carries (null here — there is no
 * previous cycle to resolve from).
 */
export async function startResearchCampaign(problemId: string): Promise<ResearchCycle> {
  const result = await runScientificDiscoveryLoopAsync(problemId);
  return {
    contractVersion: RESEARCH_CAMPAIGN_CONTRACT_VERSION,
    cycleIndex: 1,
    cycleId: cycleIdFor(result),
    problemId: result.problem.problemId,
    result,
    provenance: null,
  };
}

/**
 * Continues a Research Campaign from a REAL previous cycle's REAL
 * `nextExperiment` — see the file header for the full contract. Never
 * starts from a freshly generated question.
 */
export async function continueResearchCampaign(previous: ResearchCycle): Promise<ResearchCampaignStep> {
  const next = previous.result.nextExperiment;
  if (next.status !== 'READY_TO_RUN' || next.request === null) {
    return {
      status: NO_JUSTIFIED_NEXT_QUESTION,
      previousCycleId: previous.cycleId,
      previousCycleProblemId: previous.problemId,
      reason: `Cykl ${previous.cycleId} (${previous.problemId}) nie niesie uzasadnionego następnego pytania: nextExperiment.status=${next.status}. ${next.why}`,
    };
  }
  const request = next.request;
  const problem = overrideProblemSeed(previous.result.problem, request);
  const candidateSet = generateCompetingHypotheses(problem);
  const matchesRequest = candidateSet.hypotheses.some(
    (hypothesis) => hypothesis.proposedExperiment !== null && requestsMatch(hypothesis.proposedExperiment, request),
  );
  if (!matchesRequest) {
    throw new Error(
      `Kolejny cykl NIE wystartował: żadne ramię odtworzonego zbioru hipotez dla ${problem.problemId} nie odpowiada scientyficznie nextExperiment.request z cyklu ${previous.cycleId}. To jest niespójność silnika hipotez, nie brak danych — nic nie zostało uruchomione zamiast tego requestu.`,
    );
  }

  const loop = await executePreregisteredHypothesesAsync(preregisterHypotheses(candidateSet));
  const result: ScientificDiscoveryLoopResult = {
    contractVersion: SCIENTIFIC_DISCOVERY_LOOP_VERSION,
    problem,
    loop,
    evidenceChain: buildEvidenceChain(loop),
    nextExperiment: selectNextHypothesisExperiment(loop),
    crossHypothesisAnalysis: buildCrossHypothesisAnalysis(problem, loop),
  };
  return {
    contractVersion: RESEARCH_CAMPAIGN_CONTRACT_VERSION,
    cycleIndex: previous.cycleIndex + 1,
    cycleId: cycleIdFor(result),
    problemId: problem.problemId,
    result,
    provenance: {
      previousCycleId: previous.cycleId,
      resolvedFrom: next.resolves,
      previousCycleFingerprint: cycleFingerprint(previous.result),
    },
  };
}

export interface ResearchCampaignResult {
  readonly contractVersion: string;
  readonly problemId: string;
  readonly cycles: readonly ResearchCycle[];
  /** Why the campaign stopped chaining further cycles. */
  readonly stoppedBecause: NoJustifiedNextQuestion | { readonly status: 'MAX_CYCLES_REACHED'; readonly maxCycles: number };
}

/**
 * Convenience wrapper: starts a campaign and keeps calling
 * `continueResearchCampaign` for as long as each cycle's real
 * `nextExperiment` stays `READY_TO_RUN`, up to `maxCycles`. The cap exists
 * because a decisive comparison is, by `selectNextHypothesisExperiment`'s
 * own (correct) design, always followed by a single-seed reproducibility
 * check at another seed — a genuinely unbounded chain for a well-formed
 * problem, not a bug in this wrapper. `NO_JUSTIFIED_NEXT_QUESTION` is
 * still the only way this wrapper stops chaining on its own initiative;
 * hitting the cap is reported honestly as `MAX_CYCLES_REACHED`, never
 * silently as if the research question had been resolved.
 */
export async function runResearchCampaign(problemId: string, maxCycles = 5): Promise<ResearchCampaignResult> {
  const cycles: ResearchCycle[] = [await startResearchCampaign(problemId)];
  for (;;) {
    if (cycles.length >= maxCycles) {
      return { contractVersion: RESEARCH_CAMPAIGN_CONTRACT_VERSION, problemId, cycles, stoppedBecause: { status: 'MAX_CYCLES_REACHED', maxCycles } };
    }
    const step = await continueResearchCampaign(cycles[cycles.length - 1]!);
    if (isNoJustifiedNextQuestion(step)) {
      return { contractVersion: RESEARCH_CAMPAIGN_CONTRACT_VERSION, problemId, cycles, stoppedBecause: step };
    }
    cycles.push(step);
  }
}
