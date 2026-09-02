import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import type { SavedScenarioReplayStatus } from '../../simulation/scenarioMemory';
import {
  runPrecisionReferenceAnalysis,
  type PrecisionAnalysisEngines,
  type PrecisionCompoundRequest,
  type PrecisionReferenceAnalysisResult,
} from './precisionReferenceAnalysis';
import type { TargetEvidenceRef } from './targetHypothesis';
import type { KnowledgePack3Record } from './knowledgePack3';
import type { KnowledgePack4Record } from './knowledgePack4';
import type { KnowledgePack4ConflictRecord, KnowledgePack4ExtendedRecord } from './knowledgePack4Extended';

/**
 * 3MMC_4CMC_PRECISION_EVIDENCE_PACK — assembly, replay, Scientific Memory.
 *
 * Reuses the SAME idiom every other evidence/replay module in this engine
 * uses (save inputs -> recompute -> compare fingerprint -> MATCH/DRIFT/BLOCKED,
 * with `SavedScenarioReplayStatus` imported verbatim, never redeclared), and
 * persists through the EXISTING `saveExperiment` Scientific Memory API —
 * no new memory mechanism is introduced.
 */
export const PRECISION_EVIDENCE_PACK_VERSION = '1.0.0';
export const PRECISION_EVIDENCE_PACK_NAME = '3MMC_4CMC_PRECISION_EVIDENCE_PACK';

export interface PrecisionEvidencePack {
  evidencePackId: string;
  packName: string;
  contractVersion: string;
  input: { compoundA: PrecisionCompoundRequest; compoundB: PrecisionCompoundRequest };
  resolvedIdentities: { compoundA: PrecisionReferenceAnalysisResult['compoundAIdentity']; compoundB: PrecisionReferenceAnalysisResult['compoundBIdentity'] };
  structures: { compoundA: PrecisionReferenceAnalysisResult['compoundAStructure']; compoundB: PrecisionReferenceAnalysisResult['compoundBStructure'] };
  computedDescriptors: { similarity: PrecisionReferenceAnalysisResult['similarity'] };
  mechanismEvidence: { compoundA: PrecisionReferenceAnalysisResult['transporterEvidenceA']; compoundB: PrecisionReferenceAnalysisResult['transporterEvidenceB'] };
  knowledgePack3Evidence: readonly KnowledgePack3Record[];
  knowledgePack4Evidence: readonly KnowledgePack4Record[];
  knowledgePack4ExtendedEvidence: readonly KnowledgePack4ExtendedRecord[];
  knowledgePack4Conflicts: readonly KnowledgePack4ConflictRecord[];
  literatureEvidence: readonly TargetEvidenceRef[];
  comparison: PrecisionReferenceAnalysisResult['comparisonTable'];
  claims: PrecisionReferenceAnalysisResult['claims'];
  falsification: PrecisionReferenceAnalysisResult['falsification'];
  uncertainty: readonly string[];
  runtimeLimitations: readonly string[];
  nextExperiment: string;
  provenance: { engine: string; generatedAt: string };
  resultFingerprint: string;
}

/** Assembles the pack directly from a completed analysis result — no recomputation. */
export function buildPrecisionEvidencePack(
  requestA: PrecisionCompoundRequest,
  requestB: PrecisionCompoundRequest,
  result: PrecisionReferenceAnalysisResult,
  engineLabel: string,
): PrecisionEvidencePack {
  const literatureEvidence = [...result.transporterEvidenceA, ...result.transporterEvidenceB].flatMap((r) => r.evidence);

  return {
    evidencePackId: `${PRECISION_EVIDENCE_PACK_NAME}_${result.resultFingerprint}`,
    packName: PRECISION_EVIDENCE_PACK_NAME,
    contractVersion: PRECISION_EVIDENCE_PACK_VERSION,
    input: { compoundA: requestA, compoundB: requestB },
    resolvedIdentities: { compoundA: result.compoundAIdentity, compoundB: result.compoundBIdentity },
    structures: { compoundA: result.compoundAStructure, compoundB: result.compoundBStructure },
    computedDescriptors: { similarity: result.similarity },
    mechanismEvidence: { compoundA: result.transporterEvidenceA, compoundB: result.transporterEvidenceB },
    knowledgePack3Evidence: result.knowledgePack3Evidence,
    knowledgePack4Evidence: result.knowledgePack4Evidence,
    knowledgePack4ExtendedEvidence: result.knowledgePack4ExtendedEvidence,
    knowledgePack4Conflicts: result.knowledgePack4Conflicts,
    literatureEvidence: [...literatureEvidence, ...result.knowledgePack3Evidence.map((record) => ({ source: 'LITERATURE' as const, identifier: record.doi ? `doi:${record.doi}` : `pmid:${record.pmid}`, establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value}; ${record.assay}. Validation: ${record.validationStatus}.` })), ...result.knowledgePack4Evidence.map((record) => ({ source: 'LITERATURE' as const, identifier: `pmid:${record.pmid}`, establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value} ${record.unit}; ${record.assay}. Validation: ${record.validationStatus}.` })), ...result.knowledgePack4ExtendedEvidence.map((record) => ({ source: 'LITERATURE' as const, identifier: record.pmid ? `pmid:${record.pmid}` : `source:${record.source}`, establishes: `${record.compound} ${record.target} ${record.parameter}=${record.value} ${record.unit}; ${record.assay}. Validation: ${record.validationStatus}.` }))],
    comparison: result.comparisonTable,
    claims: result.claims,
    falsification: result.falsification,
    uncertainty: result.limitations,
    runtimeLimitations: result.limitations.filter((l) => /blocked|not_available|not reachable|unreachable/i.test(l)),
    nextExperiment: proposeNextPrecisionExperiment(result),
    provenance: { engine: engineLabel, generatedAt: new Date().toISOString() },
    resultFingerprint: result.resultFingerprint,
  };
}

/**
 * "Jaki jest najbardziej wartościowy następny eksperyment?" — derived from
 * the ONE falsification concern that real data could actually resolve.
 * The other four concerns (in-vitro-only gap, mechanism-to-effect bridge,
 * overinterpretation risk, and the structural-difference caution) are
 * standing methodological limits that no single new measurement removes —
 * only `convergent-transporter-profile` is closable by one real dataset.
 */
export function proposeNextPrecisionExperiment(result: PrecisionReferenceAnalysisResult): string {
  const convergentProfileCheck = result.falsification.checks.find((c) => c.checkId === 'convergent-transporter-profile');
  if (convergentProfileCheck?.concernFound === true) {
    return `Obtain real, compound-specific in-vitro monoamine transporter (DAT/NET/SERT) potency and selectivity data for ${result.compoundAIdentity.name} and ${result.compoundBIdentity.name} from a reachable, citable primary source (ChEMBL/PubChem BioAssay once network egress allows, or a directly supplied literature reference with a verifiable DOI/PMID). This is the one gap in this evidence base that a single real dataset would close — the other falsification concerns are standing methodological limits, not data gaps.`;
  }
  return 'No further experiment is proposed by this analysis: the remaining falsification concerns are methodological (in-vitro-to-human inference, overinterpretation risk), not resolvable by additional data of the same kind.';
}

export interface SavedPrecisionAnalysisRun {
  version: string;
  requestA: PrecisionCompoundRequest;
  requestB: PrecisionCompoundRequest;
  resultFingerprint: string;
}

export function buildSavedPrecisionAnalysisRun(
  requestA: PrecisionCompoundRequest,
  requestB: PrecisionCompoundRequest,
  engines: PrecisionAnalysisEngines,
): SavedPrecisionAnalysisRun {
  const result = runPrecisionReferenceAnalysis(requestA, requestB, engines);
  return { version: PRECISION_EVIDENCE_PACK_VERSION, requestA, requestB, resultFingerprint: result.resultFingerprint };
}

export function isSavedPrecisionAnalysisRun(value: unknown): value is SavedPrecisionAnalysisRun {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.version !== 'string' || saved.version.length === 0) return false;
  if (typeof saved.resultFingerprint !== 'string' || saved.resultFingerprint.length === 0) return false;
  const requestA = saved.requestA as Record<string, unknown> | undefined;
  const requestB = saved.requestB as Record<string, unknown> | undefined;
  if (!requestA || typeof requestA.name !== 'string' || requestA.name.length === 0) return false;
  if (!requestB || typeof requestB.name !== 'string' || requestB.name.length === 0) return false;
  return true;
}

export interface PrecisionAnalysisReplay {
  status: SavedScenarioReplayStatus;
  reason: string;
  result: PrecisionReferenceAnalysisResult | null;
}

export function replaySavedPrecisionAnalysisRun(
  saved: unknown,
  engines: PrecisionAnalysisEngines,
): PrecisionAnalysisReplay {
  if (!isSavedPrecisionAnalysisRun(saved)) {
    return { status: 'BLOCKED', reason: 'Saved precision analysis run is incomplete or corrupted — required identity fields are missing.', result: null };
  }
  const recomputed = runPrecisionReferenceAnalysis(saved.requestA, saved.requestB, engines);
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return {
      status: 'DRIFT',
      reason: 'Recomputing from the saved request pair produced a different result fingerprint — an input, an engine version, or a claim/evidence definition changed since the run was saved.',
      result: null,
    };
  }
  return { status: 'MATCH', reason: '', result: recomputed };
}

/** Persists the finished analysis into the EXISTING Scientific Memory (`scienceMemory.ts`) — no new memory mechanism. */
export function savePrecisionAnalysisToMemory(result: PrecisionReferenceAnalysisResult): SavedExperiment {
  const a = result.compoundAIdentity.name;
  const b = result.compoundBIdentity.name;
  return saveExperiment({
    labId: 'molecular-precision-reference-analysis',
    experimentId: `${a}-vs-${b}:${result.resultFingerprint}`,
    experimentName: `${a} vs ${b} — precision reference analysis`,
    params: {
      compoundA: a,
      compoundB: b,
      tanimotoSimilarity: result.similarity.available ? result.similarity.tanimoto! : -1,
      maxSupportableClaim: result.falsification.maxSupportableClaim,
      falsificationConcernCount: result.falsification.concernCount,
    },
    stats: { falsificationConcernCount: result.falsification.concernCount },
    analysis: [
      { title: 'Identity', kind: 'identity', body: `${a}: ${result.compoundAIdentity.formula ?? 'NOT_AVAILABLE'}, ${result.compoundAIdentity.identitySource}. ${b}: ${result.compoundBIdentity.formula ?? 'NOT_AVAILABLE'}, ${result.compoundBIdentity.identitySource}.` },
      { title: 'Structure', kind: 'structure', body: result.similarity.available ? `Tanimoto similarity ${(result.similarity.tanimoto! * 100).toFixed(1)}% (${result.similarity.band}); same scaffold: ${result.similarity.sameScaffold}.` : 'Structural similarity NOT_AVAILABLE.' },
      { title: 'Mechanism', kind: 'mechanism', body: `DAT/NET/SERT evidence status, both compounds: ${[...new Set([...result.transporterEvidenceA, ...result.transporterEvidenceB].map((r) => r.status))].join(', ')}. No compound-specific citation was established for either compound in this runtime; any non-UNKNOWN/NOT_AVAILABLE status here is class-level structural inference only.` },
      { title: 'Falsification', kind: 'falsification', body: result.falsification.summary },
      { title: 'Limitations and next question', kind: 'limitations', body: [...result.limitations, proposeNextPrecisionExperiment(result)].join(' ') },
    ],
    honesty: 'simplified',
    honestyNote: 'Structural computation (RDKit formula/MW/InChI/similarity) is exact. Transporter mechanism claims are class-level inference only, never compound-specific verified data in this runtime.',
    epistemicStatus: `MAX_SUPPORTABLE_CLAIM=${result.falsification.maxSupportableClaim}`,
    assumptions: ['No live PubChem/ChEMBL access was available; identity uses a cross-validated fallback structure where live resolution failed.'],
  });
}
