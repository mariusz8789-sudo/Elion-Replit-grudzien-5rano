/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from './EvidenceLedger.js';
import { sha256hex, stableStringify } from './EvidenceLedger.js';

/**
 * MOLECULAR BIOLOGY KNOWLEDGE LAYER — the textbook central dogma and the
 * textbook ATP ledger, as deterministic functions with explicit labels.
 *
 *  - The standard genetic code (64 codons → 20 amino acids + stop), the
 *    universal table (NCBI translation table 1). TEXTBOOK.
 *  - transcribe: coding-strand DNA → mRNA (T→U); translate: from the first
 *    AUG to the first in-frame stop. MODEL of the canonical process only —
 *    no splicing, no wobble, no post-translational chemistry.
 *  - ATP per glucose: glycolysis net 2 ATP + 2 NADH; complete aerobic
 *    oxidation ≈ 30–32 ATP (modern P/O ratios; the historical 36–38 is
 *    reported alongside as the older estimate). TEXTBOOK_ESTIMATE, a range,
 *    never a measurement.
 *
 * Nothing here is a claim about a specific organism, cell or patient. Every
 * report can be anchored on the EvidenceLedger as `model`.
 */

export const STOP = '*';
const BASES = ['U', 'C', 'A', 'G'] as const;
const AA_ORDER = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';

/** Standard genetic code, keyed by RNA codon (UUU → F …). */
export const CODON_TABLE: Readonly<Record<string, string>> = (() => {
  const t: Record<string, string> = {}; let i = 0;
  for (const a of BASES) for (const b of BASES) for (const c of BASES) t[a + b + c] = AA_ORDER[i++];
  return t;
})();

export const AMINO_ACID_NAMES: Readonly<Record<string, string>> = { A: 'alanine', R: 'arginine', N: 'asparagine', D: 'aspartate', C: 'cysteine', Q: 'glutamine', E: 'glutamate', G: 'glycine', H: 'histidine', I: 'isoleucine', L: 'leucine', K: 'lysine', M: 'methionine', F: 'phenylalanine', P: 'proline', S: 'serine', T: 'threonine', W: 'tryptophan', Y: 'tyrosine', V: 'valine', [STOP]: 'stop' };

export function normalizeDna(seq: string): string {
  const s = seq.toUpperCase().replace(/[\s0-9]/g, '');
  if (!/^[ACGT]*$/.test(s)) throw new Error('DNA_SEQUENCE_INVALID: only A, C, G, T');
  return s;
}
export function reverseComplement(dna: string): string { const map: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' }; return normalizeDna(dna).split('').reverse().map((b) => map[b]).join(''); }
export function gcContent(dna: string): number { const s = normalizeDna(dna); if (!s.length) return 0; let gc = 0; for (const b of s) if (b === 'G' || b === 'C') gc++; return +(gc / s.length).toFixed(6); }
/** Coding strand → mRNA (T→U). */
export function transcribe(codingStrandDna: string): string { return normalizeDna(codingStrandDna).replace(/T/g, 'U'); }

export interface TranslationResult {
  readonly startIndex: number | null;
  readonly codons: readonly string[];
  readonly peptide: string;
  readonly terminated: boolean;
  readonly stopCodon: string | null;
}

/** From the first AUG, codon by codon, to the first in-frame stop (or the end of the read). */
export function translate(mrna: string): TranslationResult {
  const s = mrna.toUpperCase().replace(/\s/g, '');
  if (!/^[ACGU]*$/.test(s)) throw new Error('RNA_SEQUENCE_INVALID: only A, C, G, U');
  const start = s.indexOf('AUG');
  if (start < 0) return { startIndex: null, codons: [], peptide: '', terminated: false, stopCodon: null };
  const codons: string[] = []; let peptide = ''; let stop: string | null = null;
  for (let i = start; i + 3 <= s.length; i += 3) {
    const codon = s.slice(i, i + 3); const aa = CODON_TABLE[codon]; codons.push(codon);
    if (aa === STOP) { stop = codon; break; }
    peptide += aa;
  }
  return { startIndex: start, codons, peptide, terminated: stop !== null, stopCodon: stop };
}

export type AtpPathway = 'GLYCOLYSIS_ONLY' | 'AEROBIC_COMPLETE';
export interface AtpBudget {
  readonly pathway: AtpPathway;
  readonly glucoseMolecules: number;
  readonly atpNetMin: number;
  readonly atpNetMax: number;
  readonly nadh: number;
  readonly fadh2: number;
  readonly historicalEstimate: number | null;
  readonly label: 'TEXTBOOK_ESTIMATE';
  readonly notes: readonly string[];
}

/** Textbook ATP yield per glucose; a range because the P/O ratios are themselves estimates. */
export function atpBudget(pathway: AtpPathway, glucoseMolecules = 1): AtpBudget {
  const n = Math.max(0, Math.floor(glucoseMolecules));
  if (pathway === 'GLYCOLYSIS_ONLY') return { pathway, glucoseMolecules: n, atpNetMin: 2 * n, atpNetMax: 2 * n, nadh: 2 * n, fadh2: 0, historicalEstimate: null, label: 'TEXTBOOK_ESTIMATE', notes: ['glycolysis: 4 ATP made, 2 invested → net 2 ATP + 2 NADH per glucose; pyruvate remains'] };
  return { pathway, glucoseMolecules: n, atpNetMin: 30 * n, atpNetMax: 32 * n, nadh: 10 * n, fadh2: 2 * n, historicalEstimate: 36 * n, label: 'TEXTBOOK_ESTIMATE', notes: ['glycolysis + pyruvate oxidation + citric acid cycle + oxidative phosphorylation', 'modern P/O ratios (≈2.5 NADH, ≈1.5 FADH2) give ≈30–32 ATP; the older 36–38 figure is reported as historical', 'not a measurement of any cell: mitochondrial coupling, shuttles and leak vary'] };
}

export interface CentralDogmaReport {
  readonly dna: string;
  readonly length: number;
  readonly gc: number;
  readonly mrna: string;
  readonly translation: TranslationResult;
  readonly peptideNames: readonly string[];
  readonly atp: AtpBudget;
  readonly label: 'MODEL';
  readonly contentHash: string;
  readonly notes: readonly string[];
}

/** One deterministic report for a DNA coding sequence: transcription, translation, composition, and the textbook ATP context. */
export function centralDogmaReport(codingStrandDna: string, pathway: AtpPathway = 'AEROBIC_COMPLETE'): CentralDogmaReport {
  const dna = normalizeDna(codingStrandDna);
  if (dna.length < 3) throw new Error('DNA_SEQUENCE_TOO_SHORT');
  const mrna = transcribe(dna);
  const translation = translate(mrna);
  const report = { dna, length: dna.length, gc: gcContent(dna), mrna, translation, peptideNames: translation.peptide.split('').map((a) => AMINO_ACID_NAMES[a] ?? a), atp: atpBudget(pathway) };
  return { ...report, label: 'MODEL', contentHash: sha256hex(stableStringify(report)), notes: ['standard genetic code (translation table 1); coding strand assumed; no splicing, no modifications', translation.startIndex === null ? 'no AUG start codon: no peptide' : translation.terminated ? 'translation ended at an in-frame stop codon' : 'no in-frame stop: open reading frame runs to the end of the read'] };
}

/** Anchor a report on the ledger as a model claim; the returned hash proves identity, not biology. */
export function commitCentralDogmaReport(ledger: EvidenceLedger, report: CentralDogmaReport, worldId: string): string {
  const res = ledger.addRecord({ sourceUrl: `genesis://molecular-biology/${worldId}/central-dogma/${report.contentHash.slice(0, 12)}`, sourceTimestamp: null, claim: `Central dogma model dnaLength=${report.length} gc=${report.gc} peptideLength=${report.translation.peptide.length} terminated=${report.translation.terminated} atpMin=${report.atp.atpNetMin} atpMax=${report.atp.atpNetMax} contentHash=${report.contentHash}`, claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'molecular-biology-model', independentSourceIds: [] } });
  return res.record.contentHash;
}
