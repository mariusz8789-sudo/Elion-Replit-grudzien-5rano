import type { HonestyLevel } from '../types';

/**
 * Longevity Discovery Platform — mechanism registry (layer 1 of 4).
 *
 * WHAT THIS FILE IS: a structured map of ten ageing mechanisms, the molecules
 * that define them, the assays that measure them, and the directed mechanistic
 * links between them.
 *
 * WHAT THIS FILE IS NOT: it contains NO efficacy data, NO effect sizes, NO
 * claims that any intervention extends lifespan or healthspan. Everything here
 * is textbook mechanism — the kind of statement found in a cell-biology course,
 * not a result. Efficacy only ever enters the platform as an EvidenceRecord
 * supplied by a scientist with a citation (see evidence.ts), never from here.
 *
 * Every entry carries `honesty` so the UI can show the reader how settled the
 * mechanism is:
 *  - 'exact'       — molecular identity / assay definition; not in scientific dispute
 *  - 'simplified'  — real mechanism, but the registry states a coarse version of it
 *  - 'theoretical' — an active research hypothesis, not established causation
 */

export type HallmarkId =
  | 'telomere-attrition'
  | 'telomerase'
  | 'yamanaka-factors'
  | 'epigenetic-reprogramming'
  | 'cellular-senescence'
  | 'sasp'
  | 'dna-repair'
  | 'stem-cell-rejuvenation'
  | 'mitochondrial-dysfunction'
  | 'autophagy';

/** A laboratory readout that quantifies a mechanism. Assay names only — no reference ranges. */
export interface Readout {
  id: string;
  /** Assay name as used in the literature. */
  assay: string;
  /** What the assay physically measures. */
  measures: string;
  /**
   * Whether the readout is a direct measurement of the mechanism or a proxy.
   * A proxy can move for reasons unrelated to ageing — the appraisal engine
   * discounts evidence that rests only on proxies.
   */
  kind: 'direct' | 'proxy';
}

export interface Hallmark {
  id: HallmarkId;
  label: string;
  /** One paragraph of mechanism. Descriptive only. */
  summary: string;
  /** Genes/proteins that define the mechanism (HGNC symbols where they exist). */
  molecules: string[];
  readouts: Readout[];
  honesty: HonestyLevel;
  /** What this registry entry deliberately does not claim. */
  honestyNote: string;
}

/**
 * Directed mechanistic link. `promotes` = A increases/drives B.
 * `counteracts` = A opposes/reverses B. Only well-documented directions are
 * encoded; anything contested is marked 'theoretical' and must say so.
 */
export interface MechanisticEdge {
  from: HallmarkId;
  to: HallmarkId;
  effect: 'promotes' | 'counteracts';
  mechanism: string;
  honesty: HonestyLevel;
}

export const HALLMARKS: Hallmark[] = [
  {
    id: 'telomere-attrition',
    label: 'Telomere attrition',
    summary:
      'Telomeres are TTAGGG repeat tracts capped by the shelterin complex. Because DNA polymerase cannot fully replicate a linear end (the end-replication problem), telomeres shorten with each division. Once a telomere becomes critically short it is recognised as a DNA double-strand break and triggers a persistent DNA damage response. In cultured human fibroblasts this limits division to roughly 40–60 population doublings (the Hayflick limit).',
    molecules: ['TERF1', 'TERF2', 'POT1', 'TINF2', 'ACD', 'TERF2IP'],
    readouts: [
      { id: 'trf-southern', assay: 'Terminal restriction fragment (Southern blot)', measures: 'Mean telomere length distribution', kind: 'direct' },
      { id: 'qpcr-ts', assay: 'qPCR T/S ratio', measures: 'Telomere signal relative to a single-copy gene', kind: 'proxy' },
      { id: 'flow-fish', assay: 'Flow-FISH', measures: 'Per-cell telomere fluorescence', kind: 'direct' },
    ],
    honesty: 'exact',
    honestyNote:
      'The end-replication problem and the Hayflick limit are established. This entry does NOT claim that telomere length predicts an individual’s remaining lifespan — leukocyte telomere length is a weak individual-level predictor and is not a clinical test.',
  },
  {
    id: 'telomerase',
    label: 'Telomerase',
    summary:
      'Telomerase is a ribonucleoprotein reverse transcriptase that extends telomeres. TERT is the catalytic subunit and TERC provides the RNA template; dyskerin (DKC1) stabilises the complex. It is active in the germline, in embryonic and some adult stem cells, and is reactivated in the large majority of human cancers. Its discovery earned the 2009 Nobel Prize in Physiology or Medicine.',
    molecules: ['TERT', 'TERC', 'DKC1', 'NOP10', 'NHP2'],
    readouts: [
      { id: 'trap', assay: 'TRAP assay', measures: 'Telomerase catalytic activity in a lysate', kind: 'direct' },
      { id: 'tert-expr', assay: 'TERT qRT-PCR / RNA-seq', measures: 'TERT transcript abundance', kind: 'proxy' },
    ],
    honesty: 'exact',
    honestyNote:
      'Molecular identity and catalytic function are established. This entry makes NO claim that activating telomerase is safe or beneficial in humans — the same activity is what allows most tumours to divide indefinitely (see the oncogenic tension in interventions.ts).',
  },
  {
    id: 'yamanaka-factors',
    label: 'Yamanaka factors (OSKM)',
    summary:
      'Four transcription factors — OCT4 (POU5F1), SOX2, KLF4 and MYC — are together sufficient to convert a differentiated somatic cell into an induced pluripotent stem cell. Shinya Yamanaka shared the 2012 Nobel Prize for this. Because full reprogramming erases cell identity, ageing research generally studies partial or cyclic expression, and often omits MYC (the OSK subset) to lower oncogenic risk.',
    molecules: ['POU5F1', 'SOX2', 'KLF4', 'MYC', 'NANOG', 'LIN28A'],
    readouts: [
      { id: 'pluripotency-markers', assay: 'NANOG / SSEA-4 immunostaining', measures: 'Acquisition of pluripotency markers', kind: 'direct' },
      { id: 'colony-formation', assay: 'iPSC colony formation', measures: 'Reprogramming efficiency', kind: 'direct' },
    ],
    honesty: 'exact',
    honestyNote:
      'Sufficiency for pluripotency induction is established and Nobel-recognised. Whether PARTIAL reprogramming rejuvenates tissue without loss of identity is an open research question, not a settled result — that claim needs evidence records, and this registry supplies none.',
  },
  {
    id: 'epigenetic-reprogramming',
    label: 'Epigenetic reprogramming',
    summary:
      'The epigenome — DNA methylation at CpG sites, histone modifications and chromatin architecture — changes with age in a partly reproducible way. Weighted panels of CpG methylation sites (“epigenetic clocks”, e.g. Horvath multi-tissue, Hannum, PhenoAge, GrimAge, DunedinPACE) estimate age from a methylation array. Reprogramming factors reset many of these marks.',
    molecules: ['DNMT1', 'DNMT3A', 'DNMT3B', 'TET1', 'TET2', 'TET3', 'EZH2'],
    readouts: [
      { id: 'meth-array', assay: 'DNA methylation array', measures: 'CpG-site methylation fraction', kind: 'direct' },
      { id: 'epigenetic-clock', assay: 'Epigenetic clock (predictor applied to array data)', measures: 'Model-estimated biological age', kind: 'proxy' },
    ],
    honesty: 'simplified',
    honestyNote:
      'Age-associated methylation change is well replicated. Clocks are STATISTICAL PREDICTORS, not measurements of ageing: a clock reading moving is not by itself proof that ageing changed. The platform treats every clock readout as a proxy and says so in the appraisal.',
  },
  {
    id: 'cellular-senescence',
    label: 'Cellular senescence',
    summary:
      'Senescence is a stable exit from the cell cycle in which the cell remains metabolically active and resists apoptosis. It is triggered by critically short telomeres (replicative), by oncogene activation (OIS), by genotoxic therapy, and by other stresses. Senescent cells accumulate in aged tissue. Senescence is also a tumour-suppressive and wound-healing programme, so it is not simply damage.',
    molecules: ['CDKN2A', 'CDKN1A', 'TP53', 'RB1', 'LMNB1', 'GLB1'],
    readouts: [
      { id: 'sa-bgal', assay: 'SA-β-galactosidase staining', measures: 'Lysosomal β-gal activity at pH 6.0', kind: 'proxy' },
      { id: 'p16-expr', assay: 'p16INK4a (CDKN2A) expression', measures: 'Cell-cycle inhibitor abundance', kind: 'proxy' },
      { id: 'laminb1-loss', assay: 'Lamin B1 immunoblot', measures: 'Loss of nuclear lamina component', kind: 'proxy' },
      { id: 'gh2ax', assay: 'γH2AX foci', measures: 'Persistent DNA damage response foci', kind: 'direct' },
    ],
    honesty: 'exact',
    honestyNote:
      'Senescence as a cell state is established. No single marker is specific: identification requires a PANEL. The appraisal engine flags evidence that rests on one marker alone.',
  },
  {
    id: 'sasp',
    label: 'SASP (senescence-associated secretory phenotype)',
    summary:
      'Many senescent cells secrete a programme of cytokines, chemokines, growth factors and proteases — including IL-6, IL-8/CXCL8, IL-1α/β, MMP-1/3 and GDF15 — driven largely by NF-κB, C/EBPβ and cGAS–STING signalling. The SASP remodels the surrounding tissue, recruits immune cells, and can induce senescence in neighbouring cells (paracrine spread). Its composition is heterogeneous and depends on cell type and trigger.',
    molecules: ['IL6', 'CXCL8', 'IL1A', 'IL1B', 'MMP1', 'MMP3', 'GDF15', 'CCL2', 'NFKB1', 'CEBPB', 'CGAS', 'STING1'],
    readouts: [
      { id: 'cytokine-panel', assay: 'Multiplex cytokine immunoassay', measures: 'Secreted factor concentrations in conditioned medium', kind: 'direct' },
      { id: 'sasp-transcriptome', assay: 'RNA-seq of secretome genes', measures: 'Transcript abundance of SASP programme', kind: 'proxy' },
    ],
    honesty: 'exact',
    honestyNote:
      'The secretory phenotype and its main regulators are established. Composition is HETEROGENEOUS — there is no single canonical SASP, so a panel measured in one cell type does not generalise. This entry makes no claim that lowering any specific cytokine is beneficial.',
  },
  {
    id: 'dna-repair',
    label: 'DNA damage and repair',
    summary:
      'Genomic integrity is maintained by distinct pathways: non-homologous end joining and homologous recombination for double-strand breaks, base- and nucleotide-excision repair for lesions, and mismatch repair for replication errors. Inherited defects produce segmental progeroid syndromes — WRN in Werner syndrome, LMNA (progerin) in Hutchinson–Gilford progeria, ERCC6/ERCC8 in Cockayne syndrome — which is the strongest human genetic link between repair capacity and accelerated ageing phenotypes.',
    molecules: ['ATM', 'ATR', 'TP53BP1', 'BRCA1', 'BRCA2', 'PARP1', 'WRN', 'LMNA', 'ERCC6', 'ERCC8'],
    readouts: [
      { id: 'comet', assay: 'Comet assay (single-cell gel electrophoresis)', measures: 'DNA strand breaks per cell', kind: 'direct' },
      { id: 'gh2ax-repair', assay: 'γH2AX focus resolution kinetics', measures: 'Rate of double-strand break repair', kind: 'direct' },
      { id: 'micronuclei', assay: 'Micronucleus assay', measures: 'Chromosomal instability events', kind: 'proxy' },
    ],
    honesty: 'exact',
    honestyNote:
      'Repair pathway biology and the progeroid syndromes are established. Progeroid syndromes are SEGMENTAL — they reproduce some features of ageing, not ageing itself, so extrapolating from them to normal ageing is an inference the platform labels as such.',
  },
  {
    id: 'stem-cell-rejuvenation',
    label: 'Stem-cell exhaustion and rejuvenation',
    summary:
      'Regenerative capacity declines with age across compartments: haematopoietic stem cells skew toward myeloid output and lose per-cell reconstitution capacity, skeletal-muscle satellite cells become depleted and less responsive to injury, and neural stem-cell activity falls. Heterochronic parabiosis and plasma-exchange experiments demonstrated that some of this decline responds to systemic environment, not only to cell-intrinsic damage.',
    molecules: ['CDKN2A', 'NOTCH1', 'TGFB1', 'GDF11', 'WNT3A', 'FOXO3'],
    readouts: [
      { id: 'clonogenic', assay: 'Colony-forming unit assay', measures: 'Clonogenic capacity per cell input', kind: 'direct' },
      { id: 'engraftment', assay: 'Competitive transplantation / engraftment', measures: 'Long-term repopulation capacity', kind: 'direct' },
      { id: 'lineage-output', assay: 'Flow-cytometric lineage output', measures: 'Myeloid:lymphoid ratio', kind: 'proxy' },
    ],
    honesty: 'simplified',
    honestyNote:
      'Age-associated decline in regenerative capacity is well documented across compartments. The systemic-factor literature (including GDF11) has a contested replication history — the registry names it as a molecule of interest, not as an established rejuvenation factor.',
  },
  {
    id: 'mitochondrial-dysfunction',
    label: 'Mitochondrial dysfunction',
    summary:
      'Aged tissue shows accumulated mitochondrial DNA mutations and deletions, reduced oxidative-phosphorylation capacity, altered mitochondrial dynamics, impaired mitophagy (PINK1/Parkin-dependent clearance of damaged organelles) and declining NAD+ availability. Mitochondrial dysfunction can itself trigger a distinct senescent state with an altered secretory profile.',
    molecules: ['PINK1', 'PRKN', 'MFN1', 'MFN2', 'OPA1', 'DNM1L', 'TFAM', 'NAMPT', 'SIRT1', 'SIRT3'],
    readouts: [
      { id: 'seahorse-ocr', assay: 'Extracellular flux (Seahorse) OCR', measures: 'Oxygen consumption rate, basal and maximal', kind: 'direct' },
      { id: 'membrane-potential', assay: 'TMRM / JC-1', measures: 'Mitochondrial membrane potential', kind: 'direct' },
      { id: 'mtdna-copy', assay: 'mtDNA copy number qPCR', measures: 'Mitochondrial genome copies per nuclear genome', kind: 'proxy' },
      { id: 'nad-ratio', assay: 'NAD+/NADH quantification', measures: 'Cellular redox cofactor pool', kind: 'direct' },
    ],
    honesty: 'exact',
    honestyNote:
      'The described changes are reproducibly observed. Whether mitochondrial dysfunction is a CAUSE or a CONSEQUENCE of ageing is not settled — the simple mitochondrial free-radical theory of ageing has not survived intact, and this registry does not assert causal direction.',
  },
  {
    id: 'autophagy',
    label: 'Autophagy and proteostasis',
    summary:
      'Autophagy delivers damaged proteins and organelles to the lysosome for degradation, via macroautophagy, chaperone-mediated autophagy and selective mitophagy. mTORC1 suppresses it under nutrient abundance; AMPK activates it under energy stress via ULK1. Autophagic capacity declines with age in several tissues, and loss-of-function of core ATG genes shortens lifespan in model organisms.',
    molecules: ['MTOR', 'PRKAA1', 'ULK1', 'ATG5', 'ATG7', 'BECN1', 'MAP1LC3B', 'SQSTM1', 'TFEB', 'LAMP2'],
    readouts: [
      { id: 'lc3-flux', assay: 'LC3-II/LC3-I immunoblot with lysosomal inhibitor', measures: 'Autophagic FLUX (not static level)', kind: 'direct' },
      { id: 'p62', assay: 'p62/SQSTM1 immunoblot', measures: 'Accumulation of autophagy substrate', kind: 'proxy' },
      { id: 'mitophagy-reporter', assay: 'mt-Keima / mito-QC reporter', measures: 'Delivery of mitochondria to lysosomes', kind: 'direct' },
    ],
    honesty: 'exact',
    honestyNote:
      'Pathway biology and its nutrient-sensing regulation are established. A static LC3-II level does NOT measure autophagy — only flux does. The appraisal engine downgrades evidence that reports a static level as if it were flux.',
  },
];

/**
 * Directed mechanistic links. Kept deliberately small: only relationships that
 * a cell-biology textbook states as mechanism. Anything an active debate would
 * touch is marked 'theoretical' and worded as a hypothesis.
 */
export const MECHANISTIC_EDGES: MechanisticEdge[] = [
  { from: 'telomere-attrition', to: 'cellular-senescence', effect: 'promotes', honesty: 'exact',
    mechanism: 'A critically short telomere is read as an unrepaired double-strand break and triggers p53-dependent replicative senescence.' },
  { from: 'telomerase', to: 'telomere-attrition', effect: 'counteracts', honesty: 'exact',
    mechanism: 'TERT/TERC add TTAGGG repeats to the 3′ end, offsetting replicative loss.' },
  { from: 'cellular-senescence', to: 'sasp', effect: 'promotes', honesty: 'exact',
    mechanism: 'The senescent state activates NF-κB and C/EBPβ programmes that drive secretion of cytokines and proteases.' },
  { from: 'sasp', to: 'cellular-senescence', effect: 'promotes', honesty: 'exact',
    mechanism: 'Secreted IL-1 and IL-6 family signalling induces senescence in neighbouring cells (paracrine spread).' },
  { from: 'dna-repair', to: 'cellular-senescence', effect: 'counteracts', honesty: 'exact',
    mechanism: 'Resolving double-strand breaks terminates the persistent damage response that would otherwise enforce arrest.' },
  { from: 'dna-repair', to: 'telomere-attrition', effect: 'counteracts', honesty: 'simplified',
    mechanism: 'Telomeric DNA is prone to oxidative lesions; repair capacity affects the rate of telomere loss beyond the end-replication problem.' },
  { from: 'mitochondrial-dysfunction', to: 'cellular-senescence', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Mitochondrial dysfunction can drive a senescent state (MiDAS) with an altered, IL-1-independent secretory profile.' },
  { from: 'autophagy', to: 'mitochondrial-dysfunction', effect: 'counteracts', honesty: 'exact',
    mechanism: 'PINK1/Parkin-dependent mitophagy removes depolarised mitochondria, limiting accumulation of damaged organelles.' },
  { from: 'yamanaka-factors', to: 'epigenetic-reprogramming', effect: 'promotes', honesty: 'exact',
    mechanism: 'OSKM expression remodels DNA methylation and chromatin toward an embryonic configuration.' },
  { from: 'epigenetic-reprogramming', to: 'cellular-senescence', effect: 'counteracts', honesty: 'theoretical',
    mechanism: 'HYPOTHESIS under active study: partial reprogramming may reverse senescence-associated epigenetic marks without erasing cell identity. Not established.' },
  { from: 'cellular-senescence', to: 'stem-cell-rejuvenation', effect: 'counteracts', honesty: 'simplified',
    mechanism: 'Senescent cells accumulating in a stem-cell niche reduce the pool of cells able to divide and regenerate.' },
  { from: 'sasp', to: 'stem-cell-rejuvenation', effect: 'counteracts', honesty: 'simplified',
    mechanism: 'Chronic inflammatory signalling in the niche impairs stem-cell function and biases lineage output.' },
  { from: 'autophagy', to: 'stem-cell-rejuvenation', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Autophagic clearance maintains the quiescent, low-damage state that stem cells require to retain regenerative capacity.' },
];

const BY_ID = new Map<HallmarkId, Hallmark>(HALLMARKS.map((h) => [h.id, h]));

export function getHallmark(id: HallmarkId): Hallmark | undefined {
  return BY_ID.get(id);
}

/**
 * Mechanisms reachable from `id` by following `promotes` edges, with the depth
 * at which each was first reached. Used to show what a mechanism propagates to.
 * Cycle-safe: the senescence↔SASP feedback loop is real and must not hang.
 */
export function propagationFrom(id: HallmarkId, maxDepth = 3): { id: HallmarkId; depth: number }[] {
  const seen = new Map<HallmarkId, number>([[id, 0]]);
  let frontier: HallmarkId[] = [id];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: HallmarkId[] = [];
    for (const cur of frontier) {
      for (const e of MECHANISTIC_EDGES) {
        if (e.from !== cur || e.effect !== 'promotes' || seen.has(e.to)) continue;
        seen.set(e.to, depth);
        next.push(e.to);
      }
    }
    frontier = next;
  }
  seen.delete(id);
  return [...seen.entries()].map(([hid, depth]) => ({ id: hid, depth })).sort((a, b) => a.depth - b.depth);
}
