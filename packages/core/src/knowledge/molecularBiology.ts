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

/* ──────────────────────────────────────────────────────────────────────────
 * MOLECULAR BIOLOGY 2.0 (D-130) — the delivered gap-closure pack asked for
 * replication, proofreading, repair, RNA processing, folding, the electron
 * transport chain, the proton gradient, ATP synthase, ATP/ADP/AMP
 * bookkeeping and a metabolic network with flux hooks. All of it is added
 * HERE, on the same textbook layer (no second engine): deterministic,
 * dimensionless-or-textbook MODELS with their assumptions in `notes`. None
 * of it is organism-specific kinetics, molecular dynamics or a wet-lab
 * protocol. Every report carries its label and a content hash.
 * ────────────────────────────────────────────────────────────────────────── */

export interface MechanismReport<K extends string, I, O> { readonly kind: K; readonly inputs: I; readonly outputs: O; readonly label: 'MODEL' | 'TEXTBOOK_ESTIMATE'; readonly notes: readonly string[]; readonly contentHash: string; }
function seal<K extends string, I, O>(kind: K, inputs: I, outputs: O, label: 'MODEL' | 'TEXTBOOK_ESTIMATE', notes: readonly string[]): MechanismReport<K, I, O> {
  return { kind, inputs, outputs, label, notes, contentHash: sha256hex(stableStringify({ kind, inputs, outputs, label })) };
}
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

export interface ReplicationInput { readonly templateBp: number; readonly polymeraseErrorRate?: number; readonly proofreadingFactor?: number; readonly mismatchRepairFactor?: number; }
export interface ReplicationOutput { readonly daughterDuplexes: 2; readonly parentalStrandsPerDuplex: 1; readonly basesSynthesized: number; readonly expectedErrorsRaw: number; readonly expectedErrorsAfterProofreading: number; readonly expectedErrorsAfterMismatchRepair: number; readonly effectiveErrorRate: number; }
/** Semiconservative replication with the textbook three-stage fidelity ladder (polymerase selectivity → 3'→5' proofreading → mismatch repair). */
export function dnaReplication(input: ReplicationInput): MechanismReport<'DNA_REPLICATION', ReplicationInput, ReplicationOutput> {
  const bp = Math.max(0, Math.floor(input.templateBp)); const raw = input.polymeraseErrorRate ?? 1e-5; const pf = input.proofreadingFactor ?? 100; const mr = input.mismatchRepairFactor ?? 100;
  const synthesized = bp * 2; const e0 = synthesized * raw; const e1 = e0 / pf; const e2 = e1 / mr;
  return seal('DNA_REPLICATION', { templateBp: bp, polymeraseErrorRate: raw, proofreadingFactor: pf, mismatchRepairFactor: mr }, { daughterDuplexes: 2, parentalStrandsPerDuplex: 1, basesSynthesized: synthesized, expectedErrorsRaw: e0, expectedErrorsAfterProofreading: e1, expectedErrorsAfterMismatchRepair: e2, effectiveErrorRate: synthesized ? e2 / synthesized : 0 }, 'TEXTBOOK_ESTIMATE', ['semiconservative: two duplexes, each with one parental strand', 'fidelity ladder uses textbook orders of magnitude (≈10⁻⁵ raw, ≈100× proofreading, ≈100× mismatch repair → ≈10⁻⁹ per base); organism-specific values differ', 'no origins, no Okazaki fragments, no kinetics modelled']);
}

export type DnaDamageClass = 'BASE_MISMATCH' | 'OXIDIZED_OR_DEAMINATED_BASE' | 'UV_PYRIMIDINE_DIMER' | 'BULKY_ADDUCT' | 'ALKYLATION' | 'SINGLE_STRAND_BREAK' | 'DOUBLE_STRAND_BREAK';
export type DnaRepairPathway = 'MISMATCH_REPAIR' | 'BASE_EXCISION_REPAIR' | 'NUCLEOTIDE_EXCISION_REPAIR' | 'DIRECT_REVERSAL' | 'SINGLE_STRAND_BREAK_REPAIR' | 'HOMOLOGOUS_RECOMBINATION' | 'NON_HOMOLOGOUS_END_JOINING';
const REPAIR_MAP: Readonly<Record<DnaDamageClass, readonly DnaRepairPathway[]>> = {
  BASE_MISMATCH: ['MISMATCH_REPAIR'], OXIDIZED_OR_DEAMINATED_BASE: ['BASE_EXCISION_REPAIR'], UV_PYRIMIDINE_DIMER: ['NUCLEOTIDE_EXCISION_REPAIR', 'DIRECT_REVERSAL'], BULKY_ADDUCT: ['NUCLEOTIDE_EXCISION_REPAIR'], ALKYLATION: ['DIRECT_REVERSAL', 'BASE_EXCISION_REPAIR'], SINGLE_STRAND_BREAK: ['SINGLE_STRAND_BREAK_REPAIR'], DOUBLE_STRAND_BREAK: ['HOMOLOGOUS_RECOMBINATION', 'NON_HOMOLOGOUS_END_JOINING'],
};
export interface RepairInput { readonly lesions: Readonly<Partial<Record<DnaDamageClass, number>>>; readonly sisterChromatidAvailable?: boolean; }
export interface RepairOutput { readonly assignments: readonly { readonly damage: DnaDamageClass; readonly count: number; readonly pathways: readonly DnaRepairPathway[]; readonly errorProne: boolean }[]; readonly totalLesions: number; }
/** Conceptual damage-class → pathway mapping (textbook); double-strand breaks route to HR only when a sister chromatid is available, else NHEJ (error-prone). */
export function dnaRepair(input: RepairInput): MechanismReport<'DNA_REPAIR', RepairInput, RepairOutput> {
  const sister = input.sisterChromatidAvailable ?? true;
  const assignments = (Object.keys(REPAIR_MAP) as DnaDamageClass[]).filter((d) => (input.lesions[d] ?? 0) > 0).map((damage) => {
    const count = Math.max(0, Math.floor(input.lesions[damage] ?? 0));
    const pathways = damage === 'DOUBLE_STRAND_BREAK' ? (sister ? ['HOMOLOGOUS_RECOMBINATION'] as const : ['NON_HOMOLOGOUS_END_JOINING'] as const) : REPAIR_MAP[damage];
    return { damage, count, pathways: [...pathways], errorProne: pathways.includes('NON_HOMOLOGOUS_END_JOINING') };
  });
  return seal('DNA_REPAIR', { lesions: input.lesions, sisterChromatidAvailable: sister }, { assignments, totalLesions: assignments.reduce((a, x) => a + x.count, 0) }, 'MODEL', ['conceptual mapping of damage classes to textbook pathways; no enzymes, rates or cell-cycle dependence beyond the sister-chromatid switch', 'not a prediction for any organism, cell or patient']);
}

export interface RnaProcessingInput { readonly exonLengths: readonly number[]; readonly intronLengths: readonly number[]; readonly polyATail?: number; readonly fivePrimeCap?: boolean; }
export interface RnaProcessingOutput { readonly preMrnaLength: number; readonly matureMrnaLength: number; readonly splicedIntrons: number; readonly exonJunctions: number; readonly possibleExonSkippingIsoforms: number; }
/** Capping, splicing and polyadenylation as bookkeeping: pre-mRNA → mature mRNA; the isoform count is the combinatorial upper bound with optional internal exons (conceptual). */
export function rnaProcessing(input: RnaProcessingInput): MechanismReport<'RNA_PROCESSING', RnaProcessingInput, RnaProcessingOutput> {
  const exons = input.exonLengths.map((x) => Math.max(0, Math.floor(x))); const introns = input.intronLengths.map((x) => Math.max(0, Math.floor(x)));
  if (introns.length !== Math.max(0, exons.length - 1)) throw new Error('RNA_PROCESSING_INTRON_COUNT_MUST_BE_EXONS_MINUS_ONE');
  const tail = Math.max(0, Math.floor(input.polyATail ?? 200)); const cap = input.fivePrimeCap ?? true;
  const pre = exons.reduce((a, b) => a + b, 0) + introns.reduce((a, b) => a + b, 0);
  const mature = exons.reduce((a, b) => a + b, 0) + tail + (cap ? 1 : 0);
  const internal = Math.max(0, exons.length - 2);
  return seal('RNA_PROCESSING', { exonLengths: exons, intronLengths: introns, polyATail: tail, fivePrimeCap: cap }, { preMrnaLength: pre, matureMrnaLength: mature, splicedIntrons: introns.length, exonJunctions: Math.max(0, exons.length - 1), possibleExonSkippingIsoforms: 2 ** internal }, 'MODEL', ['constitutive splicing removes every intron; the isoform count is the combinatorial bound for skipping internal exons, not a prediction of which are expressed', 'the 7-methylguanosine cap is counted as one nucleotide; no editing, no modifications, no export/decay kinetics']);
}

export interface FoldingInput { readonly chainLengthAa: number; readonly hydrophobicFraction: number; readonly temperatureK?: number; readonly denaturantM?: number; }
export interface FoldingOutput { readonly deltaGFoldKJPerMol: number; readonly foldedFraction: number; readonly meltingTemperatureK: number; readonly regime: 'FOLDED' | 'MARGINAL' | 'UNFOLDED'; }
/** Two-state folding ABSTRACTION: a declared toy free energy (hydrophobic burial gain vs. conformational entropy cost, linear denaturant term) → Boltzmann folded fraction. Not molecular dynamics. */
export function proteinFoldingAbstraction(input: FoldingInput): MechanismReport<'PROTEIN_FOLDING_ABSTRACTION', FoldingInput, FoldingOutput> {
  const n = Math.max(1, Math.floor(input.chainLengthAa)); const h = clamp01(input.hydrophobicFraction); const T = input.temperatureK ?? 310; const D = Math.max(0, input.denaturantM ?? 0);
  const R = 8.314e-3; // kJ mol⁻¹ K⁻¹
  const burialGain = -2.0 * h * n; // kJ/mol, toy: each buried hydrophobic residue contributes ≈ -2 (hydrophobic-effect order of magnitude)
  const entropyCost = 0.0022 * n * T; // kJ/mol, toy: conformational entropy ~ 2.2 J/(mol·K) per residue
  const denaturant = 6 * D; // kJ/mol per molar denaturant (an m-value of the order seen for ~150-residue proteins, toy)
  const dG = +(burialGain + entropyCost + denaturant).toFixed(3);
  const folded = clamp01(1 / (1 + Math.exp(dG / (R * T))));
  const Tm = +((2.0 * h * n - 6 * D) / (0.0022 * n)).toFixed(1);
  return seal('PROTEIN_FOLDING_ABSTRACTION', { chainLengthAa: n, hydrophobicFraction: h, temperatureK: T, denaturantM: D }, { deltaGFoldKJPerMol: dG, foldedFraction: +folded.toFixed(4), meltingTemperatureK: Tm, regime: folded > 0.9 ? 'FOLDED' : folded > 0.5 ? 'MARGINAL' : 'UNFOLDED' }, 'MODEL', ['two-state (folded/unfolded) abstraction with declared toy coefficients; no structure, no pathway, no chaperones', 'coefficients are illustrative orders of magnitude, not fitted to any protein']);
}

export interface EtcInput { readonly nadh: number; readonly fadh2: number; readonly couplingEfficiency?: number; readonly protonLeakFraction?: number; }
export interface EtcOutput { readonly protonsPumped: number; readonly protonsAvailable: number; readonly atpFromSynthase: number; readonly protonsPerAtp: number; readonly poRatioNadh: number; readonly poRatioFadh2: number; }
/** Electron transport → proton gradient → ATP synthase, textbook stoichiometry: 10 H⁺ per NADH (complexes I+III+IV), 6 per FADH₂; ≈ 3.67 H⁺ per ATP (c₈ ring 8/3 + 1 for ADP/Pi transport). */
export function electronTransportChain(input: EtcInput): MechanismReport<'ELECTRON_TRANSPORT_CHAIN', EtcInput, EtcOutput> {
  const nadh = Math.max(0, input.nadh); const fadh2 = Math.max(0, input.fadh2); const eff = clamp01(input.couplingEfficiency ?? 1); const leak = clamp01(input.protonLeakFraction ?? 0);
  const pumped = 10 * nadh + 6 * fadh2; const available = pumped * (1 - leak) * eff; const perAtp = 8 / 3 + 1;
  return seal('ELECTRON_TRANSPORT_CHAIN', { nadh, fadh2, couplingEfficiency: eff, protonLeakFraction: leak }, { protonsPumped: pumped, protonsAvailable: +available.toFixed(4), atpFromSynthase: +(available / perAtp).toFixed(4), protonsPerAtp: +perAtp.toFixed(4), poRatioNadh: +(10 / perAtp).toFixed(3), poRatioFadh2: +(6 / perAtp).toFixed(3) }, 'TEXTBOOK_ESTIMATE', ['stoichiometry: complex I 4 H⁺, III 4 H⁺, IV 2 H⁺ per NADH; 6 H⁺ per FADH₂; mammalian ATP synthase c₈ ring → 8/3 H⁺ per ATP plus 1 H⁺ for ADP/Pi transport', 'P/O ≈ 2.7 / 1.6 here vs. the commonly quoted ≈ 2.5 / 1.5 — a textbook range, not a measurement', 'coupling efficiency and leak are dimensionless hooks, not organism data']);
}

export interface AtpPoolInput { readonly atp: number; readonly adp: number; readonly amp: number; }
export interface AtpPoolOutput { readonly total: number; readonly energyCharge: number; readonly atpFraction: number; readonly regime: 'HIGH_ENERGY' | 'TYPICAL' | 'STRESSED' | 'DEPLETED'; }
/** Atkinson adenylate energy charge (ATP + ½ ADP) / (ATP + ADP + AMP); healthy cells hold ≈ 0.8–0.95 (textbook). */
export function atpBookkeeping(input: AtpPoolInput): MechanismReport<'ATP_BOOKKEEPING', AtpPoolInput, AtpPoolOutput> {
  const atp = Math.max(0, input.atp); const adp = Math.max(0, input.adp); const amp = Math.max(0, input.amp); const total = atp + adp + amp;
  const ec = total ? (atp + 0.5 * adp) / total : 0;
  return seal('ATP_BOOKKEEPING', { atp, adp, amp }, { total, energyCharge: +ec.toFixed(4), atpFraction: total ? +(atp / total).toFixed(4) : 0, regime: ec > 0.95 ? 'HIGH_ENERGY' : ec >= 0.8 ? 'TYPICAL' : ec >= 0.5 ? 'STRESSED' : 'DEPLETED' }, 'TEXTBOOK_ESTIMATE', ['energy charge after Atkinson; the 0.8–0.95 band is the textbook range for healthy cells', 'pool sizes are inputs — nothing here measures a cell']);
}

export type MetaboliteId = 'GLUCOSE' | 'PYRUVATE' | 'LACTATE' | 'ACETYL_COA' | 'CO2' | 'NADH' | 'FADH2' | 'O2' | 'ATP';
export interface MetabolicReaction { readonly id: 'GLYCOLYSIS' | 'LACTATE_FERMENTATION' | 'PYRUVATE_OXIDATION' | 'CITRIC_ACID_CYCLE' | 'OXIDATIVE_PHOSPHORYLATION'; readonly requiresOxygen: boolean; readonly stoichiometry: Readonly<Partial<Record<MetaboliteId, number>>>; }
/** The conceptual network: five lumped reactions with textbook stoichiometry per glucose (or per pyruvate/acetyl-CoA where noted). */
export const METABOLIC_NETWORK: readonly MetabolicReaction[] = [
  { id: 'GLYCOLYSIS', requiresOxygen: false, stoichiometry: { GLUCOSE: -1, PYRUVATE: 2, ATP: 2, NADH: 2 } },
  { id: 'LACTATE_FERMENTATION', requiresOxygen: false, stoichiometry: { PYRUVATE: -1, NADH: -1, LACTATE: 1 } },
  { id: 'PYRUVATE_OXIDATION', requiresOxygen: true, stoichiometry: { PYRUVATE: -1, ACETYL_COA: 1, NADH: 1, CO2: 1 } },
  { id: 'CITRIC_ACID_CYCLE', requiresOxygen: true, stoichiometry: { ACETYL_COA: -1, NADH: 3, FADH2: 1, ATP: 1, CO2: 2 } },
  { id: 'OXIDATIVE_PHOSPHORYLATION', requiresOxygen: true, stoichiometry: { NADH: -1, O2: -0.5 } },
];
export interface FluxInput { readonly glucoseFlux: number; readonly oxygenAvailable: boolean; readonly couplingEfficiency?: number; readonly protonLeakFraction?: number; }
export interface FluxOutput { readonly atpFlux: number; readonly lactateFlux: number; readonly co2Flux: number; readonly oxygenFlux: number; readonly substrateLevelAtp: number; readonly oxidativeAtp: number; readonly atpPerGlucose: number; readonly regime: 'AEROBIC' | 'ANAEROBIC'; }
/** Steady-state flux through the lumped network (per unit time, in units of the glucose flux): every pyruvate is oxidised when oxygen is available, else fermented to lactate. */
export function metabolicFlux(input: FluxInput): MechanismReport<'METABOLIC_FLUX', FluxInput, FluxOutput> {
  const g = Math.max(0, input.glucoseFlux); const eff = clamp01(input.couplingEfficiency ?? 1); const leak = clamp01(input.protonLeakFraction ?? 0);
  if (!input.oxygenAvailable) return seal('METABOLIC_FLUX', { glucoseFlux: g, oxygenAvailable: false, couplingEfficiency: eff, protonLeakFraction: leak }, { atpFlux: 2 * g, lactateFlux: 2 * g, co2Flux: 0, oxygenFlux: 0, substrateLevelAtp: 2 * g, oxidativeAtp: 0, atpPerGlucose: 2, regime: 'ANAEROBIC' }, 'MODEL', ['anaerobic: glycolysis + lactate fermentation regenerates NAD⁺; net 2 ATP per glucose', 'lumped, steady-state, no regulation or transport']);
  const nadh = (2 + 2 + 6) * g; const fadh2 = 2 * g; const etc = electronTransportChain({ nadh, fadh2, couplingEfficiency: eff, protonLeakFraction: leak });
  const substrate = (2 + 2) * g; const oxidative = etc.outputs.atpFromSynthase; const atp = substrate + oxidative;
  return seal('METABOLIC_FLUX', { glucoseFlux: g, oxygenAvailable: true, couplingEfficiency: eff, protonLeakFraction: leak }, { atpFlux: +atp.toFixed(4), lactateFlux: 0, co2Flux: 6 * g, oxygenFlux: 6 * g, substrateLevelAtp: substrate, oxidativeAtp: +oxidative.toFixed(4), atpPerGlucose: g ? +(atp / g).toFixed(3) : 0, regime: 'AEROBIC' }, 'MODEL', ['aerobic: glycolysis (2 ATP, 2 NADH) + pyruvate oxidation (2 NADH) + citric acid cycle (6 NADH, 2 FADH₂, 2 GTP≈ATP) + oxidative phosphorylation on the textbook proton stoichiometry', 'cytosolic NADH shuttles, regulation and transport are not modelled; the ≈ 30–32 ATP textbook range applies']);
}

export type MolecularMechanismRequest =
  | { readonly kind: 'DNA_REPLICATION'; readonly input: ReplicationInput } | { readonly kind: 'DNA_REPAIR'; readonly input: RepairInput } | { readonly kind: 'RNA_PROCESSING'; readonly input: RnaProcessingInput }
  | { readonly kind: 'PROTEIN_FOLDING_ABSTRACTION'; readonly input: FoldingInput } | { readonly kind: 'ELECTRON_TRANSPORT_CHAIN'; readonly input: EtcInput } | { readonly kind: 'ATP_BOOKKEEPING'; readonly input: AtpPoolInput } | { readonly kind: 'METABOLIC_FLUX'; readonly input: FluxInput };
export type MolecularMechanismReport = ReturnType<typeof dnaReplication> | ReturnType<typeof dnaRepair> | ReturnType<typeof rnaProcessing> | ReturnType<typeof proteinFoldingAbstraction> | ReturnType<typeof electronTransportChain> | ReturnType<typeof atpBookkeeping> | ReturnType<typeof metabolicFlux>;
/** One entry point for the kernel provider: dispatch by kind. */
export function molecularMechanism(req: MolecularMechanismRequest): MolecularMechanismReport {
  switch (req.kind) {
    case 'DNA_REPLICATION': return dnaReplication(req.input); case 'DNA_REPAIR': return dnaRepair(req.input); case 'RNA_PROCESSING': return rnaProcessing(req.input);
    case 'PROTEIN_FOLDING_ABSTRACTION': return proteinFoldingAbstraction(req.input); case 'ELECTRON_TRANSPORT_CHAIN': return electronTransportChain(req.input);
    case 'ATP_BOOKKEEPING': return atpBookkeeping(req.input); case 'METABOLIC_FLUX': return metabolicFlux(req.input);
  }
}
/** Anchor a mechanism report on the ledger as a model claim (identity, not biology). */
export function commitMechanismReport(ledger: EvidenceLedger, report: MolecularMechanismReport, worldId: string): string {
  const numeric = Object.entries(report.outputs as unknown as Record<string, unknown>).filter(([, v]) => typeof v === 'number').map(([k, v]) => `${k}=${v as number}`).join(' ');
  return ledger.addRecord({ sourceUrl: `genesis://molecular-biology/${worldId}/${report.kind.toLowerCase()}/${report.contentHash.slice(0, 12)}`, sourceTimestamp: null, claim: `Molecular mechanism ${report.kind} label=${report.label} ${numeric} contentHash=${report.contentHash}`, claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'molecular-biology-model', independentSourceIds: [] } }).record.contentHash;
}
