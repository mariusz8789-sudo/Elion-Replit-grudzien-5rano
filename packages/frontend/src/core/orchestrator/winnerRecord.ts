import { canonicalJson, fnv1a } from '../events/hash';
import type { DiscoveryRun } from './contracts';
import type { LowerHarmAdapterDiagnostics } from './govLowerHarmAdapters';
import type { EvidenceCustodyResult } from './evidenceCustody';
import type { LowerHarmResearchRecipe } from '../biotechData/govLowerHarmRecipe';
import type { GateOutcome } from '../agent/practicalCandidateGate';

/**
 * WINNER RECORD — the first-class, self-contained, fingerprinted outcome of
 * one real LOWER-HARM run (docs/DECISIONS.md D-116).
 *
 * ZERO NEW SCIENCE. Everything below is a read-only PROJECTION of what the
 * real, unmodified functions already computed during `runScientificDiscovery`
 * and exposed through the adapters' diagnostics side-channel:
 * `decideFunnelVerdict` (the three Winner Gate conjuncts), `runAdjudication`/
 * `evaluatePracticalCandidate` (the safety/governance gate, including
 * REQUIRES_HUMAN_APPROVAL), `runG2Falsification` (the differentiating
 * experiment), `rankForLowerHarm` (every candidate's score, floor and
 * elimination reason), `buildLowerHarmRecipe` (the recipe body whose own
 * `recipeFingerprint` is the one `orchestrator.ts` already put on the run).
 * This module never decides a winner: `run.winner` is set ONLY by
 * `orchestrator.ts` after the D-057 promotion gate, and a WinnerRecord exists
 * only when that already happened AND the recipe was really built. If either
 * is missing, `NoWinnerBlocker` names exactly which conjunct/gate/promotion
 * step stopped the run — never a softened or invented result.
 *
 * `auditFingerprint` (= hash of the 20 stage records) is untouched by this
 * module; the record carries its own `recordFingerprint` over its own content.
 */

export interface WinnerGateConjunct {
  readonly criterion: string;
  readonly held: boolean;
  readonly detail: string;
}

export interface WinnerGateDecisionView {
  readonly candidateId: string;
  readonly candidateName: string;
  readonly outcome: GateOutcome;
  readonly failures: readonly { readonly criterion: string; readonly detail: string }[];
  readonly requiresCapability: string | null;
  readonly reason: string;
  readonly fingerprint: string;
}

export interface CandidateSpaceEntry {
  readonly candidateId: string;
  readonly candidateName: string;
  readonly maxPhase: number | null;
  readonly qualifies: boolean;
  readonly lowerHarmScore: number | null;
  readonly efficacyScore: number;
  readonly safetyScore: number;
  readonly evidenceStrengthScore: number;
  readonly efficacyFloor: { readonly status: string; readonly fraction: number | null };
  readonly vetoed: boolean;
  readonly eliminationReason: string | null;
  readonly observationCount: number;
  readonly inTop2: boolean;
}

export interface FalsificationView {
  readonly outcome: 'EXPERIMENT_SELECTED' | 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE';
  readonly observableId: string | null;
  readonly falsificationPower: number | null;
  readonly discriminability: number | null;
  readonly expectedByCandidate: readonly { readonly candidateId: string; readonly expectedOutcome: number; readonly toleranceSigma: number }[];
  readonly unresolvedPairs: number;
  readonly decisionRuleFingerprint: string | null;
  readonly reason: string | null;
}

export interface EvidenceObservationView {
  readonly candidateId: string;
  readonly nctId: string;
  readonly comparisonType: string;
  readonly evidenceBasis: string;
  readonly deltaVsReferencePp: number | null;
  readonly candidateArmN: number;
  readonly withinMargin: boolean | null;
  readonly fairnessFlags: readonly string[];
}

/** Everything a screen/audit needs about one RUN, whatever its verdict. */
export interface LowerHarmRunDetail {
  readonly scenarioId: string;
  readonly candidates: readonly CandidateSpaceEntry[];
  readonly top2Ids: readonly string[];
  readonly conjuncts: readonly WinnerGateConjunct[];
  readonly verdictReason: string | null;
  readonly gateDecisions: readonly WinnerGateDecisionView[];
  readonly falsification: FalsificationView | null;
  readonly evidence: readonly EvidenceObservationView[];
  readonly recipe: LowerHarmResearchRecipe | null;
}

export interface NoWinnerBlocker {
  readonly kind: 'NO_WINNER_BLOCKER';
  /** The first stage in the fixed pipeline order that stopped a WinnerRecord from existing. */
  readonly blockedAt: 'ADJUDICATION_CONJUNCT' | 'SAFETY_GATE_REFUSE' | 'PROMOTION_GATE' | 'RECIPE_LOCKED' | 'VERDICT';
  readonly verdict: DiscoveryRun['verdict'];
  readonly failedConjuncts: readonly WinnerGateConjunct[];
  readonly refusedGates: readonly WinnerGateDecisionView[];
  readonly stageNote: string | null;
  readonly reason: string;
}

export interface LowerHarmWinnerRecord {
  readonly kind: 'WINNER_RECORD';
  readonly contractVersion: '1.0.0';
  readonly scenarioId: string;
  readonly mode: DiscoveryRun['mode'];
  readonly winnerId: string;
  readonly candidateName: string;
  readonly verdict: 'WINNER';
  readonly conjunctionOk: true;
  readonly conjuncts: readonly WinnerGateConjunct[];
  readonly gate: WinnerGateDecisionView;
  readonly runnerUp: WinnerGateDecisionView | null;
  readonly falsification: FalsificationView | null;
  readonly evidence: readonly EvidenceObservationView[];
  readonly evidenceRefs: readonly string[];
  readonly observationCount: number;
  readonly evidenceCustody: {
    readonly sourceId: string;
    readonly artifactId: string | null;
    readonly hash: string | null;
    readonly hashPolicy: string | null;
    readonly status: string;
  } | null;
  readonly fingerprints: {
    readonly runFingerprint: string;
    readonly preregistrationFingerprint: string;
    readonly falsificationCriteriaFingerprint: string;
    readonly recipeFingerprint: string;
    readonly auditFingerprint: string;
    readonly gateFingerprint: string;
  };
  readonly recipe: LowerHarmResearchRecipe;
  /** Fixed, honest scope statements — what this record does and does not claim. Part of the fingerprinted content. */
  readonly disclosures: readonly string[];
  readonly recordFingerprint: string;
}

const DISCLOSURES: readonly string[] = [
  'RELATIVE CLAIM: the winner ranks best under the frozen LOWER-HARM safety-dominant rule among candidates that clear the efficacy floor and pass the safety veto. It is not a claim of superiority over the reference drug.',
  'INDIRECT EVIDENCE: efficacy comparisons are NAIVE_INDIRECT (candidate arm vs the reference arm from a different trial) unless the evidence row says otherwise.',
  'HUMAN APPROVAL REQUIRED: a population-level intervention candidate never activates autonomously; the governance gate outcome is recorded verbatim on this record.',
  'SINGLE FUNNEL PASS: no independent replication in a disjoint trial population has been performed.',
  'RESEARCH ARTIFACT: not a medical prescription, not a dosing instruction, not a synthesis procedure.',
];

function conjunctsOf(d: LowerHarmAdapterDiagnostics): readonly WinnerGateConjunct[] {
  return (d.verdict()?.conjuncts ?? []).map((c) => ({ criterion: c.criterion, held: c.held, detail: c.detail }));
}

function gateDecisionsOf(d: LowerHarmAdapterDiagnostics, nameOf: (id: string) => string): readonly WinnerGateDecisionView[] {
  return d.adjudicated().map((a) => ({
    candidateId: a.candidateId,
    candidateName: nameOf(a.candidateId),
    outcome: a.decision.outcome,
    failures: a.decision.failures.map((f) => ({ criterion: f.criterion, detail: f.detail })),
    requiresCapability: a.decision.requiresCapability,
    reason: a.decision.reason,
    fingerprint: a.decision.fingerprint,
  }));
}

function falsificationOf(d: LowerHarmAdapterDiagnostics, top2Ids: readonly string[]): FalsificationView | null {
  const g2 = d.g2Result();
  if (g2 === null) return null;
  if (g2.outcome !== 'EXPERIMENT_SELECTED') {
    return { outcome: g2.outcome, observableId: null, falsificationPower: null, discriminability: null, expectedByCandidate: [], unresolvedPairs: g2.unresolvedPairs.length, decisionRuleFingerprint: null, reason: g2.reason };
  }
  const s = g2.spec;
  // The G2 generator keys its decision rule by hypothesisId; the funnel's hypotheses are the TOP2 candidate ids themselves.
  const expected = s.expectedOutcomePerHypothesis
    .filter((e) => top2Ids.length === 0 || top2Ids.includes(e.hypothesisId))
    .map((e) => ({ candidateId: e.hypothesisId, expectedOutcome: e.expectedOutcome, toleranceSigma: e.toleranceSigma }));
  return {
    outcome: 'EXPERIMENT_SELECTED',
    observableId: s.observableId,
    falsificationPower: s.falsificationPower,
    discriminability: s.discriminability,
    expectedByCandidate: expected,
    unresolvedPairs: s.unresolvedPairs.length,
    decisionRuleFingerprint: s.decisionRuleFingerprint,
    reason: null,
  };
}

function candidatesOf(d: LowerHarmAdapterDiagnostics, top2Ids: readonly string[]): readonly CandidateSpaceEntry[] {
  return d.ranked().map((r) => ({
    candidateId: r.report.summary.moleculeChemblId,
    candidateName: r.report.summary.prefName,
    maxPhase: r.report.summary.maxPhase,
    qualifies: r.lowerHarmScore !== null,
    lowerHarmScore: r.lowerHarmScore,
    efficacyScore: r.report.score.efficacyScore,
    safetyScore: r.report.score.safetyScore,
    evidenceStrengthScore: r.report.score.evidenceStrengthScore,
    efficacyFloor: { status: r.efficacyFloor.status, fraction: r.efficacyFloor.fraction },
    vetoed: r.report.score.vetoed,
    eliminationReason: r.eliminationReason,
    observationCount: r.report.efficacy.length,
    inTop2: top2Ids.includes(r.report.summary.moleculeChemblId),
  }));
}

function evidenceOf(d: LowerHarmAdapterDiagnostics): readonly EvidenceObservationView[] {
  const t2 = d.top2();
  if (t2 === null) return [];
  return t2.candidates.flatMap((c) => c.report.efficacy.map((e) => ({
    candidateId: c.report.summary.moleculeChemblId,
    nctId: e.nctId,
    comparisonType: e.comparisonType,
    evidenceBasis: e.evidenceBasis,
    deltaVsReferencePp: e.deltaVsSemaglutidePp ?? null,
    candidateArmN: e.candidateArm.n,
    withinMargin: e.withinMargin,
    fairnessFlags: e.fairnessFlags,
  })));
}

export function buildLowerHarmRunDetail(scenarioId: string, d: LowerHarmAdapterDiagnostics): LowerHarmRunDetail {
  const top2Ids = d.top2()?.candidates.map((c) => c.report.summary.moleculeChemblId) ?? [];
  const names = new Map(d.ranked().map((r) => [r.report.summary.moleculeChemblId, r.report.summary.prefName] as const));
  const nameOf = (id: string): string => names.get(id) ?? id;
  return {
    scenarioId,
    candidates: candidatesOf(d, top2Ids),
    top2Ids,
    conjuncts: conjunctsOf(d),
    verdictReason: d.verdict()?.reason ?? null,
    gateDecisions: gateDecisionsOf(d, nameOf),
    falsification: falsificationOf(d, top2Ids),
    evidence: evidenceOf(d),
    recipe: d.recipe(),
  };
}

function custodyView(c: EvidenceCustodyResult | null): LowerHarmWinnerRecord['evidenceCustody'] {
  if (c === null) return null;
  const artifact = c.record?.artifact ?? null;
  return {
    sourceId: c.sourceId,
    artifactId: artifact?.artifactId ?? null,
    hash: artifact?.hash ?? null,
    hashPolicy: artifact?.hashPolicy ?? null,
    status: c.ok ? (c.record?.status ?? 'FROZEN') : `FAILED: ${c.reason}`,
  };
}

/**
 * Projects a finished run into either a WinnerRecord (only when
 * `orchestrator.ts` itself already promoted a winner AND the recipe was
 * really built) or a NoWinnerBlocker naming the exact stopping point.
 */
export function buildLowerHarmWinnerRecord(
  run: DiscoveryRun,
  detail: LowerHarmRunDetail,
  evidenceCustody: EvidenceCustodyResult | null,
): LowerHarmWinnerRecord | NoWinnerBlocker {
  const failedConjuncts = detail.conjuncts.filter((c) => !c.held);
  const refusedGates = detail.gateDecisions.filter((g) => g.outcome === 'REFUSE');
  const stage18 = run.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK');

  if (run.verdict !== 'WINNER') {
    const blockedAt = failedConjuncts.length > 0 ? 'ADJUDICATION_CONJUNCT' : 'VERDICT';
    return {
      kind: 'NO_WINNER_BLOCKER', blockedAt, verdict: run.verdict, failedConjuncts, refusedGates,
      stageNote: stage18?.note ?? null,
      reason: detail.verdictReason ?? `verdict=${run.verdict}`,
    };
  }
  if (run.winner === undefined) {
    // Adjudication said WINNER but the D-057 promotion gate did not clear — orchestrator.ts never set run.winner.
    return {
      kind: 'NO_WINNER_BLOCKER', blockedAt: 'PROMOTION_GATE', verdict: run.verdict, failedConjuncts, refusedGates,
      stageNote: stage18?.note ?? null,
      reason: stage18?.note ?? 'WINNER verdict, but the promotion gate (MINIMUM_OBSERVATIONS / evidence strength) did not clear.',
    };
  }
  const gate = detail.gateDecisions.find((g) => g.candidateId === run.winner?.winnerId);
  if (gate === undefined || gate.outcome === 'REFUSE') {
    return {
      kind: 'NO_WINNER_BLOCKER', blockedAt: 'SAFETY_GATE_REFUSE', verdict: run.verdict, failedConjuncts, refusedGates,
      stageNote: stage18?.note ?? null,
      reason: gate?.reason ?? 'no gate decision recorded for the promoted winner',
    };
  }
  const recipe = detail.recipe;
  if (recipe === null || run.recipeFingerprint === undefined || recipe.recipeFingerprint !== run.recipeFingerprint) {
    return {
      kind: 'NO_WINNER_BLOCKER', blockedAt: 'RECIPE_LOCKED', verdict: run.verdict, failedConjuncts, refusedGates,
      stageNote: stage18?.note ?? null,
      reason: stage18?.note ?? 'recipe LOCKED or its fingerprint does not match the run',
    };
  }

  const winnerId = run.winner.winnerId;
  const winnerEvidence = detail.evidence.filter((e) => e.candidateId === winnerId);
  const runnerUp = detail.gateDecisions.find((g) => g.candidateId !== winnerId) ?? null;
  const body: Omit<LowerHarmWinnerRecord, 'recordFingerprint'> = {
    kind: 'WINNER_RECORD',
    contractVersion: '1.0.0',
    scenarioId: detail.scenarioId,
    mode: run.mode,
    winnerId,
    candidateName: gate.candidateName,
    verdict: 'WINNER',
    conjunctionOk: true,
    conjuncts: detail.conjuncts,
    gate,
    runnerUp,
    falsification: detail.falsification,
    evidence: winnerEvidence,
    evidenceRefs: winnerEvidence.map((e) => `ctgov:${e.nctId}`),
    observationCount: winnerEvidence.length,
    evidenceCustody: custodyView(evidenceCustody),
    fingerprints: {
      runFingerprint: run.winner.fingerprints.runFingerprint ?? '',
      preregistrationFingerprint: run.winner.fingerprints.preregistrationFingerprint ?? '',
      falsificationCriteriaFingerprint: run.winner.fingerprints.falsificationCriteriaFingerprint ?? '',
      recipeFingerprint: run.recipeFingerprint,
      auditFingerprint: run.auditFingerprint,
      gateFingerprint: gate.fingerprint,
    },
    recipe,
    disclosures: DISCLOSURES,
  };
  // The custody artifactId is re-minted on every ingest of unchanged bytes (see govLowerHarmAdapters.ts::ingestEvidence);
  // it stays on the record for audit but is excluded from the record's own fingerprint so replay stays byte-stable.
  const { evidenceCustody: custody, ...stable } = body;
  const recordFingerprint = fnv1a(canonicalJson({ ...stable, evidenceCustody: custody === null ? null : { sourceId: custody.sourceId, hash: custody.hash, hashPolicy: custody.hashPolicy, status: custody.status } }));
  return Object.freeze({ ...body, recordFingerprint });
}
