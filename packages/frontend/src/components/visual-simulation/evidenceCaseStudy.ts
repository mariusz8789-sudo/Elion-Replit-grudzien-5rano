import {
  getExperiment,
  listExperiments,
  isSavedRealExperimentVerification,
  isSavedWorldDiscoveryRun,
  replaySavedRealExperimentVerification,
  replaySavedWorldDiscoveryRun,
  type SavedExperiment,
} from '../../core/scienceMemory';
import type { ReplayVerdict } from '../../core/matrixFoundation/replayVerdict';
import type { DataProvenance } from '../../core/dataProvenance';

/**
 * EVIDENCE & REPLAY CASE STUDY — a read-only, audit-facing shaping of a `SavedExperiment` already
 * in Scientific Memory, for `EvidenceCaseStudyScreen.tsx`. This module computes NOTHING scientific:
 * every value below is read verbatim from a record `scienceMemory.ts`/`predictionVerification.ts`
 * already produced, or from a replay verdict `replaySavedRealExperimentVerification`/
 * `replaySavedWorldDiscoveryRun` already knows how to compute — no second judge, no new tolerance,
 * no fabricated step. This is the one-page "pytanie -> hipoteza -> kryterium -> dane -> werdykt ->
 * provenance -> replay" audit chain the C2 "EVIDENCE & REPLAY AS PRODUCT" directive asks for, built
 * ENTIRELY from the two investigation shapes that already carry that whole chain:
 *
 *   - `realExperimentVerification` (C1's Real Experiment E2E): a REAL, physical measurement judged
 *     against a frozen SIMULATED prediction. The richer case — both provenances appear side by side.
 *   - `worldDiscovery` with a non-null `evidence`: a completed, fully SIMULATED Discovery search with
 *     its own real Evidence Bundle. Shown honestly as SIMULATED end to end — never upgraded to imply
 *     a real measurement that does not exist.
 *
 * Only these two shapes qualify (`isCaseStudyCandidate`): every other saved shape either has no
 * Evidence Bundle of its own (e.g. a bare `scenario` run) or belongs to the older Fabric-router
 * pilot flow already presented by `ExperimentPilotScreen.tsx` — not duplicated here.
 */

export interface CaseStudyStep {
  readonly key: string;
  readonly label: string;
  readonly lines: readonly string[];
}

export interface CaseStudyReplay {
  readonly status: ReplayVerdict;
  readonly reason: string;
}

export interface CaseStudy {
  readonly kind: 'REAL_VERIFICATION' | 'SIMULATED_DISCOVERY';
  readonly experimentId: string;
  readonly title: string;
  readonly createdAt: string;
  /** The provenance of the record this case study is ABOUT — REAL_EXPERIMENTAL or SIMULATED. */
  readonly recordProvenance: DataProvenance;
  readonly honestyNote: string;
  readonly steps: readonly CaseStudyStep[];
}

export function isCaseStudyCandidate(saved: SavedExperiment): boolean {
  if (saved.realExperimentVerification !== undefined && isSavedRealExperimentVerification(saved.realExperimentVerification)) return true;
  if (saved.worldDiscovery !== undefined && isSavedWorldDiscoveryRun(saved.worldDiscovery) && saved.worldDiscovery.evidence !== null) return true;
  return false;
}

/** Newest first, matching `listExperiments`'s own order; real physical verifications sort before simulated-only bundles so the strongest case study is the default selection. */
export function listCaseStudyCandidates(): readonly SavedExperiment[] {
  return listExperiments()
    .filter(isCaseStudyCandidate)
    .sort((a, b) => {
      const aReal = a.realExperimentVerification !== undefined ? 1 : 0;
      const bReal = b.realExperimentVerification !== undefined ? 1 : 0;
      if (aReal !== bReal) return bReal - aReal;
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

/** Prefers the real-experiment shape when present — the same priority `listCaseStudyCandidates` sorts by. */
export function buildCaseStudy(saved: SavedExperiment): CaseStudy | null {
  return realVerificationCaseStudy(saved) ?? simulatedDiscoveryCaseStudy(saved);
}

/**
 * Replays the case study LIVE, through whichever of the two existing replay functions matches its
 * shape — never a third replay mechanism invented for this screen. `NOT_REPRODUCIBLE` and `DRIFT`
 * are rendered exactly as returned, never hidden or softened.
 */
export function replayCaseStudy(saved: SavedExperiment): CaseStudyReplay {
  if (saved.realExperimentVerification !== undefined && isSavedRealExperimentVerification(saved.realExperimentVerification)) {
    return replaySavedRealExperimentVerification(saved);
  }
  return replaySavedWorldDiscoveryRun(saved);
}
