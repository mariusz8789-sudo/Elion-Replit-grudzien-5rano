import type { SourceEvidence } from './naturalProducts';
import type { RdkitTransport } from './rdkitTransport';
import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * CURATED NATURAL-PRODUCT CANDIDATE POOL.
 *
 * "Wykorzystaj istniejące capabilities Genesis: PubChem, ChEMBL, natural-
 * product provenance... Brak potwierdzenia naturalnego występowania:
 * REJECT/UNEVALUABLE."
 *
 * Live PubChem/ChEMBL lookup is attempted first by the campaign that consumes
 * this pool (see naturalAnalogueCampaign.ts) and is BLOCKED in this runtime's
 * egress (confirmed: connection refused to pubchem.ncbi.nlm.nih.gov and
 * www.ebi.ac.uk). This module is the NEXT available real source the mission
 * instructs Genesis to fall back to: named, individually cited literature
 * records, entered by hand because Genesis has no natural-product database of
 * its own — exactly the same discipline `naturalProducts.ts` already applies
 * to a single caller-supplied claim, extended to a small, real, checkable set.
 *
 * Every citation below is a real, independently verifiable publication. Every
 * SMILES was cross-checked against real RDKit output BEFORE being written
 * here (`packages/backend/src/compute/rdkit_worker.py descriptors`), and the
 * expected formula is carried alongside it so `crossValidateCandidate` can
 * repeat that check at run time — this file's atomic-composition claims are
 * not asked to be trusted, they are re-derived.
 *
 * WHAT THIS POOL DELIBERATELY INCLUDES:
 *  - two candidates with a small-molecule structure AND a literature-reported
 *    mechanism in the same biological family ketamine acts on (NMDA receptor);
 *  - one candidate (a venom peptide) with strong literature mechanism evidence
 *    but NO structure, because Genesis will not guess a ~17-residue peptide
 *    sequence's 3D chemistry from memory — this is an honest capability gap,
 *    not an omission;
 *  - one NEGATIVE CONTROL: a real natural product whose own best-documented
 *    mechanism is unrelated to NMDA receptors, included specifically so the
 *    falsification stage has something real to reject.
 *
 * This pool does NOT claim completeness. "Wykorzystaj możliwie szeroki
 * candidate pool... Nie ograniczaj się do jednego źródła" is honored by
 * drawing on independent literature per candidate, not by inflating the
 * count — a pool of four well-evidenced candidates is worth more here than
 * one of forty asserted without citation.
 */
export const NATURAL_PRODUCT_POOL_VERSION = '1.0.0';

export type CandidateStructure =
  | { kind: 'SMILES_CROSS_VALIDATED'; smiles: string; expectedFormula: string }
  | { kind: 'STRUCTURE_DECLINED'; reason: string };

export interface CuratedNaturalCandidate {
  candidateKey: string;
  compoundName: string;
  sourceOrganismOrOrigin: string;
  naturalOccurrenceEvidence: readonly SourceEvidence[];
  /** The candidate's OWN reported mechanism, from its OWN literature — never inferred from the reference compound. */
  mechanismEvidence: readonly TargetEvidenceRef[];
  mechanismSummary: string;
  /** Named target family, for comparing against the reference's resolved target. */
  reportedTargetFamily: string;
  structure: CandidateStructure;
}

export const NATURAL_PRODUCT_CANDIDATE_POOL: readonly CuratedNaturalCandidate[] = [
  {
    candidateKey: 'agmatine',
    compoundName: 'Agmatine',
    sourceOrganismOrOrigin: 'Endogenous in mammalian brain and peripheral tissue (decarboxylated L-arginine, via arginine decarboxylase); also reported in fermented foods.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Li G, Regunathan S, Barrow CJ, Eshraghi J, Cooper R, Reis DJ. "Agmatine: an endogenous clonidine-displacing substance in the brain." Science. 1994;263(5149):966-969.',
      establishes: 'Identification of agmatine as an endogenous mammalian brain substance, biosynthesised from L-arginine.',
    }],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Yang XC, Reis DJ. "Agmatine selectively blocks the N-methyl-D-aspartate subclass of glutamate receptor channels." J Pharmacol Exp Ther. 1999;288(2):544-549.',
      establishes: 'Agmatine reported as a voltage-dependent, use-dependent open-channel blocker of NMDA receptor channels, evaluated by electrophysiology.',
    }],
    mechanismSummary: 'Reported NMDA receptor open-channel blocker (electrophysiological evidence), independent of ketamine.',
    reportedTargetFamily: 'NMDA receptor (ionotropic glutamate receptor)',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'NCCCCNC(=N)N', expectedFormula: 'C5H14N4' },
  },
  {
    candidateKey: 'kynurenic-acid',
    compoundName: 'Kynurenic acid',
    sourceOrganismOrOrigin: 'Endogenous mammalian tryptophan/kynurenine-pathway metabolite, present in brain and peripheral tissue.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Moroni F. "Tryptophan metabolism and brain function: focus on kynurenine and other indole metabolites." Eur J Pharmacol. 1999;375(1-3):87-100.',
      establishes: 'Review-level confirmation of kynurenic acid as an endogenous mammalian tryptophan-pathway metabolite present in the CNS.',
    }],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Perkins MN, Stone TW. "An iontophoretic investigation of the actions of convulsant kynurenines and their interaction with the endogenous excitant quinolinic acid." Brain Res. 1982;247(1):184-187.',
      establishes: 'First report of kynurenic acid as a broad-spectrum excitatory amino acid antagonist, including NMDA-receptor-mediated excitation.',
    }],
    mechanismSummary: 'Reported NMDA receptor antagonist (glycine co-agonist site, and the glutamate site at higher concentration), independent of ketamine.',
    reportedTargetFamily: 'NMDA receptor (glycine co-agonist site / glutamate site)',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'O=c1cc(C(=O)O)[nH]c2ccccc12', expectedFormula: 'C10H7NO3' },
  },
  {
    candidateKey: 'conantokin-g',
    compoundName: 'Conantokin-G',
    sourceOrganismOrOrigin: 'Venom peptide of the marine cone snail Conus geographus.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Olivera BM, Gray WR, Zeikus R, McIntosh JM, Varga J, Rivier J, de Santos V, Cruz LJ. "Peptide neurotoxins from fish-hunting cone snails." Science. 1985;230(4732):1338-1343.',
      establishes: 'Characterisation of the conotoxin/conantokin peptide family from the venom of fish-hunting Conus species, including Conus geographus.',
    }],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Mena EE, Gullak MF, Pagnozzi MJ, Richter KE, Rivier J, Cruz LJ, Olivera BM. "Conantokin-G: a novel peptide antagonist to the N-methyl-D-aspartate (NMDA) receptor." Neurosci Lett. 1990;118(2):241-244.',
      establishes: 'Conantokin-G reported as a selective peptide antagonist of the NMDA receptor.',
    }],
    mechanismSummary: 'Reported NMDA receptor antagonist (NR2B/GluN2B-preferring peptide), independent of ketamine, but a peptide rather than a small molecule.',
    reportedTargetFamily: 'NMDA receptor (NR2B/GluN2B subunit-preferring)',
    structure: {
      kind: 'STRUCTURE_DECLINED',
      reason: 'Conantokin-G is a ~17-residue gamma-carboxyglutamate-containing peptide. Genesis has no verified sequence-to-structure source reachable in this runtime (PDB/UniProt are unreachable) and will not reconstruct a peptide SMILES from memory — an error in an unusual residue or ring closure would misrepresent real chemistry. This is a declared capability gap, not an assumed absence of structure.',
    },
  },
  {
    candidateKey: 'harmaline',
    compoundName: 'Harmaline',
    sourceOrganismOrOrigin: 'Seeds of Peganum harmala (Syrian rue).',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Herraiz T, González D, Ancín-Azpilicueta C, Alemán RH, Guillén H. "beta-Carboline alkaloids in Peganum harmala and inhibition of human monoamine oxidase (MAO)." Food Chem Toxicol. 2010;48(3):839-845.',
      establishes: 'Harmaline reported as a beta-carboline alkaloid constituent of Peganum harmala seeds.',
    }],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Herraiz T, González D, Ancín-Azpilicueta C, Alemán RH, Guillén H. "beta-Carboline alkaloids in Peganum harmala and inhibition of human monoamine oxidase (MAO)." Food Chem Toxicol. 2010;48(3):839-845.',
      establishes: 'Harmaline reported as a potent, reversible inhibitor of human monoamine oxidase A (MAO-A) — a mechanism unrelated to NMDA receptor antagonism.',
    }],
    mechanismSummary: 'NEGATIVE CONTROL. Best-documented mechanism is MAO-A inhibition, not NMDA receptor antagonism — included to prove the falsification stage rejects a real natural product on real target-mismatch grounds, not only on missing data.',
    reportedTargetFamily: 'Monoamine oxidase A (MAO-A)',
    structure: {
      kind: 'STRUCTURE_DECLINED',
      reason: 'Harmaline is a fused tetracyclic beta-carboline alkaloid. Genesis declines to supply its SMILES from memory without independent verification (PubChem is unreachable in this runtime): a subtly wrong ring fusion or substitution would misrepresent real chemistry, and this candidate is rejected at the mechanism stage regardless of structure (see mechanismFalsification.ts) — a structure is not required to reach that decision honestly.',
    },
  },
];

export interface StructuralCrossValidation {
  candidateKey: string;
  status: 'CONFIRMED' | 'MISMATCH' | 'DECLINED' | 'ENGINE_UNAVAILABLE';
  smiles: string | null;
  expectedFormula: string | null;
  observedFormula: string | null;
  reason: string;
}

export interface SmilesFormulaCrossValidation {
  status: 'CONFIRMED' | 'MISMATCH' | 'ENGINE_UNAVAILABLE';
  observedFormula: string | null;
  reason: string;
}

/**
 * Re-derives a molecular formula with the REAL RDKit worker and compares it
 * against a claimed formula. A mismatch means the stored SMILES does not
 * encode the compound its citation describes and must not proceed as if it
 * did — this is deliberately NOT "trust the SMILES because a human wrote it".
 *
 * Standalone so the SAME check applies to the reference compound's fallback
 * SMILES (see naturalAnalogueCampaign.ts) — a hardcoded structure gets no
 * less scrutiny for being the reference than for being a candidate.
 */
export function crossValidateSmilesFormula(transport: RdkitTransport, smiles: string, expectedFormula: string): SmilesFormulaCrossValidation {
  const detected = transport.detect();
  if (!detected.available) {
    return { status: 'ENGINE_UNAVAILABLE', observedFormula: null, reason: `RDKit is not available to cross-validate this structure: ${detected.reason}` };
  }
  const result = transport.describe(smiles);
  if (!result.ok) {
    return { status: 'MISMATCH', observedFormula: null, reason: `RDKit rejected the stored SMILES as invalid: ${result.reason}` };
  }
  const observedFormula = result.data.molecularFormula;
  const confirmed = observedFormula === expectedFormula;
  return {
    status: confirmed ? 'CONFIRMED' : 'MISMATCH',
    observedFormula,
    reason: confirmed
      ? `RDKit-derived formula ${observedFormula} matches the expected formula.`
      : `RDKit-derived formula ${observedFormula} does NOT match the expected formula ${expectedFormula}. This structure is not trustworthy and must not proceed.`,
  };
}

/** Same check, applied to one candidate from the pool. */
export function crossValidateCandidate(transport: RdkitTransport, candidate: CuratedNaturalCandidate): StructuralCrossValidation {
  if (candidate.structure.kind === 'STRUCTURE_DECLINED') {
    return {
      candidateKey: candidate.candidateKey, status: 'DECLINED', smiles: null,
      expectedFormula: null, observedFormula: null, reason: candidate.structure.reason,
    };
  }

  const result = crossValidateSmilesFormula(transport, candidate.structure.smiles, candidate.structure.expectedFormula);
  return {
    candidateKey: candidate.candidateKey,
    status: result.status,
    smiles: candidate.structure.smiles,
    expectedFormula: candidate.structure.expectedFormula,
    observedFormula: result.observedFormula,
    reason: result.reason,
  };
}
