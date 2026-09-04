import type { RdkitSimilarity, RdkitTransport } from './rdkitTransport';

/**
 * STRUCTURAL SIMILARITY — real RDKit, explicitly NOT biological similarity.
 *
 * "Porównuj: molecular descriptors, fingerprints, scaffold/fragment
 * relationships... ALE: structural similarity != biological similarity."
 *
 * This module carries exactly one number that matters (Tanimoto over Morgan
 * fingerprints) plus a scaffold match flag, both computed by the repository's
 * real RDKit worker. It never converts either into a claim about mechanism,
 * activity, or affinity — `similarityStatement` is the one sanctioned way to
 * describe a result, and it always states the negative case explicitly.
 */
export const STRUCTURAL_SIMILARITY_VERSION = '1.0.0';

export type SimilarityBand = 'HIGH' | 'MODERATE' | 'LOW' | 'NEGLIGIBLE';

/** Thresholds are descriptive labels for a real Tanimoto value, not verdicts. */
export function similarityBand(tanimoto: number): SimilarityBand {
  if (tanimoto >= 0.85) return 'HIGH';
  if (tanimoto >= 0.55) return 'MODERATE';
  if (tanimoto >= 0.2) return 'LOW';
  return 'NEGLIGIBLE';
}

export interface StructuralSimilarityResult {
  candidateSmiles: string;
  referenceSmiles: string;
  available: boolean;
  reason: string;
  tanimoto: number | null;
  band: SimilarityBand | null;
  sameScaffold: boolean | null;
  fingerprint: string | null;
  engine: string;
}

/**
 * Runs the real comparison. Absence of a value (engine unavailable, invalid
 * SMILES) is reported as `available: false`, never as a similarity of 0 —
 * zero Tanimoto overlap and "could not be computed" are different facts.
 */
export function evaluateStructuralSimilarity(
  transport: RdkitTransport,
  candidateSmiles: string,
  referenceSmiles: string,
): StructuralSimilarityResult {
  const detected = transport.detect();
  const engine = detected.available ? detected.engine : `rdkit:unavailable:${transport.transportId}`;

  if (!detected.available) {
    return {
      candidateSmiles, referenceSmiles, available: false, reason: detected.reason,
      tanimoto: null, band: null, sameScaffold: null, fingerprint: null, engine,
    };
  }

  const result: RdkitSimilarity = transport.similarity(candidateSmiles, referenceSmiles);
  if (!result.ok) {
    return {
      candidateSmiles, referenceSmiles, available: false, reason: `${result.error}: ${result.reason}`,
      tanimoto: null, band: null, sameScaffold: null, fingerprint: null, engine,
    };
  }

  return {
    candidateSmiles, referenceSmiles, available: true, reason: '',
    tanimoto: result.tanimoto, band: similarityBand(result.tanimoto),
    sameScaffold: result.sameScaffold, fingerprint: result.fingerprint, engine,
  };
}

/**
 * The one sanctioned sentence about a structural similarity result. Always
 * states plainly that similarity is not a biological claim — high or low.
 */
export function similarityStatement(result: StructuralSimilarityResult): string {
  if (!result.available) {
    return `Structural similarity to the reference could not be computed: ${result.reason}.`;
  }
  const pct = (result.tanimoto! * 100).toFixed(1);
  const scaffoldNote = result.sameScaffold
    ? 'It shares the reference\'s Bemis-Murcko scaffold.'
    : 'It does not share the reference\'s scaffold.';
  return `Tanimoto similarity to the reference is ${pct}% (${result.band}, Morgan fingerprints, radius 2). ${scaffoldNote} `
    + 'This is a structural measurement only — it is not evidence of shared biological activity, and a LOW value does not rule out a shared mechanism reached by a different scaffold.';
}
