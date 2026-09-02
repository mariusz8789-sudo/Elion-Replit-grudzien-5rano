import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import { ALL_RECORDS, CONFLICTS, NEGATIVE_EVIDENCE_RECORD_IDS } from './opioidBioactivityPack4';
import { buildOpioidReceptorProfile, type ReceptorProfileResult } from './opioidReceptorProfile';

/**
 * KIMI_PACK4_OPIOIDS_EVIDENCE_PACK — assembly, replay, Scientific Memory.
 *
 * Same idiom as `precisionEvidencePack.ts`: no new provenance system, the
 * SAME save-inputs/recompute/compare-fingerprint replay pattern (importing
 * `SavedScenarioReplayStatus` verbatim), and persistence through the
 * EXISTING `saveExperiment()` Scientific Memory API.
 *
 * This dataset has no external engine call (it is literature bioactivity
 * data, not a computation), so replay determinism is a property of the pure
 * function `buildOpioidReceptorProfile` over the fixed record set — but the
 * pattern is still real and testable: a request for a compound not covered
 * by any record still replays deterministically, and a request built against
 * a tampered record set drifts, exactly like every other replay in this
 * engine.
 */
export const OPIOID_BIOACTIVITY_EVIDENCE_PACK_VERSION = '1.0.0';
export const OPIOID_BIOACTIVITY_EVIDENCE_PACK_NAME = 'KIMI_PACK4_OPIOIDS_EVIDENCE_PACK';

export interface OpioidBioactivityEvidencePack {
  evidencePackId: string;
  packName: string;
  contractVersion: string;
  input: { compound: string };
  profile: ReceptorProfileResult;
  provenance: { sourceDataset: string; datasetVersion: string; generatedAt: string };
  resultFingerprint: string;
}

export function buildOpioidBioactivityEvidencePack(compound: string): OpioidBioactivityEvidencePack {
  const profile = buildOpioidReceptorProfile(compound, ALL_RECORDS, NEGATIVE_EVIDENCE_RECORD_IDS, CONFLICTS);
  return {
    evidencePackId: `${OPIOID_BIOACTIVITY_EVIDENCE_PACK_NAME}_${profile.resultFingerprint}`,
    packName: OPIOID_BIOACTIVITY_EVIDENCE_PACK_NAME,
    contractVersion: OPIOID_BIOACTIVITY_EVIDENCE_PACK_VERSION,
    input: { compound },
    profile,
    provenance: { sourceDataset: 'KIMI_PACK4_OPIOIDS', datasetVersion: '1.0.0', generatedAt: new Date().toISOString() },
    resultFingerprint: profile.resultFingerprint,
  };
}

export interface SavedOpioidProfileRun {
  version: string;
  compound: string;
  resultFingerprint: string;
}

export function buildSavedOpioidProfileRun(compound: string): SavedOpioidProfileRun {
  const profile = buildOpioidReceptorProfile(compound, ALL_RECORDS, NEGATIVE_EVIDENCE_RECORD_IDS, CONFLICTS);
  return { version: OPIOID_BIOACTIVITY_EVIDENCE_PACK_VERSION, compound, resultFingerprint: profile.resultFingerprint };
}

export function isSavedOpioidProfileRun(value: unknown): value is SavedOpioidProfileRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  return typeof saved.version === 'string' && saved.version.length > 0
    && typeof saved.compound === 'string' && saved.compound.length > 0
    && typeof saved.resultFingerprint === 'string' && saved.resultFingerprint.length > 0;
}

export interface OpioidProfileReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  result: ReceptorProfileResult | null;
}

export function replaySavedOpioidProfileRun(saved: unknown, records = ALL_RECORDS, negativeIds = NEGATIVE_EVIDENCE_RECORD_IDS, conflicts = CONFLICTS): OpioidProfileReplay {
  if (!isSavedOpioidProfileRun(saved)) {
    return { status: 'BLOCKED', reason: 'Saved opioid profile run is incomplete or corrupted — required identity fields are missing.', result: null };
  }
  const recomputed = buildOpioidReceptorProfile(saved.compound, records, negativeIds, conflicts);
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return {
      status: 'DRIFT',
      reason: 'Recomputing from the saved compound produced a different result fingerprint — a record, a conflict, or the dataset itself changed since the run was saved.',
      result: null,
    };
  }
  return { status: 'MATCH', reason: '', result: recomputed };
}

export function saveOpioidProfileToMemory(profile: ReceptorProfileResult): SavedExperiment {
  return saveExperiment({
    labId: 'opioid-receptor-bioactivity-pack4',
    experimentId: `${profile.compound}:${profile.resultFingerprint}`,
    experimentName: `${profile.compound} — opioid receptor profile (Pack #4)`,
    params: {
      compound: profile.compound,
      recordCount: profile.records.length,
      conflictCount: profile.conflicts.length,
      negativeEvidenceCount: profile.negativeEvidence.length,
      sameAssayCount: profile.comparabilitySummary.sameAssay,
    },
    stats: {
      sameAssay: profile.comparabilitySummary.sameAssay,
      standalone: profile.comparabilitySummary.standalone,
      notComparable: profile.comparabilitySummary.notComparable,
    },
    analysis: [
      { title: 'Targets covered', kind: 'targets', body: Object.keys(profile.byTarget).sort().join(', ') || 'none' },
      { title: 'Assay classes covered', kind: 'assays', body: Object.keys(profile.byAssayClass).sort().join(', ') || 'none' },
      { title: 'Negative evidence', kind: 'negative-evidence', body: profile.negativeEvidence.map((r) => `${r.target}/${r.assayClass}/${r.parameter}: ${r.limitations}`).join(' | ') || 'none for this compound' },
      { title: 'Conflicts', kind: 'conflicts', body: profile.conflicts.map((c) => c.explanation).join(' | ') || 'none for this compound' },
      { title: 'Limitations', kind: 'limitations', body: profile.limitations.join(' ') },
    ],
    honesty: 'simplified',
    honestyNote: 'Values are transcribed literature bioactivity data (Ki/EC50/Emax), each NOT_INDEPENDENTLY_VERIFIED by Genesis (no live DOI/PubMed/PMC resolution in this runtime). Binding is never read as functional potency; no compound is ranked as "strongest" or "safest" from this data.',
    epistemicStatus: `SAME_ASSAY=${profile.comparabilitySummary.sameAssay};CONFLICTS=${profile.conflicts.length}`,
    assumptions: ['No live PubMed/DOI/PMC access was available; every record traces to a named source but was not independently fetched and checked by Genesis.'],
  });
}
