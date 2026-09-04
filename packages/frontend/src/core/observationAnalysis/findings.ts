import type { ScenarioRun } from '../simulation/scenarioEngine';
import type { AnalysisExtremum, BaselineDelta, ExperimentAnalysis } from './analysis';
import type { ObservationEvidenceReference } from './observationModel';

export type FindingStatus = 'OBSERVED' | 'ABOVE_BASELINE' | 'BELOW_BASELINE' | 'UNCHANGED';
export type FindingConfidence = 'HIGH' | 'MEDIUM';

export interface Finding {
  id: string;
  metric: string;
  observedValue: number | string;
  comparison: number | string | null;
  delta: number | null;
  evidence: ObservationEvidenceReference;
  confidence: FindingConfidence;
  status: FindingStatus;
  sourceSnapshot: {
    resultFingerprint: string;
    day: number;
  };
}

function statusForDelta(delta: number): FindingStatus {
  if (delta > 0) return 'ABOVE_BASELINE';
  if (delta < 0) return 'BELOW_BASELINE';
  return 'UNCHANGED';
}

function extremumFinding(run: ScenarioRun, extremum: AnalysisExtremum): Finding {
  return {
    id: `${run.inputFingerprint}:${extremum.metric}:peak`,
    metric: extremum.metric,
    observedValue: extremum.value,
    comparison: null,
    delta: null,
    evidence: extremum.evidence,
    confidence: 'HIGH',
    status: 'OBSERVED',
    sourceSnapshot: {
      resultFingerprint: extremum.evidence.resultFingerprint,
      day: extremum.day,
    },
  };
}

function baselineFinding(run: ScenarioRun, delta: BaselineDelta): Finding {
  return {
    id: `${run.inputFingerprint}:${delta.metric}:baseline-delta`,
    metric: delta.metric,
    observedValue: delta.observedValue,
    comparison: delta.baselineValue,
    delta: delta.delta,
    evidence: delta.evidence,
    confidence: 'HIGH',
    status: statusForDelta(delta.delta),
    sourceSnapshot: {
      resultFingerprint: delta.evidence.resultFingerprint,
      day: delta.evidence.day,
    },
  };
}

export function deriveFindings(run: ScenarioRun, analysis: ExperimentAnalysis): readonly Finding[] {
  if (run.resultFingerprint === null || run.inputFingerprint !== analysis.experimentId) {
    throw new Error(`Analysis evidence does not belong to scenario ${run.scenarioId}.`);
  }
  const findings: Finding[] = analysis.maxima.map((item) => extremumFinding(run, item));
  findings.push(...analysis.baselineDeltas.map((item) => baselineFinding(run, item)));
  for (const event of analysis.significantEvents) {
    findings.push({
      id: `${run.inputFingerprint}:event:${event.day}:${event.type}`,
      metric: event.type,
      observedValue: event.value,
      comparison: null,
      delta: null,
      evidence: event.evidence,
      confidence: 'HIGH',
      status: 'OBSERVED',
      sourceSnapshot: {
        resultFingerprint: event.evidence.resultFingerprint,
        day: event.day,
      },
    });
  }
  return findings;
}
