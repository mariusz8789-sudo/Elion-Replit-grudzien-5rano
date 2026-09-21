import type {
  OrchestratorAdapters,
  Candidate,
  ProblemRecord,
  FreezeSeal,
  ExecutedExperiment,
  IngestedEvidence,
  FalsificationOutcome,
  AdjudicationOutcome,
  DiscoveryRun,
  WinnerRecordRef,
} from '../orchestrator/contracts';
import { fnv1a, canonicalJson } from '../events/hash';
import { ChallengeFailClosedError } from './contracts';
import type { A2DomainPorts, ChallengeCandidate, LineageClass, FalsificationReport } from './contracts';
import { classifyLineage } from './lineage';

/**
 * D-062 ORCHESTRATOR BRIDGE — Mind-side `A2DomainPorts` -> the real,
 * UNMODIFIED `OrchestratorAdapters` port contract `orchestrator.ts` calls
 * (docs/DECISIONS.md D-062, mirrors `govLowerHarmAdapters.ts`'s own role).
 *
 * ZERO NEW DECISIONS. `generate`/`hardFilter`/`diversity`/`rank`/`seal`/
 * `falsify`/`adjudicate`/`buildRecipe` all delegate to `A2DomainPorts`,
 * which itself delegates to real, unmodified Genesis functions
 * (`orchestrator/d062Ports.ts`). This file supplies only glue: candidate
 * shape conversion, lineage tagging, and closure state for the real
 * synchronous `OrchestratorAdapters` call sequence.
 */

export interface ChallengeAdapterDiagnostics {
  readonly pool: () => readonly ChallengeCandidate[];
  readonly lineageCounts: () => Readonly<Record<LineageClass, number>>;
  readonly lastTop2: () => readonly ChallengeCandidate[];
  readonly falsification: () => FalsificationReport | null;
  readonly eliminated: () => readonly { readonly candidateId: string; readonly reason: string }[];
  readonly lastMarginNote: () => string;
}

export interface ChallengeAdapterBundle {
  readonly adapters: OrchestratorAdapters;
  readonly diagnostics: ChallengeAdapterDiagnostics;
}

export interface CreateChallengeAdaptersOpts {
  readonly ports: A2DomainPorts;
  /** The frozen baseline's own candidateId — used only to keep it OUT of the generated/retrieved pool (it is never itself a competing candidate). */
  readonly baselineCandidateId: string;
  /** Candidate fingerprints a PRIOR round's real falsification eliminated — excluded from this round's pool (the statefulness a real research loop requires; D-060/D-061). */
  readonly excludedFingerprints: ReadonlySet<string>;
  readonly custodyRefs: readonly { readonly hash: string; readonly hashPolicy: string }[];
  /** Provenance only, threaded into the WinnerRecordRef so buildRecipe can embed it — never used in any decision. */
  readonly problemFingerprintForRecipe: string;
  readonly researchStateHeadForRecipe: string;
  /**
   * Which real pair this round examines, among the qualifying (post
   * hard-filter) candidates in their real ranked order — round `r` leaves
   * out the candidate at rank `r % qualifying.length` and pairs the two
   * highest-ranked of the rest. With N qualifying candidates this visits N
   * genuinely distinct pairs before repeating (all 3 pairs of 3 candidates
   * exhaust in exactly 3 rounds) — the mechanism that makes "examine a
   * different competing pair each round" (brief §8) a real, ranking-order
   * derived property rather than an arbitrary exclusion list. Defaults to 0
   * (today's top-ranked pair).
   */
  readonly topPairRotation?: number;
}

const hash = (v: unknown): string => fnv1a(canonicalJson(v));

export function createChallengeAdapters(opts: CreateChallengeAdaptersOpts): ChallengeAdapterBundle {
  const retrieved = opts.ports.retrievedCandidates();
  const generated = opts.ports.generatedCandidates();
  const interpolated = opts.ports.interpolatedCandidate();

  const retrievedFp = new Set(retrieved.map((c) => hash(c.candidateId)));
  const generatedFp = new Set(generated.map((c) => hash(c.candidateId)));
  const mutatedFp = new Set(interpolated === null ? [] : [hash(interpolated.candidateId)]);
  const baselineFp = hash(opts.baselineCandidateId);

  const toChallenge = (c: (typeof retrieved)[number]): ChallengeCandidate => {
    const fp = hash(c.candidateId);
    const lineage = classifyLineage(fp, { baseline: baselineFp, retrieved: retrievedFp, initial: generatedFp, mutated: mutatedFp, symbolic: new Set() });
    return Object.freeze({ ...c, lineage, hypothesisRef: null, modelFingerprint: null, predictionRefs: [], falsificationCriterionRef: null, candidateFingerprint: fp });
  };

  const fullPool = [...retrieved, ...generated, ...(interpolated === null ? [] : [interpolated])].map(toChallenge);
  const pool = fullPool.filter((c) => !opts.excludedFingerprints.has(c.candidateFingerprint));
  const byId = new Map(pool.map((c) => [c.candidateId, c] as const));

  const lineageCounts = pool.reduce<Record<LineageClass, number>>((acc, c) => {
    acc[c.lineage] = (acc[c.lineage] ?? 0) + 1;
    return acc;
  }, { A_BASELINE: 0, B_RETRIEVED: 0, C_INITIAL_SPACE: 0, D_MUTATED: 0, E_NEW_MECHANISM: 0, F_SYMBOLIC: 0 });

  const toBackbone = (c: ChallengeCandidate): Candidate =>
    Object.freeze({
      candidateId: c.candidateId,
      mechanismClass: c.mechanism,
      score: 0,
      riskGrade: c.observationCount > 0 ? 'UNSCREENED' : 'NO_EVIDENCE',
      evidenceRefs: [...c.evidenceRefs, ...opts.custodyRefs.map((r) => `custody:${r.hash}:${r.hashPolicy}`)],
    });

  const resolve = (candidateId: string): ChallengeCandidate => {
    const c = byId.get(candidateId);
    if (c === undefined) throw new ChallengeFailClosedError(`candidate "${candidateId}" is not in this round's pool — a port returned an id it was not given`, 'AMBIGUOUS_TERMINAL');
    return c;
  };

  let top2State: readonly ChallengeCandidate[] | null = null;
  let sealFpState: string | null = null;
  let planLabels: readonly string[] = [];
  let lastFalsification: FalsificationReport | null = null;
  let lastEliminated: readonly { readonly candidateId: string; readonly reason: string }[] = [];
  let lastMarginNote = 'no verdict computed yet';

  const adapters: OrchestratorAdapters = {
    generate(_req): readonly Candidate[] {
      return pool.map(toBackbone);
    },

    normalizeDedup(cs) {
      const seen = new Set<string>();
      return cs.filter((c) => {
        if (seen.has(c.candidateId)) return false;
        seen.add(c.candidateId);
        return true;
      });
    },

    hardFilter(cs) {
      const inputs = cs.map((c) => resolve(c.candidateId));
      const { qualifying, eliminated } = opts.ports.hardFilterAndRank(inputs);
      lastEliminated = eliminated;
      return qualifying.map((q) => toBackbone(resolve(q.candidateId)));
    },

    diversity(cs) {
      const inputs = cs.map((c) => resolve(c.candidateId));
      opts.ports.checkDiversity(inputs); // reports only — see govLowerHarmAdapters.ts's own convention; never eliminates.
      return cs;
    },

    rank(cs) {
      // Already in hardFilterAndRank's own descending safety-dominant order — no second ranking system.
      return cs;
    },

    top10(cs) {
      return cs.slice(0, 10);
    },

    top2(cs) {
      if (cs.length < 2) {
        throw new ChallengeFailClosedError(
          `only ${cs.length} candidate(s) qualify — no pair exists to falsify. This challenge's WINNER/NO_WINNER contract requires a real pair and refuses to guess one.`,
          'MISSING_EXPERIMENT_RESULT',
        );
      }
      const rotation = opts.topPairRotation ?? 0;
      // With exactly 2 qualifying candidates there is only one possible
      // pair — leaving one out would leave none. Rotation only applies once
      // a real 3rd (or later) candidate exists to rotate in.
      // Round 0 leaves out the LOWEST-ranked qualifier first (so round 0 is
      // the funnel's own top-ranked pair, matching every other domain's
      // convention); later rounds rotate the leave-out UP through the
      // ranking, bringing progressively lower-ranked challengers in.
      const leaveOutIndex = cs.length >= 3 ? cs.length - 1 - (rotation % cs.length) : -1;
      const t2 = cs.filter((_, i) => i !== leaveOutIndex).slice(0, 2);
      if (t2.length < 2) {
        throw new ChallengeFailClosedError(`only ${t2.length} candidate(s) remain after this round's rotation — the qualifying pool is exhausted`, 'MISSING_EXPERIMENT_RESULT');
      }
      top2State = t2.map((c) => resolve(c.candidateId));
      return t2;
    },

    seal(problem: ProblemRecord): FreezeSeal {
      if (top2State === null) throw new ChallengeFailClosedError('seal() called before top2() produced a real pair', 'MISSING_EXPERIMENT_RESULT');
      const { fingerprint } = opts.ports.freezeFalsification(top2State, opts.ports.now());
      sealFpState = fingerprint;
      return {
        decisionRule: 'D-062 frozen better-than-baseline rule (efficacy >= baseline AND harm < baseline AND evidence minimum), inheriting LOWER_HARM_PREREGISTRATION/A2_PREREGISTRATION',
        falsificationCriteria: `G2_DIFFERENTIATING_EXPERIMENT, fingerprint=${fingerprint}`,
        evidenceMinimum: problem.evidenceMinimum,
        comparisonRule: 'decideFunnelVerdict (govDrugLowerHarmFunnel.ts, unmodified)',
        sealFingerprint: fingerprint,
        sealedAt: opts.ports.now(),
      };
    },

    verifySealUnchanged(seal: FreezeSeal): boolean {
      if (top2State === null) return false;
      const { fingerprint } = opts.ports.freezeFalsification(top2State, opts.ports.now());
      return fingerprint === seal.sealFingerprint && fingerprint === sealFpState;
    },

    planExperiments(t2) {
      planLabels = t2.map((c) => `d062::${c.candidateId}`);
      return planLabels;
    },

    execute(plan): readonly ExecutedExperiment[] {
      return plan.map((label) => {
        const candidateId = label.startsWith('d062::') ? label.slice('d062::'.length) : label;
        const c = resolve(candidateId);
        return { experimentId: label, evidenceClass: c.evidenceClass, summary: { observationCount: c.observationCount } };
      });
    },

    ingestEvidence(executed): readonly IngestedEvidence[] {
      const custodySuffix = opts.custodyRefs.length === 0 ? '' : ` [custody: ${opts.custodyRefs.map((r) => `hash=${r.hash} hashPolicy=${r.hashPolicy}`).join(', ')}]`;
      return executed.flatMap((e) => {
        const candidateId = e.experimentId.startsWith('d062::') ? e.experimentId.slice('d062::'.length) : e.experimentId;
        const c = byId.get(candidateId);
        if (c === undefined) return [];
        return c.evidenceRefs.map((ref) => ({ ref, provenance: `ChEMBL Web Services + ClinicalTrials.gov API v2 (a2-ozempic-substitute pinned dataset, SURPASS-2 NCT03987919)${custodySuffix}` }));
      });
    },

    falsify(t2): FalsificationOutcome {
      if (top2State === null || sealFpState === null) throw new ChallengeFailClosedError('falsify() called before seal() produced a real fingerprint', 'MISSING_EXPERIMENT_RESULT');
      const report = opts.ports.falsify(top2State, sealFpState);
      lastFalsification = report;
      const survived = report.survived.length === t2.length ? report.survived : t2.map(() => false);
      return { survived, note: `executed ${report.executedProbes}/${report.availableProbes} self-falsification probes: ${report.unavailableReason}` };
    },

    adjudicate(_t2): AdjudicationOutcome {
      if (top2State === null || sealFpState === null) throw new ChallengeFailClosedError('adjudicate() called before seal()/falsify() produced real state', 'MISSING_EXPERIMENT_RESULT');
      const result = opts.ports.adjudicate(top2State, sealFpState);
      lastMarginNote = result.marginNote;
      if (result.verdict !== 'WINNER' || result.winnerId === null) return { verdict: result.verdict };
      const winner: WinnerRecordRef = {
        winnerId: result.winnerId,
        verdict: 'WINNER',
        conjunctionOk: true,
        fingerprints: {
          runFingerprint: result.runFingerprint,
          problemFingerprint: opts.problemFingerprintForRecipe,
          researchStateHead: opts.researchStateHeadForRecipe,
        },
      };
      return { verdict: 'WINNER', winner };
    },

    compare(_t2, _seal): string {
      return lastMarginNote;
    },

    buildRecipe(winner: WinnerRecordRef) {
      if (!winner.conjunctionOk) return null;
      const best = byId.get(winner.winnerId);
      if (best === undefined) return null;
      return opts.ports.buildRecipe(winner, best, planLabels);
    },

    recommendNext(run: DiscoveryRun): string {
      if (run.verdict === 'WINNER' && run.winner !== undefined) {
        return `Replicate ${run.winner.winnerId} in an independent trial population before any institutional action — a single funnel pass is not independent confirmation.`;
      }
      return `${run.verdict}: ${lastMarginNote}`;
    },

    hash,
  };

  const diagnostics: ChallengeAdapterDiagnostics = {
    pool: () => pool,
    lineageCounts: () => lineageCounts,
    lastTop2: () => top2State ?? [],
    falsification: () => lastFalsification,
    eliminated: () => lastEliminated,
    lastMarginNote: () => lastMarginNote,
  };

  return { adapters, diagnostics };
}
