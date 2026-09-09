import {
  getExperiment,
  listExperiments,
  isSavedRealExperimentVerification,
  isSavedWorldDiscoveryRun,
  replaySavedRealExperimentVerification,
  replaySavedWorldDiscoveryRun,
  type SavedExperiment,
} from '../../core/scienceMemory';
import { getScientificEvidencePack, getStoredEvidencePackReplayVerdict } from '../../core/experimentFabric';
import type { ReplayVerdict } from '../../core/matrixFoundation/replayVerdict';
import type { DataProvenance } from '../../core/dataProvenance';

/**
 * EVIDENCE & REPLAY SHOWCASE — a read-only, audit-facing shaping of a `SavedExperiment` already in
 * Scientific Memory, for `EvidenceShowcaseScreen.tsx`. This module computes NOTHING scientific: every
 * value below is read verbatim from a record `scienceMemory.ts`/`predictionVerification.ts`/
 * `evidencePackStore.ts` already produced, or from a replay verdict one of those modules already knows
 * how to compute — no second judge, no new tolerance, no fabricated step. This is the one-page
 * "pytanie -> hipoteza -> kryterium -> dane -> werdykt -> provenance -> replay" audit chain the C2
 * "EVIDENCE & REPLAY SHOWCASE" directive asks for, built ENTIRELY from the three investigation shapes
 * that already carry that whole chain:
 *
 *   - `realExperimentVerification` (C1's Real Experiment E2E): a REAL, physical measurement judged
 *     against a frozen SIMULATED prediction. The richest case — both provenances appear side by side,
 *     and replay genuinely RE-EXECUTES the simulated half live, in the browser.
 *   - `worldDiscovery` with a non-null `evidence`: a completed, fully SIMULATED Discovery search with
 *     its own real Evidence Bundle. Shown honestly as SIMULATED end to end. Replay also re-executes live.
 *   - `evidencePackId` (the older Fabric-router `ScientificEvidencePack`, `ExperimentPilotScreen.tsx`'s
 *     own investigation shape): also real, real-engine-executed runs, but its own store
 *     (`evidencePackStore.ts`) only knows how to report the verdict it computed AT SAVE TIME
 *     (`getStoredEvidencePackReplayVerdict`'s own doc comment: "a snapshot disclosure, not proof of a
 *     fresh replay") — never silently presented as freshly recomputed, hence `CaseStudyReplay.computedLive`.
 *
 * Priority where a record could technically carry more than one shape: `realExperimentVerification` >
 * `worldDiscovery` > `evidencePackId`, consistently across `isCaseStudyCandidate`, `buildCaseStudy`,
 * `replayCaseStudy` and the sort order below — the same three-way priority everywhere, never decided
 * differently in two places.
 *
 * Every other saved shape (e.g. a bare `scenario` run with no Evidence Bundle of its own) is not a
 * candidate — no placeholder or fixture is ever substituted for a real bundle.
 */

export interface CaseStudyStep {
  readonly key: string;
  readonly label: string;
  readonly lines: readonly string[];
}

export interface CaseStudyReplay {
  readonly status: ReplayVerdict;
  readonly reason: string;
  /** false for `evidencePackId` records: their store only ever reports the verdict computed at save
   * time, never a fresh in-browser re-execution — the screen must say so, not imply otherwise. */
  readonly computedLive: boolean;
}

export interface CaseStudy {
  readonly kind: 'REAL_VERIFICATION' | 'SIMULATED_DISCOVERY' | 'LEGACY_EVIDENCE_PACK';
  readonly experimentId: string;
  readonly title: string;
  readonly createdAt: string;
  /** The provenance of the record this case study is ABOUT — REAL_EXPERIMENTAL or SIMULATED. */
  readonly recordProvenance: DataProvenance;
  readonly honestyNote: string;
  readonly steps: readonly CaseStudyStep[];
}

function hasResolvableEvidencePack(saved: SavedExperiment): boolean {
  return saved.evidencePackId !== undefined && getScientificEvidencePack(saved.evidencePackId) !== undefined;
}

export function isCaseStudyCandidate(saved: SavedExperiment): boolean {
  if (saved.realExperimentVerification !== undefined && isSavedRealExperimentVerification(saved.realExperimentVerification)) return true;
  if (saved.worldDiscovery !== undefined && isSavedWorldDiscoveryRun(saved.worldDiscovery) && saved.worldDiscovery.evidence !== null) return true;
  if (hasResolvableEvidencePack(saved)) return true;
  return false;
}

function candidateRank(saved: SavedExperiment): number {
  if (saved.realExperimentVerification !== undefined) return 2;
  if (saved.worldDiscovery !== undefined) return 1;
  return 0;
}

/** Newest first, matching `listExperiments`'s own order; the three-way priority documented above breaks ties so the strongest case study is the default selection. */
export function listCaseStudyCandidates(): readonly SavedExperiment[] {
  return listExperiments()
    .filter(isCaseStudyCandidate)
    .sort((a, b) => {
      const rankDiff = candidateRank(b) - candidateRank(a);
      if (rankDiff !== 0) return rankDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

function realVerificationCaseStudy(saved: SavedExperiment): CaseStudy | null {
  const record = saved.realExperimentVerification;
  if (record === undefined || !isSavedRealExperimentVerification(record)) return null;
  const { verification, request, realRun } = record;
  const source = getExperiment(record.predictionSourceExperimentId);
  const sourceGoal = source?.worldDiscovery?.goal ?? null;

  const steps: CaseStudyStep[] = [
    {
      key: 'question',
      label: 'Question',
      lines: [sourceGoal ?? `Original question not available — source run "${record.predictionSourceExperimentId}" is no longer in this browser's memory.`],
    },
    {
      key: 'hypothesis',
      label: 'Hypothesis',
      lines: [`${record.hypothesisId} — ${verification.criterion.rationale}`],
    },
    {
      key: 'criterion',
      label: 'Falsification Criterion',
      lines: [
        `Metric: ${verification.criterion.metric}`,
        `Relation: ${verification.criterion.relation}${verification.criterion.tolerance !== undefined ? ` (tolerance ${verification.criterion.tolerance})` : ''}`,
        'Preregistered before the real reading below was entered — never adjusted afterward to fit the result.',
      ],
    },
    {
      key: 'data',
      label: 'Data',
      lines: [
        `Predicted (SIMULATED, WorldGraph): ${verification.predictedValue}`,
        `Real measurement (REAL_EXPERIMENTAL, protocol "${request.physicalProtocolRef}"): ${verification.observedValue ?? 'no finite numeric value recorded for this metric'}`,
        `Recorded: ${realRun.runId}`,
      ],
    },
    {
      key: 'verdict',
      label: 'Verdict',
      lines: [verification.assessment, verification.message],
    },
  ];

  return {
    kind: 'REAL_VERIFICATION',
    experimentId: saved.id,
    title: saved.experimentName,
    createdAt: saved.createdAt,
    recordProvenance: 'REAL_EXPERIMENTAL',
    honestyNote: saved.honestyNote,
    steps,
  };
}

function simulatedDiscoveryCaseStudy(saved: SavedExperiment): CaseStudy | null {
  const record = saved.worldDiscovery;
  if (record === undefined || !isSavedWorldDiscoveryRun(record) || record.evidence === null) return null;
  const evidence = record.evidence;

  const steps: CaseStudyStep[] = [];
  if (record.resultKind === 'HYPOTHESIS_LOOP' && record.loopResult !== undefined) {
    const loop = record.loopResult;
    const lastRound = loop.rounds[loop.rounds.length - 1];
    const decided = loop.beliefs.filter((b) => b.status === 'SUPPORTED' || b.status === 'REFUTED');
    steps.push(
      { key: 'question', label: 'Question', lines: [loop.question] },
      { key: 'hypothesis', label: 'Hypothesis', lines: loop.beliefs.map((b) => `${b.hypothesisId}: ${b.status} (${b.confidence})`) },
      {
        key: 'criterion',
        label: 'Falsification Criterion',
        lines: lastRound
          ? [
              `Metric: ${lastRound.assessment.metricKey}`,
              `Relation: ${lastRound.assessment.criterion.relation}${lastRound.assessment.criterion.tolerance !== undefined ? ` (tolerance ${lastRound.assessment.criterion.tolerance})` : ''}`,
              lastRound.assessment.criterion.rationale,
            ]
          : ['No round executed yet.'],
      },
      {
        key: 'data',
        label: 'Data',
        lines: lastRound
          ? [
              `Baseline (SIMULATED): ${lastRound.assessment.baseline ?? '—'}`,
              `Intervention (SIMULATED): ${lastRound.assessment.intervention ?? '—'}`,
              `Observed effect: ${lastRound.effect ?? '—'}`,
            ]
          : ['No round executed yet.'],
      },
      {
        key: 'verdict',
        label: 'Verdict',
        lines: decided.length > 0 ? decided.map((b) => `${b.hypothesisId}: ${b.status} — ${b.reason}`) : ['No hypothesis resolved yet.'],
      },
    );
  } else if (record.resultKind === 'ACTION_COMPARISON' && record.comparisonResult !== undefined) {
    const comparison = record.comparisonResult;
    const ranked = comparison.status === 'RANKED' || comparison.status === 'TIED';
    steps.push(
      { key: 'question', label: 'Question', lines: [comparison.goal] },
      { key: 'hypothesis', label: 'Actions compared', lines: comparison.candidates.map((c) => `${c.actionId} [${c.availability}]`) },
      { key: 'criterion', label: 'Falsification Criterion', lines: [`Comparison status: ${comparison.status} — ranked by the same objective the goal declared, no per-candidate tolerance to state separately.`] },
      { key: 'data', label: 'Data', lines: comparison.candidates.map((c) => `${c.actionId}: ${c.availability}`) },
      {
        key: 'verdict',
        label: 'Verdict',
        lines: ranked ? comparison.ranking.map((r) => `${r.actionId}: ${r.explanation}`) : [comparison.refusalReason ?? 'Not resolved.'],
      },
    );
  } else {
    return null;
  }

  steps.push({
    key: 'evidence-bundle',
    label: 'Evidence Bundle',
    lines: [`Bundle ${evidence.bundleId}`, `Content fingerprint: ${evidence.scientificContentFingerprint}`, `Bundle's own replay at save time: ${evidence.replayVerdict} — ${evidence.replayMessage}`],
  });

  return {
    kind: 'SIMULATED_DISCOVERY',
    experimentId: saved.id,
    title: saved.experimentName,
    createdAt: saved.createdAt,
    recordProvenance: 'SIMULATED',
    honestyNote: saved.honestyNote,
    steps,
  };
}

function legacyEvidencePackCaseStudy(saved: SavedExperiment): CaseStudy | null {
  if (saved.evidencePackId === undefined) return null;
  const stored = getScientificEvidencePack(saved.evidencePackId);
  if (stored === undefined) return null;
  const { pack } = stored;
  const hypothesis = pack.protocol.hypothesis;
  const assessment = pack.hypothesisAssessment;

  const steps: CaseStudyStep[] = [
    { key: 'question', label: 'Question', lines: [hypothesis.statement] },
    { key: 'hypothesis', label: 'Hypothesis', lines: [`${hypothesis.hypothesisId} — model ${hypothesis.modelId}, domain ${hypothesis.domainId}`] },
    {
      key: 'criterion',
      label: 'Falsification Criterion',
      lines: [
        `Metric: ${assessment.criterion.metric}`,
        `Relation: ${assessment.criterion.relation}${assessment.criterion.tolerance !== undefined ? ` (tolerance ${assessment.criterion.tolerance})` : ''}`,
        assessment.criterion.rationale,
      ],
    },
    {
      key: 'data',
      label: 'Data',
      lines: [
        `${pack.runCount} real-engine run(s) executed under protocol ${pack.protocol.protocolFingerprint}.`,
        ...pack.runs.map((run) => `${run.runId}: ${run.status}`),
      ],
    },
    { key: 'verdict', label: 'Verdict', lines: [assessment.assessment, assessment.message] },
    {
      key: 'evidence-bundle',
      label: 'Evidence Bundle',
      lines: [
        `Pack ${pack.evidencePackId} (chain ${pack.evidenceChainId})`,
        pack.reproducibility.allArmsMatched
          ? 'Reproducibility at save time: every arm matched.'
          : `Reproducibility at save time: drift in ${pack.reproducibility.armsWithDrift.join(', ') || '(unspecified arm)'}${pack.reproducibility.armsNotExecuted.length > 0 ? `; not executed: ${pack.reproducibility.armsNotExecuted.join(', ')}` : ''}.`,
      ],
    },
  ];

  return {
    kind: 'LEGACY_EVIDENCE_PACK',
    experimentId: saved.id,
    title: saved.experimentName,
    createdAt: saved.createdAt,
    recordProvenance: 'SIMULATED',
    honestyNote: saved.honestyNote,
    steps,
  };
}

/** Prefers the real-experiment shape when present, then SIMULATED discovery, then a legacy Evidence Pack — the same priority `listCaseStudyCandidates` sorts by. */
export function buildCaseStudy(saved: SavedExperiment): CaseStudy | null {
  return realVerificationCaseStudy(saved) ?? simulatedDiscoveryCaseStudy(saved) ?? legacyEvidencePackCaseStudy(saved);
}

/**
 * Replays the case study through whichever of the three existing replay mechanisms matches its shape
 * — never a fourth invented for this screen. `NOT_REPRODUCIBLE`, `DRIFT` and `BLOCKED` are rendered
 * exactly as returned, never hidden or softened. Only the first two kinds genuinely re-execute live,
 * in the browser, right now; the legacy Evidence Pack kind can only disclose the verdict its own store
 * already computed at save time — `computedLive` tells the caller which happened.
 */
export function replayCaseStudy(saved: SavedExperiment): CaseStudyReplay {
  if (saved.realExperimentVerification !== undefined && isSavedRealExperimentVerification(saved.realExperimentVerification)) {
    return { ...replaySavedRealExperimentVerification(saved), computedLive: true };
  }
  if (saved.worldDiscovery !== undefined && isSavedWorldDiscoveryRun(saved.worldDiscovery)) {
    return { ...replaySavedWorldDiscoveryRun(saved), computedLive: true };
  }
  if (saved.evidencePackId !== undefined) {
    const stored = getScientificEvidencePack(saved.evidencePackId);
    if (stored === undefined) {
      return {
        status: 'NOT_REPRODUCIBLE',
        reason: `Evidence Pack "${saved.evidencePackId}" is no longer in this browser's memory — nothing to check against.`,
        computedLive: false,
      };
    }
    const verdict = getStoredEvidencePackReplayVerdict(stored.pack);
    const reason = verdict === 'MATCH'
      ? "Recorded at save time: every arm's run fingerprint matched, no drift, nothing left not-executed."
      : verdict === 'DRIFT'
        ? 'Recorded at save time: at least one arm, or the external-observation comparison, drifted from its expected fingerprint.'
        : 'Recorded at save time: at least one arm did not execute, or the pack failed its own validity check.';
    return { status: verdict, reason, computedLive: false };
  }
  return { status: 'BLOCKED', reason: 'This record carries no recognised Evidence Bundle to replay.', computedLive: false };
}
