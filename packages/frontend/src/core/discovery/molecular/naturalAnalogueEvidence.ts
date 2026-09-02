import { canonicalJson, fnv1a } from '../../events/hash';
import { exportEvidencePackRoCrate, verifyEvidencePackRoCrateRoundTrip, type GenesisRoCrate, type RoCrateRoundTripResult } from '../../experimentFabric/evidencePackRoCrate';
import type { ScientificEvidencePack } from '../../experimentFabric/evidencePack';
import { buildLeadCandidateDossier, type CandidateDossier, type NaturalProductContext } from './dossier';
import { buildDiscoveryEvidencePack } from './evidence';
import {
  naturalAnalogueCampaignFingerprint,
  runNaturalAnalogueCampaign,
  type NaturalAnalogueCampaignEngines,
  type NaturalAnalogueCampaignRequest,
  type NaturalAnalogueCampaignResult,
} from './naturalAnalogueCampaign';
import { buildDiscoveryExperimentGraph, explainDiscoveryEvidence, proposeNextDiscoverySteps, type NextDiscoveryStep } from './nextStep';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import type { ExperimentGraph } from '../../experimentFabric/experimentGraph';
import type { WhyNextExperimentAdvice } from '../../experimentFabric/whyNextExperiment';

/**
 * NATURAL-ANALOGUE CAMPAIGN — EVIDENCE, DOSSIER, REPLAY.
 *
 * This module adds NO new evidence machinery. `NaturalAnalogueCampaignResult`
 * carries a real `ProviderDiscoveryResult` for its confirmed-structure
 * candidates, and `ProviderDiscoveryResult extends DiscoveryResult` — so the
 * EXISTING evidence pack, experiment graph, why-next-experiment and RO-Crate
 * builders apply to it completely unchanged. The only genuinely new piece is
 * replay, because this campaign's generation step (a curated literature pool
 * plus mechanism falsification) is not the composition/SMARTS enumeration
 * `replay.ts`/`campaignEvidence.ts` were built for; it gets the same
 * save-inputs / recompute / compare-fingerprint idiom, applied to its own
 * request shape.
 */
export const NATURAL_ANALOGUE_EVIDENCE_VERSION = '1.0.0';

/**
 * Dossier for the best-ranked candidate, reusing `buildLeadCandidateDossier`
 * verbatim. Returns null when nothing was retained — never an empty dossier
 * dressed up as a finding.
 */
export function buildNaturalAnalogueDossier(result: NaturalAnalogueCampaignResult): CandidateDossier | null {
  if (result.providerResult === null || result.ranking === null || result.bestCandidate === 'NOT_RESOLVED') return null;
  const bestKey = result.bestCandidate.candidateKey;
  const record = result.candidates.find((c) => c.candidateKey === bestKey);
  if (record === undefined) return null;

  const naturalProduct: NaturalProductContext = {
    knownNaturalProduct: true,
    sourceOrganism: record.input.sourceOrganismOrOrigin,
    references: [
      ...record.input.naturalOccurrenceEvidence.map((e) => e.reference),
      ...record.input.mechanismEvidence.map((e) => e.identifier),
    ],
  };

  return buildLeadCandidateDossier({
    result: result.providerResult,
    ranking: result.ranking,
    naturalProduct,
    hypothesisStatement: record.input.mechanismSummary,
  });
}

export function buildNaturalAnalogueEvidencePack(result: NaturalAnalogueCampaignResult): ScientificEvidencePack | null {
  return result.providerResult === null ? null : buildDiscoveryEvidencePack(result.providerResult);
}

export function buildNaturalAnalogueExperimentGraph(result: NaturalAnalogueCampaignResult): ExperimentGraph | null {
  return result.providerResult === null ? null : buildDiscoveryExperimentGraph(result.providerResult);
}

export function explainNaturalAnalogueEvidence(result: NaturalAnalogueCampaignResult): WhyNextExperimentAdvice | null {
  return result.providerResult === null ? null : explainDiscoveryEvidence(result.providerResult);
}

export function proposeNaturalAnalogueNextSteps(result: NaturalAnalogueCampaignResult): readonly NextDiscoveryStep[] {
  return result.providerResult === null ? [] : proposeNextDiscoverySteps(result.providerResult);
}

export function exportNaturalAnalogueRoCrate(pack: ScientificEvidencePack): GenesisRoCrate {
  return exportEvidencePackRoCrate(pack);
}

export function verifyNaturalAnalogueRoCrateRoundTrip(pack: ScientificEvidencePack, reloadedJson?: string): RoCrateRoundTripResult {
  return verifyEvidencePackRoCrateRoundTrip(pack, reloadedJson);
}

/* ------------------------------------------------------------------ */
/* Replay — save-inputs / recompute / compare-fingerprint             */
/* ------------------------------------------------------------------ */

export interface SavedNaturalAnalogueRun {
  version: string;
  request: NaturalAnalogueCampaignRequest;
  resultFingerprint: string;
}

export function buildSavedNaturalAnalogueRun(
  request: NaturalAnalogueCampaignRequest,
  engines: NaturalAnalogueCampaignEngines,
): SavedNaturalAnalogueRun {
  const result = runNaturalAnalogueCampaign(request, engines);
  return {
    version: NATURAL_ANALOGUE_EVIDENCE_VERSION,
    request,
    resultFingerprint: naturalAnalogueCampaignFingerprint(result),
  };
}

export function isSavedNaturalAnalogueRun(value: unknown): value is SavedNaturalAnalogueRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.version !== 'string' || saved.version.trim().length === 0) return false;
  if (typeof saved.resultFingerprint !== 'string' || saved.resultFingerprint.trim().length === 0) return false;
  const request = saved.request as Record<string, unknown> | undefined;
  if (!request || typeof request !== 'object') return false;
  if (typeof request.referenceName !== 'string' || request.referenceName.trim().length === 0) return false;
  if (!Array.isArray(request.candidatePool)) return false;
  if (!request.question || typeof request.question !== 'object') return false;
  return true;
}

export interface NaturalAnalogueReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  /** Recomputed result — present only at MATCH, matching every other Genesis replay gate. */
  result: NaturalAnalogueCampaignResult | null;
}

/**
 * Recomputes the saved request against the SAME engines' identity check
 * implicit in the fingerprint (engine identity flows into every property the
 * fingerprint is built from — RDKit version, ADMET-AI engine string — so a
 * different engine naturally produces a different fingerprint and DRIFTs
 * rather than silently MATCHing).
 */
export function replaySavedNaturalAnalogueRun(
  saved: unknown,
  engines: NaturalAnalogueCampaignEngines,
): NaturalAnalogueReplay {
  if (!isSavedNaturalAnalogueRun(saved)) {
    return { status: 'BLOCKED', reason: 'Saved natural-analogue run is incomplete or corrupted — required identity fields are missing.', result: null };
  }
  const recomputed = runNaturalAnalogueCampaign(saved.request, engines);
  const recomputedFingerprint = naturalAnalogueCampaignFingerprint(recomputed);
  if (recomputedFingerprint !== saved.resultFingerprint) {
    return {
      status: 'DRIFT',
      reason: 'Recomputing from the saved request produced a different result fingerprint — an engine, an evidence citation, or the candidate pool changed since the run was saved.',
      result: null,
    };
  }
  return { status: 'MATCH', reason: '', result: recomputed };
}

/** Deterministic identity of a saved run, independent of its fingerprint field, for storage keys. */
export function savedNaturalAnalogueRunId(saved: SavedNaturalAnalogueRun): string {
  return `natural_analogue_run_${fnv1a(canonicalJson({ v: saved.version, referenceName: saved.request.referenceName, fingerprint: saved.resultFingerprint }))}`;
}
