import { runScientificDiscovery } from '../orchestrator/orchestrator';
import { parseProblem } from '../orchestrator/nl';
import type { ProblemRecord } from '../orchestrator/contracts';
import { verifyEvidenceCustody, type EvidenceCustodyResult } from '../orchestrator/evidenceCustody';
import type { EvidenceConnectorStore } from '../evidenceConnectors/store';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import { canonicalJson, fnv1a } from '../events/hash';
import { DEFAULT_EVIDENCE_CLASS_RANK } from '../agent/evidenceProvenance';
import { ResearchStateLog } from '../mind/researchState';
import { createChallengeAdapters } from './challengeAdapters';
import { freezeBaseline, verifyBaselineFrozen } from './baselineRegistry';
import { freezeBetterRule, evaluateBetter } from './betterRule';
import { isTrueDiscoveryBest, noveltyLevelFromLineage } from './lineage';
import { ChallengeFailClosedError } from './contracts';
import type {
  A2DomainPorts,
  BaselineRecord,
  BetterRule,
  BeliefUpdateRec,
  ChallengeBlocked,
  ChallengeCandidate,
  ChallengeFailClosedCode,
  ChallengeResult,
  FalsificationReport,
  RoundRecord,
} from './contracts';

/**
 * D-062 THE OUTER DISCOVERY CHALLENGE LOOP (docs/DECISIONS.md D-062).
 *
 * Mirrors `mind/mindDiscovery.ts`/`mind/runResearch.ts` exactly: async
 * custody-then-baseline-then-rule freezing happens BEFORE the synchronous
 * `OrchestratorAdapters` pipeline starts (every port is synchronous by
 * contract — `orchestrator/contracts.ts`, untouched); each round calls the
 * real, unmodified `runScientificDiscovery` exactly once; the loop only
 * decides whether another round is scientifically justified and threads a
 * genuinely different, real, falsification-narrowed pool into the next one.
 *
 * D-057 IS NEVER RE-DECIDED HERE. Whether a WINNER was PROMOTED is read
 * directly off the real `DiscoveryRun` the orchestrator returned
 * (`run.winner`/`run.recipeFingerprint` are only ever set when
 * `orchestrator.ts`'s own `canPromoteToWinnerRecord` returned `PROMOTE`) —
 * this file never recomputes that gate, and never feeds it a
 * caller-supplied scalar (the D-059 mistake this module's own brief
 * documents and refuses to repeat).
 *
 * ONE ADDITIONAL, STRICTER, DISCLOSED CHECK ON TOP: D-057 only asks "is
 * there enough strong evidence" — it says nothing about whether the
 * promoted candidate actually BEATS the frozen baseline (brief §5) or
 * whether it is genuinely absent from the fixed retrieval set (brief §6).
 * Both are evaluated here and can only NARROW a WINNER to NO_WINNER, never
 * the reverse — this file can refuse a promotion the orchestrator allowed;
 * it can never manufacture one the orchestrator refused.
 */

export interface RunChallengeOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly nl: string;
  readonly objectives: ProblemRecord['objectives'];
  readonly evidenceMinimum: string;
  readonly harmAxes: readonly string[];
  readonly baseline: BaselineRecord;
  readonly betterRule: BetterRule;
  readonly ports: A2DomainPorts;
  /** PRODUCTION only. Omitting it in PRODUCTION is itself a fail-closed refusal (D-059 posture, mirrored from mindDiscovery.ts). */
  readonly evidence?: { readonly store: EvidenceConnectorStore; readonly source: SourceConfig; readonly port: ConnectorPort };
  readonly maxRounds?: number;
  /** Provenance only (D-040 clock rule) — supplied, never read from the system clock. */
  readonly now: () => string;
}

const hash = (v: unknown): string => fnv1a(canonicalJson(v));

function toFailClosed(error: unknown): { readonly message: string; readonly code: ChallengeFailClosedCode } {
  if (error instanceof ChallengeFailClosedError) return { message: error.message, code: error.code };
  const message = error instanceof Error ? error.message : String(error);
  return { message, code: 'AMBIGUOUS_TERMINAL' };
}

export async function runDiscoveryChallenge(opts: RunChallengeOptions): Promise<ChallengeResult | ChallengeBlocked> {
  const mode = opts.mode ?? 'PRODUCTION';
  const log = new ResearchStateLog();
  const problem = parseProblem('D062-DOSE-STRATIFIED-LOWER-HARM', { text: opts.nl, objectives: opts.objectives, evidenceMinimum: opts.evidenceMinimum, harmAxes: opts.harmAxes }, hash);

  try {
    if (problem.status !== 'FORMALIZED') {
      throw new ChallengeFailClosedError(`problem is NEEDS_INPUT: ${problem.missingInputs.join('; ')}`, 'MALFORMED_PROBLEM');
    }

    const baselineFrozen = freezeBaseline(opts.baseline, opts.now());
    if (!verifyBaselineFrozen(opts.baseline, baselineFrozen)) {
      throw new ChallengeFailClosedError('baseline fingerprint mismatch immediately after its own freeze — refusing to proceed on an unfrozen baseline', 'BASELINE_NOT_FROZEN');
    }
    const ruleFrozen = freezeBetterRule(opts.betterRule, problem.problemId, opts.now());

    let custody: EvidenceCustodyResult | null = null;
    const custodyRefs: { readonly hash: string; readonly hashPolicy: string }[] = [];
    if (mode === 'PRODUCTION') {
      if (opts.evidence === undefined) {
        throw new ChallengeFailClosedError('PRODUCTION mode requires a custody-verified evidence source; none was supplied', 'INVALID_EVIDENCE_PROVENANCE');
      }
      custody = await verifyEvidenceCustody(opts.evidence.store, opts.evidence.source, opts.evidence.port);
      if (!custody.ok) throw new ChallengeFailClosedError(custody.reason, 'INVALID_EVIDENCE_PROVENANCE');
      if (custody.record?.artifact) custodyRefs.push({ hash: custody.record.artifact.hash, hashPolicy: custody.record.artifact.hashPolicy });
    }

    await log.append('PROBLEM_FORMALIZED', opts.now(), {
      problemFingerprint: problem.fingerprint,
      baselineFingerprint: opts.baseline.fingerprint,
      betterRuleFingerprint: ruleFrozen.ruleFingerprint,
    });

    const excluded = new Set<string>();
    const rounds: RoundRecord[] = [];
    let best: ChallengeCandidate | null = null;
    let lastFalsification: FalsificationReport = { survived: [], executedProbes: 0, availableProbes: 13, unavailableReason: 'no round executed yet' };
    let lastMarginNote = 'no round executed yet';
    let latestRun: Awaited<ReturnType<typeof runScientificDiscovery>> | null = null;
    let previousPairKey: string | null = null;
    const maxRounds = opts.maxRounds ?? 3;

    for (let round = 0; round < maxRounds; round += 1) {
      const bundle = createChallengeAdapters({
        ports: opts.ports,
        baselineCandidateId: opts.baseline.baselineId,
        excludedFingerprints: excluded,
        custodyRefs,
        problemFingerprintForRecipe: problem.fingerprint,
        researchStateHeadForRecipe: log.headFingerprint(),
        // Round r leaves out the r-th ranked qualifying candidate and pairs
        // the two highest-ranked of the rest — with N qualifying candidates
        // this visits N genuinely distinct pairs (all 3 pairs of 3
        // candidates exhaust in exactly 3 rounds) before repeating, the
        // real mechanism behind "each round examines a different competing
        // pair" (brief §8), never an arbitrary exclusion list.
        topPairRotation: round,
      });

      let run: Awaited<ReturnType<typeof runScientificDiscovery>>;
      try {
        run = runScientificDiscovery(problem, bundle.adapters, mode);
      } catch (roundError) {
        // A rotation that ran out of a real pair to examine (the qualifying
        // pool is exhausted) is a genuine, honest SCIENTIFIC_STOP — never an
        // EXECUTION_BLOCKED abort of the whole run.
        if (roundError instanceof ChallengeFailClosedError && roundError.code === 'MISSING_EXPERIMENT_RESULT') break;
        throw roundError;
      }
      latestRun = run;

      const pool = bundle.diagnostics.pool();
      const top2 = bundle.diagnostics.lastTop2();
      const pairKey = top2.map((c) => c.candidateFingerprint).sort().join('+');
      const falsification = bundle.diagnostics.falsification();
      if (falsification !== null) lastFalsification = falsification;
      lastMarginNote = bundle.diagnostics.lastMarginNote();

      const survivedFlags = falsification?.survived ?? top2.map(() => false);
      const survivors = top2.filter((_, i) => survivedFlags[i] === true).map((c) => c.candidateFingerprint);
      const falsified = top2.filter((_, i) => survivedFlags[i] === false).map((c) => c.candidateFingerprint);
      falsified.forEach((fp) => excluded.add(fp));

      if (run.winner !== undefined) {
        const promoted = pool.find((c) => c.candidateId === run.winner!.winnerId) ?? null;
        if (promoted !== null) best = promoted;
      } else if (best === null && top2.length > 0) {
        best = top2[0] ?? null;
      }

      // Real, non-fabricated belief record: 1 = present in this round's TOP2
      // pool / survived falsification, 0 = eliminated — never an invented
      // confidence probability (docs/DECISIONS.md D-062).
      const beliefUpdates: BeliefUpdateRec[] = top2.map((c, i) => ({
        hypothesisId: c.candidateFingerprint,
        before: 1,
        after: survivedFlags[i] === true ? 1 : 0,
        assessment: survivedFlags[i] === true ? 'SURVIVED' : 'FALSIFIED',
        reason: survivedFlags[i] === true ? 'survived G2 differentiating experiment + safety/governance gate' : 'eliminated by G2 differentiating experiment or the safety/governance gate',
      }));

      const samePairAsLastRound = previousPairKey !== null && pairKey === previousPairKey;
      const nextDirection =
        run.verdict === 'WINNER'
          ? 'terminal WINNER — no further round required'
          : samePairAsLastRound
            ? 'NO_INFORMATION_GAIN: the qualifying pool is too small to rotate to a new pair — this round repeated the last one'
            : round + 1 < maxRounds
              ? `round ${round + 1} examines a different pair (rotation ${round + 1}) of the qualifying pool`
              : `round budget (${maxRounds}) exhausted at a real, non-repeating pair — a further round needs either new real evidence or a raised round budget, not a repeated pair`;

      await log.append('EXPERIMENT_HANDOFF', opts.now(), { round, verdict: run.verdict, survivors, falsified, pairKey });
      await log.append('EVIDENCE_UPDATE', opts.now(), { round, beliefUpdates });

      rounds.push(
        Object.freeze({
          round,
          poolFingerprints: pool.map((c) => c.candidateFingerprint),
          excludedFingerprints: [...excluded],
          experimentLabels: top2.map((c) => `d062::${c.candidateId}`),
          survivors,
          falsified,
          beliefUpdates,
          nextDirection,
          roundFingerprint: hash({ round, survivors, falsified, verdict: run.verdict }),
        }),
      );

      if (run.verdict === 'WINNER') break;
      if (samePairAsLastRound) break; // rotation could not reach a genuinely new pair — repeating it is not a real next round.
      previousPairKey = pairKey;
    }

    if (latestRun === null) throw new ChallengeFailClosedError('no round produced a real pair to examine — the qualifying pool never reached two candidates', 'AMBIGUOUS_TERMINAL');

    await log.append('TERMINAL', opts.now(), { verdict: latestRun.verdict, winnerId: latestRun.winner?.winnerId ?? null });
    const chainVerified = await log.verifyChain();
    if (!chainVerified) throw new ChallengeFailClosedError('research state hash-chain failed verification — the transition log was altered', 'CORRUPTED_RESEARCH_STATE');

    const trueDiscovery = isTrueDiscoveryBest(best);
    const strongCount = best !== null && DEFAULT_EVIDENCE_CLASS_RANK[best.evidenceClass] >= DEFAULT_EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED ? best.observationCount : 0;
    const betterEval = best !== null ? evaluateBetter(opts.betterRule, opts.baseline, best, strongCount) : { better: false, reasons: ['no candidate reached a real head-to-head comparison in this run'] };

    const promoted = latestRun.winner !== undefined && latestRun.recipeFingerprint !== undefined;
    const stage18 = latestRun.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK');
    // Two genuinely different reasons a run can end without a promoted
    // WINNER, and this reports the ACTUAL one that applied:
    //  - the funnel's own adjudication already said NO_WINNER (its real
    //    conjunct-failure reason lives in `lastMarginNote`, e.g.
    //    "G2 favours X; pre-experiment rank #1 was Y — DISAGREE") — D-057
    //    is never even reached in this case;
    //  - adjudication DID say WINNER but D-057 refused promotion on
    //    insufficient/weak evidence (`orchestrator.ts` stage 18's own
    //    `NO_PROMOTION: <reasons>` note, the only place that string exists).
    const d057Reasons: readonly string[] = promoted
      ? []
      : stage18?.note?.startsWith('NO_PROMOTION:')
        ? stage18.note
            .slice('NO_PROMOTION:'.length)
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [lastMarginNote];

    // THE CONJUNCTION (brief §14): promoted by D-057 AND clears the frozen
    // better-than-baseline rule AND is genuinely absent from the fixed set.
    const fullWinner = promoted && betterEval.better && trueDiscovery && best !== null;
    const finalVerdict: ChallengeResult['verdict'] = fullWinner ? 'WINNER' : latestRun.verdict === 'ABORTED' ? 'ABORTED' : 'NO_WINNER';
    const d057Outcome: ChallengeResult['d057']['outcome'] = promoted ? 'PROMOTE' : 'NO_PROMOTION';

    const blockers: string[] = [];
    if (!trueDiscovery) blockers.push('NOT A TRUE DISCOVERY RUN: the best candidate is the baseline itself or a member of the fixed A2 retrieval set.');
    if (!betterEval.better) blockers.push(...betterEval.reasons);
    if (!promoted) blockers.push(...d057Reasons);

    return Object.freeze({
      kind: 'RUN',
      mode,
      baseline: opts.baseline,
      betterRuleFingerprint: ruleFrozen.ruleFingerprint,
      rounds,
      bestCandidate: best,
      wasAbsentFromFixedSet: trueDiscovery,
      trueDiscoveryRun: trueDiscovery,
      improvementVsBaseline:
        best === null
          ? null
          : {
              efficacyDelta: best.efficacy - (opts.baseline.knownOutcomeMetrics['efficacy'] ?? 0),
              harmDelta: best.harm - (opts.baseline.knownOutcomeMetrics['harm'] ?? 0),
            },
      verdict: finalVerdict,
      d057: { outcome: d057Outcome, reasons: d057Reasons },
      winnerRecord: fullWinner ? (latestRun.winner ?? null) : null,
      recipeFingerprint: fullWinner ? (latestRun.recipeFingerprint ?? null) : null,
      noveltyLevel: best === null ? 0 : noveltyLevelFromLineage(best.lineage),
      priorArtAxis: 'NO_ACCESS: no prior-art corpus is reachable from this sandbox — this run claims nothing on that axis.',
      falsification: lastFalsification,
      blockers,
      nextExperiment: rounds[rounds.length - 1]?.nextDirection ?? 'no round executed',
      auditFingerprint: log.headFingerprint(),
    });
  } catch (error) {
    const failure = toFailClosed(error);
    return Object.freeze({
      kind: 'EXECUTION_BLOCKED',
      error: failure.message,
      code: failure.code,
      fingerprint: hash({ problemId: problem.problemId, code: failure.code, error: failure.message }),
    });
  }
}

/** Real re-run through the SAME entry point. Fails closed (`ok:false`) on any mismatch rather than assuming success. */
export async function replayDiscoveryChallenge(opts: RunChallengeOptions): Promise<{ readonly ok: boolean; readonly first: ChallengeResult | ChallengeBlocked; readonly second: ChallengeResult | ChallengeBlocked }> {
  const first = await runDiscoveryChallenge(opts);
  const second = await runDiscoveryChallenge(opts);
  let ok = false;
  if (first.kind === 'EXECUTION_BLOCKED' && second.kind === 'EXECUTION_BLOCKED') {
    ok = first.fingerprint === second.fingerprint;
  } else if (first.kind === 'RUN' && second.kind === 'RUN') {
    ok = first.auditFingerprint === second.auditFingerprint && first.verdict === second.verdict && first.recipeFingerprint === second.recipeFingerprint;
  }
  return { ok, first, second };
}
