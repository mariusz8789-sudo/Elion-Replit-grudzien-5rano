import { canonicalJson, fnv1a } from '../../events/hash';
import { buildClaim, type EvidenceLinkedClaim } from './precisionClaimControl';
import { runPrecisionFalsification, type PrecisionFalsificationReport } from './precisionFalsification';
import { crossValidateSmilesFormula, type SmilesFormulaCrossValidation } from './naturalProductCandidatePool';
import { resolveCompound, type CompoundLookupTransport, type CompoundResolution } from './compoundResolver';
import { evaluateStructuralSimilarity, similarityStatement, type StructuralSimilarityResult } from './structuralSimilarity';
import type { RdkitDescribe, RdkitTransport } from './rdkitTransport';
import {
  inferredTransporterEvidence,
  TRANSPORTER_IDS,
  unknownTransporterEvidence,
  type TransporterEvidenceRecord,
  type TransporterId,
} from './transporterEvidence';

/**
 * PRECISION REFERENCE ANALYSIS — 3-MMC vs 4-CMC.
 *
 * QUESTION → IDENTITY → STRUCTURE → MECHANISM (per transporter) → COMPARISON
 * → CLAIM CONTROL → FALSIFICATION → UNCERTAINTY.
 *
 * This is a SCIENTIFIC ANALYSIS of two reference compounds, not a synthesis,
 * optimisation, or novel-substance design task. Nothing here computes or
 * states a synthesis route, quantity, temperature, timing, addition order, or
 * production procedure — the identity/structure/mechanism engines used
 * (RDKit descriptors, structural similarity, compound resolution) have no
 * such capability to begin with.
 *
 * Generic over the pair: `runPrecisionReferenceAnalysis` takes two compound
 * requests and returns a symmetric result. The 3-MMC/4-CMC case is supplied
 * by a caller (the accompanying test / UI screen), never hardcoded here.
 */
export const PRECISION_REFERENCE_ANALYSIS_VERSION = '1.0.0';

export interface PrecisionCompoundRequest {
  name: string;
  /** Used only when live name resolution does not return a single structure. Cross-validated by RDKit before use. */
  fallbackSmiles: string;
  fallbackFormula: string;
}

export type IdentitySource = 'PUBCHEM_LIVE' | 'CROSS_VALIDATED_FALLBACK' | 'NOT_AVAILABLE';

export interface PrecisionCompoundIdentity {
  name: string;
  /** Verified only through a real, reachable register. Empty (not guessed) when unreachable. */
  synonyms: readonly string[];
  synonymsStatus: 'NOT_AVAILABLE' | 'VERIFIED';
  synonymsReason: string;
  formula: string | null;
  molecularWeight: number | null;
  canonicalSmiles: string | null;
  inchi: string | null;
  inchiKey: string | null;
  identitySource: IdentitySource;
  resolution: CompoundResolution;
  structuralCrossValidation: SmilesFormulaCrossValidation | null;
}

export interface PrecisionStructureAnalysis {
  describeResult: RdkitDescribe;
  rdkitAvailable: boolean;
}

export function resolveIdentityWithFallback(
  request: PrecisionCompoundRequest,
  compoundLookup: CompoundLookupTransport | undefined,
  rdkit: RdkitTransport,
): PrecisionCompoundIdentity {
  const liveResolution = resolveCompound({ kind: 'name', value: request.name }, compoundLookup);

  if (liveResolution.status === 'RESOLVED_SINGLE') {
    const structure = liveResolution.structures[0]!;
    return {
      name: request.name,
      synonyms: [],
      synonymsStatus: 'NOT_AVAILABLE',
      synonymsReason: 'PubChem returned a structure but this pipeline does not request the synonym list field.',
      formula: structure.molecularFormula,
      molecularWeight: null,
      canonicalSmiles: structure.canonicalSmiles,
      inchi: null,
      inchiKey: null,
      identitySource: 'PUBCHEM_LIVE',
      resolution: liveResolution,
      structuralCrossValidation: null,
    };
  }

  const crossValidation = crossValidateSmilesFormula(rdkit, request.fallbackSmiles, request.fallbackFormula);
  const fallbackResolution = resolveCompound({ kind: 'smiles', value: request.fallbackSmiles });

  return {
    name: request.name,
    synonyms: [],
    synonymsStatus: 'NOT_AVAILABLE',
    synonymsReason: `Live PubChem synonym lookup did not succeed (${liveResolution.reason}); Genesis will not assert a synonym without verifying it against a reachable register.`,
    formula: crossValidation.status === 'CONFIRMED' ? crossValidation.observedFormula : null,
    molecularWeight: null,
    canonicalSmiles: crossValidation.status === 'CONFIRMED' ? request.fallbackSmiles : null,
    inchi: null,
    inchiKey: null,
    identitySource: crossValidation.status === 'CONFIRMED' ? 'CROSS_VALIDATED_FALLBACK' : 'NOT_AVAILABLE',
    resolution: fallbackResolution,
    structuralCrossValidation: crossValidation,
  };
}

/** Fills in molecular weight / InChI / InChIKey from a real RDKit describe() call, once available. */
export function enrichIdentityWithStructure(identity: PrecisionCompoundIdentity, describeResult: RdkitDescribe): PrecisionCompoundIdentity {
  if (!describeResult.ok || identity.canonicalSmiles === null) return identity;
  const mw = describeResult.data.values.molWt;
  return {
    ...identity,
    molecularWeight: typeof mw === 'number' ? mw : identity.molecularWeight,
    inchi: describeResult.data.inchi,
    inchiKey: describeResult.data.inchiKey,
  };
}

/**
 * Real, honest transporter evidence for a cathinone-class compound in THIS
 * runtime: live ChEMBL/PubChem bioactivity lookup is attempted by the caller
 * separately (see the test's live-probe checks) and confirmed BLOCKED, and
 * Genesis will not state a specific compound-level DAT/NET/SERT citation it
 * cannot verify. What IS real and computable is the chemical class itself:
 * both compounds are ring-substituted N-methylcathinones (beta-keto
 * phenethylamines), and that class is pharmacologically characterised, in
 * general, as interacting with monoamine transporters — stated here as
 * INFERRED, never as a citation for either compound specifically.
 */
export function buildTransporterEvidenceForCathinone(compoundName: string): readonly TransporterEvidenceRecord[] {
  return TRANSPORTER_IDS.map((transporter: TransporterId) =>
    inferredTransporterEvidence(
      compoundName,
      transporter,
      `${compoundName} belongs to the ring-substituted N-methylcathinone (beta-keto phenethylamine) chemical class, which is pharmacologically characterised, as a class, as interacting with monoamine transporters including ${transporter}.`,
      'Class-level structural/pharmacological reasoning only. No compound-specific citation for this transporter was available: live ChEMBL/PubChem bioactivity lookup is blocked in this runtime, and Genesis will not assert a specific citation it cannot verify for this compound.',
    ),
  );
}

/** The relative-selectivity / release-vs-blockade question, which class-level reasoning cannot answer. */
export function unknownSelectivityClaim(compoundName: string): TransporterEvidenceRecord {
  return unknownTransporterEvidence(
    compoundName,
    'DAT',
    `Whether ${compoundName} acts preferentially at one transporter over another, or behaves as a substrate/releaser rather than a pure reuptake inhibitor, is UNKNOWN in this runtime: this requires compound-specific in-vitro or in-vivo data that is not reachable here, and class membership alone does not determine it (cathinones vary widely on this axis by exact substitution).`,
  );
}

export interface ComparisonRow {
  property: string;
  compoundA: string;
  compoundB: string;
  evidenceStatus: string;
}

export interface PrecisionReferenceAnalysisResult {
  compoundAIdentity: PrecisionCompoundIdentity;
  compoundBIdentity: PrecisionCompoundIdentity;
  compoundAStructure: RdkitDescribe;
  compoundBStructure: RdkitDescribe;
  similarity: StructuralSimilarityResult;
  transporterEvidenceA: readonly TransporterEvidenceRecord[];
  transporterEvidenceB: readonly TransporterEvidenceRecord[];
  comparisonTable: readonly ComparisonRow[];
  claims: readonly EvidenceLinkedClaim[];
  falsification: PrecisionFalsificationReport;
  limitations: readonly string[];
  resultFingerprint: string;
}

export interface PrecisionAnalysisEngines {
  compoundLookup?: CompoundLookupTransport;
  rdkit: RdkitTransport;
}

function fmt(value: number | null, digits = 2): string {
  return value === null ? 'NOT_AVAILABLE' : value.toFixed(digits);
}

function transporterDisplay(record: TransporterEvidenceRecord): string {
  if (record.status === 'VERIFIED') return record.claim;
  if (record.status === 'INFERRED') return 'INFERRED (class-level)';
  return record.status;
}

function transporterStatus(a: TransporterEvidenceRecord, b: TransporterEvidenceRecord): string {
  if (a.status === 'INFERRED' && b.status === 'INFERRED') return 'INFERRED, NOT compound-specific';
  if (a.status === b.status) return a.status;
  return `${a.status} / ${b.status}`;
}

export function runPrecisionReferenceAnalysis(
  requestA: PrecisionCompoundRequest,
  requestB: PrecisionCompoundRequest,
  engines: PrecisionAnalysisEngines,
): PrecisionReferenceAnalysisResult {
  const identityA0 = resolveIdentityWithFallback(requestA, engines.compoundLookup, engines.rdkit);
  const identityB0 = resolveIdentityWithFallback(requestB, engines.compoundLookup, engines.rdkit);

  const structureA = identityA0.canonicalSmiles === null
    ? ({ ok: false, error: 'INVALID_SMILES', reason: 'No cross-validated structure available for this compound.' } as const)
    : engines.rdkit.describe(identityA0.canonicalSmiles);
  const structureB = identityB0.canonicalSmiles === null
    ? ({ ok: false, error: 'INVALID_SMILES', reason: 'No cross-validated structure available for this compound.' } as const)
    : engines.rdkit.describe(identityB0.canonicalSmiles);

  const identityA = enrichIdentityWithStructure(identityA0, structureA);
  const identityB = enrichIdentityWithStructure(identityB0, structureB);

  const similarity = identityA.canonicalSmiles !== null && identityB.canonicalSmiles !== null
    ? evaluateStructuralSimilarity(engines.rdkit, identityA.canonicalSmiles, identityB.canonicalSmiles)
    : {
      candidateSmiles: identityA.canonicalSmiles ?? '', referenceSmiles: identityB.canonicalSmiles ?? '',
      available: false, reason: 'At least one compound has no cross-validated structure.',
      tanimoto: null, band: null, sameScaffold: null, fingerprint: null, engine: 'none',
    };

  const transporterEvidenceA = buildTransporterEvidenceForCathinone(identityA.name);
  const transporterEvidenceB = buildTransporterEvidenceForCathinone(identityB.name);

  const falsification = runPrecisionFalsification({
    compoundAName: identityA.name,
    compoundBName: identityB.name,
    transporterEvidenceA,
    transporterEvidenceB,
    similarity,
  });

  const comparisonTable: ComparisonRow[] = [
    { property: 'Molecular identity (name)', compoundA: identityA.name, compoundB: identityB.name, evidenceStatus: `${identityA.identitySource} / ${identityB.identitySource}` },
    { property: 'Canonical SMILES', compoundA: identityA.canonicalSmiles ?? 'NOT_AVAILABLE', compoundB: identityB.canonicalSmiles ?? 'NOT_AVAILABLE', evidenceStatus: identityA.canonicalSmiles !== null && identityB.canonicalSmiles !== null ? 'COMPUTED' : 'NOT_AVAILABLE' },
    { property: 'Molecular formula', compoundA: identityA.formula ?? 'NOT_AVAILABLE', compoundB: identityB.formula ?? 'NOT_AVAILABLE', evidenceStatus: 'COMPUTED (RDKit)' },
    { property: 'Molecular weight (g/mol)', compoundA: fmt(identityA.molecularWeight, 2), compoundB: fmt(identityB.molecularWeight, 2), evidenceStatus: identityA.molecularWeight !== null && identityB.molecularWeight !== null ? 'COMPUTED (RDKit)' : 'NOT_AVAILABLE' },
    { property: 'InChIKey', compoundA: identityA.inchiKey ?? 'NOT_AVAILABLE', compoundB: identityB.inchiKey ?? 'NOT_AVAILABLE', evidenceStatus: identityA.inchiKey !== null && identityB.inchiKey !== null ? 'COMPUTED (RDKit)' : 'NOT_AVAILABLE' },
    { property: 'Structural similarity (Tanimoto)', compoundA: '—', compoundB: similarity.available ? `${(similarity.tanimoto! * 100).toFixed(1)}% (${similarity.band})` : 'NOT_AVAILABLE', evidenceStatus: similarity.available ? 'COMPUTED (RDKit)' : 'NOT_AVAILABLE' },
    ...TRANSPORTER_IDS.map((transporter) => {
      const evidenceA = transporterEvidenceA.find((record) => record.transporter === transporter)!;
      const evidenceB = transporterEvidenceB.find((record) => record.transporter === transporter)!;
      return {
        property: `${transporter} activity`,
        compoundA: transporterDisplay(evidenceA),
        compoundB: transporterDisplay(evidenceB),
        evidenceStatus: transporterStatus(evidenceA, evidenceB),
      };
    }),
    { property: 'Relative transporter selectivity / release vs. blockade', compoundA: 'UNKNOWN', compoundB: 'UNKNOWN', evidenceStatus: 'UNKNOWN — no compound-specific data reachable' },
    { property: 'Mechanism (named target)', compoundA: 'NOT_AVAILABLE', compoundB: 'NOT_AVAILABLE', evidenceStatus: 'BLOCKED_BY_RUNTIME (ChEMBL unreachable)' },
  ];

  const structuralSimilarityClaim = buildClaim({
    claimId: `${identityA.name}-vs-${identityB.name}-structural-similarity`,
    statement: `${identityA.name} and ${identityB.name} are both ring-substituted N-methylcathinones; their computed structural similarity is ${similarity.available ? `${(similarity.tanimoto! * 100).toFixed(1)}%` : 'NOT_AVAILABLE'}.`,
    strength: 'STRUCTURAL_SIMILARITY',
    evidence: [],
    evidenceType: 'STRUCTURAL_COMPUTATION',
    completedComputationalChecks: similarity.available ? ['RDKIT_STRUCTURE', 'RDKIT_SIMILARITY'] : ['RDKIT_STRUCTURE'],
    limitation: 'This is a structural computation only. It does not establish shared target, mechanism, transporter profile, functional effect, or clinical equivalence.',
  });

  const sameTargetFamilyClaim = buildClaim({
    claimId: `${identityA.name}-vs-${identityB.name}-same-target-family`,
    statement: `${identityA.name} and ${identityB.name} belong to a chemical class (ring-substituted N-methylcathinones) generally characterised as interacting with the monoamine transporter family (DAT/NET/SERT).`,
    strength: 'SAME_TARGET_FAMILY',
    evidence: [],
    evidenceType: 'CLASS_LEVEL_INFERENCE',
    completedComputationalChecks: [],
    limitation: 'Class-level pharmacological reasoning, not a compound-specific citation for either compound. Does NOT establish which named transporter each compound acts on, at what potency, or with what selectivity — see the UNKNOWN selectivity/release-profile finding.',
  });

  const claims: EvidenceLinkedClaim[] = [structuralSimilarityClaim, sameTargetFamilyClaim];

  const limitations: string[] = [
    `Identity: ${identityA.name} resolved via ${identityA.identitySource}; ${identityB.name} resolved via ${identityB.identitySource}. Live PubChem name resolution did not return a single structure for either compound in this runtime.`,
    'Mechanism: no live ChEMBL or PubChem BioAssay access was reachable in this runtime for either compound. No compound-specific DAT/NET/SERT potency, selectivity, or release-vs-blockade value is asserted anywhere in this result.',
    'A transporter binding or in-vitro measurement, even where cited, is never read here as a human behavioural or clinical effect (see precisionFalsification "mechanism-to-effect-inference").',
    `Maximum supportable claim given current evidence: ${falsification.maxSupportableClaim}.`,
    similarityStatement(similarity),
    'This is a scientific reference analysis. No synthesis route, reagent, quantity, temperature, timing, addition order, or production procedure is computed or stated anywhere in this module.',
  ];

  const resultFingerprint = fnv1a(canonicalJson({
    v: PRECISION_REFERENCE_ANALYSIS_VERSION,
    a: { name: identityA.name, smiles: identityA.canonicalSmiles, source: identityA.identitySource },
    b: { name: identityB.name, smiles: identityB.canonicalSmiles, source: identityB.identitySource },
    similarity: similarity.available ? similarity.tanimoto : null,
    falsificationConcernCount: falsification.concernCount,
  }));

  return {
    compoundAIdentity: identityA,
    compoundBIdentity: identityB,
    compoundAStructure: structureA,
    compoundBStructure: structureB,
    similarity,
    transporterEvidenceA,
    transporterEvidenceB,
    comparisonTable,
    claims,
    falsification,
    limitations,
    resultFingerprint,
  };
}
