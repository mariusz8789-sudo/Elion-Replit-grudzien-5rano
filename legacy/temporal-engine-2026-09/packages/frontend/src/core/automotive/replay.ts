import { canonicalJson, fnv1a } from '../events/hash';
import type { SavedScenarioReplayStatus } from '../simulation/scenarioMemory';
import { buildAutomotiveAuditResult } from './auditResult';
import { AUTOMOTIVE_CONTRACT_VERSION, type AutomotiveAssessment, type AutomotiveAuditResult } from './types';

/**
 * AUTOMOTIVE REPLAY — same pattern already used by
 * `scenarioMemory.ts`/`scenarioCounterfactual.ts`/`temporalMultiverse.ts`:
 * save the INPUTS plus the fingerprint of the result computed from them at
 * save time; replay means recomputing the result from the SAME inputs and
 * checking the fingerprint still matches. This is not a new replay engine —
 * it is the fourth application of the one already established in this
 * codebase, applied to a new domain. `SavedScenarioReplayStatus` (MATCH /
 * DRIFT / BLOCKED) is imported and reused verbatim, not redeclared.
 */
export const AUTOMOTIVE_REPLAY_VERSION = '1.0.0';

export function fingerprintAuditResult(result: AutomotiveAuditResult): string {
  return fnv1a(canonicalJson(result));
}

export interface SavedAutomotiveAssessment {
  contractVersion: string;
  assessment: AutomotiveAssessment;
  resultFingerprint: string;
}

export function buildSavedAutomotiveAssessment(assessment: AutomotiveAssessment): SavedAutomotiveAssessment {
  const result = buildAutomotiveAuditResult(assessment);
  return { contractVersion: AUTOMOTIVE_CONTRACT_VERSION, assessment, resultFingerprint: fingerprintAuditResult(result) };
}

export function isSavedAutomotiveAssessment(value: unknown): value is SavedAutomotiveAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.contractVersion !== 'string' || saved.contractVersion.trim().length === 0) return false;
  if (typeof saved.resultFingerprint !== 'string' || saved.resultFingerprint.trim().length === 0) return false;
  const assessment = saved.assessment as Record<string, unknown> | undefined;
  if (!assessment || typeof assessment !== 'object') return false;
  return typeof assessment.assessmentId === 'string' && assessment.assessmentId.trim().length > 0
    && typeof assessment.vehicle === 'object' && assessment.vehicle !== null
    && Array.isArray(assessment.referenceLineItems);
}

export interface AutomotiveReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  /** Recomputed result — present only at MATCH, matching every other Genesis replay gate. */
  result: AutomotiveAuditResult | null;
}

/**
 * Recomputes the audit from the saved inputs and compares fingerprints.
 * MATCH only when the recomputed result is byte-identical to what was saved;
 * any difference (a changed price, a changed finding, anything) is DRIFT; an
 * incomplete/corrupted saved record is BLOCKED before any computation runs.
 */
export function replaySavedAutomotiveAssessment(saved: unknown): AutomotiveReplay {
  if (!isSavedAutomotiveAssessment(saved)) {
    return { status: 'BLOCKED', reason: 'Zapisany audyt jest niekompletny albo uszkodzony — brakuje wymaganych pól tożsamości.', result: null };
  }
  const recomputed = buildAutomotiveAuditResult(saved.assessment);
  const recomputedFingerprint = fingerprintAuditResult(recomputed);
  if (recomputedFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: 'Ponowne przeliczenie z tych samych wejść dało inny wynik — coś w danych wejściowych zmieniło się od zapisu.', result: null };
  }
  return { status: 'MATCH', reason: 'Ponowne przeliczenie z zapisanych wejść odtworzyło identyczny wynik.', result: recomputed };
}
