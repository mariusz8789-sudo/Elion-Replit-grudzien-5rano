import { canonicalJson, fnv1a } from '../../events/hash';
import { exportEvidencePackRoCrate, verifyEvidencePackRoCrateRoundTrip } from '../../experimentFabric/evidencePackRoCrate';
import type { ScientificEvidencePack } from '../../experimentFabric/evidencePack';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import { buildDiscoveryEvidencePack } from './evidence';
import type { DiscoveryRun } from './discoveryCampaign';
import type { DiscoveryResult } from './types';

/**
 * ETAP 9 — SCIENTIFIC MEMORY AND LINEAGE FOR A CAMPAIGN.
 *
 * A campaign is only a scientific result if it can be shown to someone else
 * and re-run. This connects `DiscoveryRun` to the EXISTING Evidence Pack,
 * RO-Crate and replay machinery — none of it is reimplemented here.
 *
 * REPLAY HONESTY: a campaign's outputs include model predictions from engines
 * that may or may not be present in another runtime, and whose versions differ.
 * So the saved record captures which engines contributed, and a replay under a
 * different engine set is BLOCKED, never a quiet MATCH. Reproducing numbers
 * with a different ADMET version is a different experiment, not the same one.
 */
export const CAMPAIGN_EVIDENCE_VERSION = '1.0.0';

/** Projects a campaign onto the DiscoveryResult shape the evidence engines consume. */
export function campaignAsDiscoveryResult(run: DiscoveryRun): DiscoveryResult {
  return {
    contractVersion: run.campaignVersion,
    question: run.question,
    batch: {
      batchId: `campaign_${run.runFingerprint}`,
      seedFormulas: run.request.seeds,
      transformations: [...run.request.transformations].sort(),
      candidates: run.candidates,
      discarded: [],
      batchFingerprint: run.runFingerprint,
    },
    assessments: run.evaluation,
    ranking: run.evaluation.filter((a) => a.verdict === 'RETAINED'),
    decision: run.decision,
    capabilityGaps: run.capabilityGaps,
    resultFingerprint: run.runFingerprint,
  };
}

/** Evidence Pack for a campaign, through the existing unmodified engine. */
export function buildCampaignEvidencePack(run: DiscoveryRun): ScientificEvidencePack {
  return buildDiscoveryEvidencePack(campaignAsDiscoveryResult(run));
}

/** RO-Crate export, through the existing unmodified engine. */
export function exportCampaignRoCrate(run: DiscoveryRun): ReturnType<typeof exportEvidencePackRoCrate> {
  return exportEvidencePackRoCrate(buildCampaignEvidencePack(run));
}

export function verifyCampaignRoCrate(run: DiscoveryRun, reloadedJson?: string) {
  return verifyEvidencePackRoCrateRoundTrip(buildCampaignEvidencePack(run), reloadedJson);
}

/**
 * What must be identical for a campaign replay to be the SAME experiment.
 * Engine identities are part of this on purpose.
 */
export interface SavedCampaign {
  contractVersion: string;
  questionId: string;
  request: DiscoveryRun['request'];
  generationMethodId: string;
  /** Engine id per contributing engine, so a version change is detectable. */
  engineIds: readonly string[];
  runFingerprint: string;
}

export function buildSavedCampaign(run: DiscoveryRun): SavedCampaign {
  return {
    contractVersion: CAMPAIGN_EVIDENCE_VERSION,
    questionId: run.question.questionId,
    request: run.request,
    generationMethodId: run.generationMethod.methodId,
    engineIds: run.capabilities.filter((c) => c.available).map((c) => c.engine).sort(),
    runFingerprint: run.runFingerprint,
  };
}

export function isSavedCampaign(value: unknown): value is SavedCampaign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  return typeof saved.contractVersion === 'string'
    && typeof saved.questionId === 'string'
    && typeof saved.generationMethodId === 'string'
    && typeof saved.runFingerprint === 'string'
    && Array.isArray(saved.engineIds)
    && typeof saved.request === 'object' && saved.request !== null;
}

export interface CampaignReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  /** Engines present now that were not in the saved run, and vice versa. */
  engineDelta: readonly string[];
}

/**
 * Compares a re-executed campaign against a saved one.
 *
 * A different engine set is BLOCKED rather than DRIFT: the two runs did not
 * attempt the same computation, so their fingerprints are not comparable and
 * calling the difference "drift" would misdescribe it.
 */
export function replaySavedCampaign(saved: unknown, current: DiscoveryRun): CampaignReplay {
  if (!isSavedCampaign(saved)) {
    return { status: 'BLOCKED', reason: 'Saved campaign record is missing or malformed; nothing can be compared.', engineDelta: [] };
  }

  const currentEngines = buildSavedCampaign(current).engineIds;
  const savedSet = new Set(saved.engineIds);
  const currentSet = new Set(currentEngines);
  const engineDelta = [
    ...saved.engineIds.filter((e) => !currentSet.has(e)).map((e) => `missing: ${e}`),
    ...currentEngines.filter((e) => !savedSet.has(e)).map((e) => `added: ${e}`),
  ].sort();

  if (engineDelta.length > 0) {
    return {
      status: 'BLOCKED',
      reason: `The engine set differs from the saved run (${engineDelta.join('; ')}). A campaign run under different engines is a different experiment, not a drifted one.`,
      engineDelta,
    };
  }
  if (saved.generationMethodId !== current.generationMethod.methodId) {
    return {
      status: 'BLOCKED',
      reason: `Generation method changed from ${saved.generationMethodId} to ${current.generationMethod.methodId}.`,
      engineDelta,
    };
  }
  if (saved.runFingerprint !== current.runFingerprint) {
    return {
      status: 'DRIFT',
      reason: `Same engines and method, different result: saved ${saved.runFingerprint}, recomputed ${current.runFingerprint}.`,
      engineDelta,
    };
  }
  return { status: 'MATCH', reason: '', engineDelta };
}

/** Deterministic digest of the full lineage, for memory keys. */
export function campaignLineageFingerprint(run: DiscoveryRun): string {
  return fnv1a(canonicalJson({
    v: CAMPAIGN_EVIDENCE_VERSION,
    question: run.question.questionId,
    method: run.generationMethod.methodId,
    engines: run.capabilities.filter((c) => c.available).map((c) => c.engine).sort(),
    run: run.runFingerprint,
    dossier: run.dossier?.dossierFingerprint ?? null,
  }));
}
