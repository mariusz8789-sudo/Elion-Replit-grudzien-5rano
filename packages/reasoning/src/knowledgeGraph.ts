import { HALLMARKS, MECHANISTIC_EDGES, type HallmarkId } from './hallmarks.ts';
import { INTERVENTIONS, type InterventionId } from './interventions.ts';
import type { Citation, HonestyLevel } from './types.ts';

export type { Citation } from './types.ts';

/**
 * Longevity Discovery Platform — unified knowledge graph (layer 4 of 4).
 *
 * One typed graph over four node kinds, so that every downstream engine —
 * hypothesis generation, cancer safety, critic, experiment design, gap analysis —
 * reasons over the SAME structure rather than each holding its own private map.
 *
 *   hallmark        the ten ageing mechanisms (hallmarks.ts)
 *   cancer-pathway  the oncogenic axis every longevity strategy must clear
 *   biomarker       what can actually be measured in a subject
 *   intervention    strategies (interventions.ts)
 *
 * THE ONCOGENIC AXIS IS NOT AN AFTERTHOUGHT. Ageing and cancer share their
 * machinery: the programmes that stop a damaged cell dividing are the programmes
 * that suppress tumours, and the property that makes a cell immortal is the
 * property tumours acquire. A longevity platform that models ageing without
 * modelling that coupling is not merely incomplete — it is systematically
 * optimistic. Those edges are first-class here.
 *
 * Every edge carries `honesty` and a mechanism string. Nothing is asserted as
 * established that is not, and no edge encodes an efficacy claim.
 */

export type NodeKind = 'hallmark' | 'cancer-pathway' | 'biomarker' | 'intervention';

export type CancerNodeId =
  | 'tp53-axis'
  | 'rb-axis'
  | 'oncogene-activation'
  | 'tumour-suppressor-loss'
  | 'genomic-instability'
  | 'immune-surveillance';

export type BiomarkerId =
  | 'epigenetic-clock'
  | 'telomere-length'
  | 'p16-burden'
  | 'inflammatory-panel'
  | 'nad-pool'
  | 'mitochondrial-capacity'
  | 'autophagic-flux'
  | 'regenerative-capacity';

export type GraphNodeId = HallmarkId | CancerNodeId | BiomarkerId | InterventionId;

export interface GraphNode {
  id: GraphNodeId;
  kind: NodeKind;
  label: string;
  summary: string;
  /** Genes/proteins, where the node has a molecular definition. */
  molecules?: string[];
  honesty: HonestyLevel;
}

export type EdgeKind =
  /** A drives or opposes B mechanistically. */
  | 'mechanistic'
  /** An intervention is aimed at a mechanism. */
  | 'targets'
  /** A mechanism is coupled to an oncogenic axis — the safety-critical edges. */
  | 'oncogenic-coupling'
  /** A biomarker reads out a mechanism. */
  | 'measures';

export interface GraphEdge {
  from: GraphNodeId;
  to: GraphNodeId;
  kind: EdgeKind;
  effect: 'promotes' | 'counteracts' | 'measures' | 'targets';
  mechanism: string;
  honesty: HonestyLevel;
  /**
   * Literature this edge rests on. REQUIRED FIELD, empty array permitted — see
   * the note on `UNCITED_CLAIM_EDGES` below for why those are not the same
   * thing. `targets` edges are exempt (they record intent, not a finding).
   */
  citations: Citation[];
}

/* ------------------------------- citations ------------------------------- */

export interface CitationValidation {
  ok: boolean;
  errors: string[];
}

/** PubMed ids are positive integers with no leading zero; 8 digits today, room to grow. */
const PMID_PATTERN = /^[1-9]\d{0,8}$/;
/**
 * PubMed crossed eight digits around 1999, so anything published from 2000 on
 * has a PMID above this. Below it, with a 2000s year on the label, the number is
 * almost always a PMC id someone pasted after stripping the "PMC".
 *
 * This guard exists because it caught three real ones. A search assistant
 * proposed 5959857, 2737083 and 2922531 for papers dated 2018, 2009 and 2010.
 * All three are well-formed PMIDs and all three resolve — to a 1966 paper on
 * sampling microorganisms in the upper atmosphere, a 1989 study of cough
 * suppressants, and a 1989 French-language article. Format validation passes
 * every one of them. Only the year does not fit, and the year is free to check.
 */
const PMID_FLOOR_2000 = 10_000_000;
/** DOI: the "10." prefix, a registrant code, a slash, and a non-empty suffix. */
const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;
/**
 * The DOI range this repository uses for test fixtures. A fixture citation
 * reaching the shipped graph is the exact failure the fixture convention exists
 * to make impossible, so it is refused by name rather than merely discouraged.
 */
const FIXTURE_DOI_PREFIXES = ['10.1000/', '10.0000/'];

/**
 * Validates one citation. Fail-closed: an identifier that cannot be resolved is
 * refused outright rather than stored and hoped over.
 */
export function validateCitation(input: Partial<Citation> | null | undefined): CitationValidation {
  const errors: string[] = [];
  if (!input) return { ok: false, errors: ['A citation is required — an uncited edge is an assertion, not a claim.'] };

  const { pmid, doi, label } = input;
  if (!pmid && !doi) {
    errors.push('A citation needs a PMID or a DOI. A label alone is not resolvable, so it is not a citation.');
  }
  if (pmid !== undefined) {
    if (!PMID_PATTERN.test(pmid)) {
      errors.push(
        `"${pmid}" is not a PMID. Expected digits only (e.g. "23746838") — no "PMID:" prefix, no URL, no leading zero.`,
      );
    } else {
      const yearInLabel = /\b(19|20)\d{2}\b/.exec(label ?? '');
      const year = yearInLabel ? Number(yearInLabel[0]) : null;
      if (year !== null && year >= 2000 && Number(pmid) < PMID_FLOOR_2000) {
        errors.push(
          `"${pmid}" cannot be the PMID of a ${year} paper — PubMed passed ${PMID_FLOOR_2000} around 1999, so this is almost certainly a PMC id (PMC${pmid}) pasted into the wrong field. Drop the "PMC" prefix and you get a completely different, much older paper.`,
        );
      }
    }
  }
  if (doi !== undefined) {
    if (!DOI_PATTERN.test(doi)) {
      errors.push(`"${doi}" is not a DOI. Expected a bare DOI (e.g. "10.1016/j.cell.2013.05.039") — no "doi:" prefix, no https:// URL.`);
    } else if (FIXTURE_DOI_PREFIXES.some((p) => doi.startsWith(p))) {
      errors.push(`"${doi}" is a test-fixture DOI. Fixtures must never appear in the shipped graph.`);
    }
  }
  if (!label || !label.trim()) {
    errors.push('A human-readable label (first author and year) is required.');
  }
  if (input.checked !== 'cross-checked' && input.checked !== 'resolved') {
    errors.push('A citation must declare how far it has been checked: "cross-checked" or "resolved". Silence about provenance is the defect this field exists to prevent.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Edge kinds that assert something about the world and therefore need a source.
 *
 * `targets` is NOT among them, and that is a judgement worth stating. Those 30
 * edges are generated from `interventions.ts` and their own mechanism string says
 * they "record intent, not demonstrated effect" — that an intervention is AIMED at
 * a mechanism. There is no finding to cite. Demanding a citation there would
 * manufacture 30 fake requirements and teach whoever fills them in that the
 * requirement is a formality. The other three kinds each assert that something is
 * true of biology, and each needs a source.
 */
export const CLAIM_EDGE_KINDS: readonly EdgeKind[] = ['mechanistic', 'oncogenic-coupling', 'measures'];

/**
 * The authoring shape for a hand-curated edge: everything a `GraphEdge` has,
 * with `citations` optional. Adding an edge should not require typing
 * `citations: []` to say "none yet" — the composition below fills that in and
 * `auditCitations` counts it. The strictness lives in the audit, not in the
 * ceremony of declaring one.
 */
export type CuratedEdge = Omit<GraphEdge, 'citations'> & { citations?: Citation[] };

/** Fills in the empty-citation default, so an unsourced edge is recorded as unsourced. */
function curated(edges: CuratedEdge[]): GraphEdge[] {
  return edges.map((e) => ({ ...e, citations: e.citations ?? [] }));
}

export function isClaimEdge(edge: GraphEdge): boolean {
  return CLAIM_EDGE_KINDS.includes(edge.kind);
}

export interface CitationAudit {
  /** Claim edges carrying at least one valid citation. */
  cited: GraphEdge[];
  /** Claim edges asserting biology with nothing behind them. */
  uncited: GraphEdge[];
  /** Edges whose citations are present but malformed — worse than absent. */
  invalid: { edge: GraphEdge; errors: string[] }[];
  /** Edges exempt by kind, listed so the exemption stays visible. */
  exempt: GraphEdge[];
  /**
   * Citations carried by cited edges that no machine has resolved yet. A subset
   * of `cited`, counted separately because "we found this identifier" and "we
   * confirmed this identifier" are different claims and the graph must not
   * conflate them.
   */
  unresolved: { edge: GraphEdge; citation: Citation }[];
}

/**
 * What the shipped graph currently rests on. The point of this function is that
 * the answer is allowed to be bad, and is not allowed to be hidden.
 */
export function auditCitations(edges: GraphEdge[] = GRAPH_EDGES): CitationAudit {
  const audit: CitationAudit = { cited: [], uncited: [], invalid: [], exempt: [], unresolved: [] };
  for (const edge of edges) {
    if (!isClaimEdge(edge)) { audit.exempt.push(edge); continue; }
    const citations = edge.citations ?? [];
    if (citations.length === 0) { audit.uncited.push(edge); continue; }
    const errors = citations.flatMap((c) => validateCitation(c).errors);
    if (errors.length > 0) { audit.invalid.push({ edge, errors }); continue; }
    audit.cited.push(edge);
    for (const citation of citations) {
      if (citation.checked !== 'resolved') audit.unresolved.push({ edge, citation });
    }
  }
  return audit;
}

/**
 * RATCHET ONE. Claim edges asserted with no source at all.
 *
 * Each is a mechanism a human typed from memory. That is the largest gap between
 * what this platform claims to be and what it is, and a number in a document
 * would drift within a week — so it is pinned by a test instead
 * (`__tests__/citations.test.ts`).
 *
 * The test fails if this number goes UP, and fails if the constant is lowered
 * without the citations actually being added. The count moves one way, and only
 * by doing the work: find the paper, add the identifier, decrement.
 *
 * When this reaches 0, delete the constant and make a non-empty `citations` a
 * hard requirement instead. That deletion is the milestone.
 */
export const UNCITED_CLAIM_EDGES = 6;

/**
 * RATCHET TWO. Citations in the graph that no machine has resolved.
 *
 * These identifiers were read out of canonical URLs and independently
 * re-looked-up, which is strong — and is NOT the same as having fetched the
 * record. The environment the graph was curated in cannot reach Europe PMC,
 * NCBI, Crossref or any publisher, so resolution was impossible there and the
 * graph says so rather than implying a check that never happened.
 *
 * Run `npm run citations:verify` on a networked machine. For every citation it
 * confirms, change `checked: 'cross-checked'` to `'resolved'` and decrement this
 * by one. Like ratchet one, it can only fall, and only for real.
 *
 * A platform selling verifiability that could not say which of its own citations
 * had been verified would be selling the appearance of the thing.
 */
export const UNRESOLVED_CITATIONS = 30;

/* ------------------------------ cancer axis ------------------------------ */

export const CANCER_NODES: GraphNode[] = [
  {
    id: 'tp53-axis', kind: 'cancer-pathway', label: 'p53 axis', honesty: 'exact',
    molecules: ['TP53', 'MDM2', 'CDKN1A', 'ATM', 'ATR'],
    summary:
      'p53 is activated by DNA damage and oncogenic stress and enforces cell-cycle arrest, senescence or apoptosis via p21 (CDKN1A). It is the most frequently mutated gene in human cancer. Senescence is one of the outcomes p53 enforces, which is why suppressing senescence and suppressing a tumour barrier can be the same act.',
  },
  {
    id: 'rb-axis', kind: 'cancer-pathway', label: 'RB axis', honesty: 'exact',
    molecules: ['RB1', 'CDKN2A', 'CDK4', 'CDK6', 'CCND1', 'E2F1'],
    summary:
      'The RB protein restrains E2F-driven S-phase entry and is held active by p16INK4a (CDKN2A) inhibition of CDK4/6. This axis enforces the stable arrest that defines senescence. p16 is simultaneously the most cited senescence marker and a core tumour suppressor.',
  },
  {
    id: 'oncogene-activation', kind: 'cancer-pathway', label: 'Oncogene activation', honesty: 'exact',
    molecules: ['MYC', 'RAS', 'KRAS', 'BRAF', 'PIK3CA', 'TERT'],
    summary:
      'Gain-of-function alterations that drive proliferation independently of normal signals. MYC is directly relevant to longevity work because it is one of the four Yamanaka factors, and TERT because its reactivation is the immortalisation step in most human tumours.',
  },
  {
    id: 'tumour-suppressor-loss', kind: 'cancer-pathway', label: 'Tumour suppressor loss', honesty: 'exact',
    molecules: ['TP53', 'RB1', 'CDKN2A', 'PTEN', 'BRCA1', 'BRCA2'],
    summary:
      'Loss of the brakes on proliferation and genome maintenance. Several of these genes are the same ones that enforce senescence and repair, so interventions aimed at relieving age-associated arrest act on the tumour-suppressive machinery by construction.',
  },
  {
    id: 'genomic-instability', kind: 'cancer-pathway', label: 'Genomic instability', honesty: 'exact',
    molecules: ['ATM', 'ATR', 'BRCA1', 'BRCA2', 'MLH1', 'MSH2', 'TERF2'],
    summary:
      'Elevated mutation and chromosomal rearrangement rates from repair deficiency, replication stress or telomere dysfunction. It is both a hallmark of ageing and an enabling characteristic of cancer — the same phenomenon read by two literatures.',
  },
  {
    id: 'immune-surveillance', kind: 'cancer-pathway', label: 'Immune surveillance', honesty: 'exact',
    molecules: ['CD8A', 'NKG2D', 'KLRK1', 'IFNG', 'PDCD1', 'CD274'],
    summary:
      'Cytotoxic T and NK cells recognise and remove transformed and senescent cells. Capacity declines with age (immunosenescence). Anything that suppresses immune signalling to reduce inflammation also reduces the clearance arm that removes pre-malignant cells.',
  },
];

/**
 * Coupling between ageing mechanisms and the oncogenic axis. These are the edges
 * the Cancer Safety Engine walks. Each states the shared mechanism explicitly, so
 * a reader can check the reasoning rather than trust a risk label.
 */
const ONCOGENIC_EDGES_SOURCE: CuratedEdge[] = [
  {
    from: 'cellular-senescence', to: 'tp53-axis', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'Senescence is one of the terminal outcomes p53 enforces after damage. The arrest IS part of the tumour-suppressive response, not merely correlated with it.',
    citations: [{ doi: '10.1016/S0092-8674(00)81902-9', label: 'Serrano 1997', checked: 'cross-checked' }] },
  {
    from: 'cellular-senescence', to: 'rb-axis', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'Stable senescent arrest is maintained by p16INK4a–CDK4/6–RB signalling; p16 is a senescence marker and a tumour suppressor at the same time.',
    citations: [{ pmid: '12809602', label: 'Narita 2003', checked: 'cross-checked' }] },
  {
    from: 'telomerase', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'TERT reactivation removes the replicative limit. Approximately 85–90% of human cancers do this; it is a canonical immortalisation step.',
    citations: [{ pmid: '7605428', doi: '10.1126/science.7605428', label: 'Kim 1994', checked: 'cross-checked' }] },
  {
    from: 'telomere-attrition', to: 'genomic-instability', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'Uncapped telomeres are processed as double-strand breaks, driving breakage–fusion–bridge cycles and chromosomal rearrangement.',
    citations: [{ pmid: '10949306', doi: '10.1038/35020592', label: 'Artandi 2000', checked: 'cross-checked' }] },
  {
    from: 'yamanaka-factors', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'MYC is both a Yamanaka factor and one of the most frequently activated human oncogenes. This is why OSK (MYC omitted) is preferred in rejuvenation work.',
    citations: [{ pmid: '18059259', doi: '10.1038/nbt1374', label: 'Nakagawa 2008', checked: 'cross-checked' }] },
  {
    from: 'dna-repair', to: 'genomic-instability', kind: 'oncogenic-coupling', effect: 'counteracts', honesty: 'exact',
    mechanism: 'Intact repair suppresses the mutation and rearrangement burden that enables transformation.',
    citations: [{ pmid: '9872311', doi: '10.1038/25292', label: 'Lengauer 1998', checked: 'cross-checked' }] },
  {
    from: 'dna-repair', to: 'tumour-suppressor-loss', kind: 'oncogenic-coupling', effect: 'counteracts', honesty: 'exact',
    mechanism: 'Repair capacity protects the tumour-suppressor loci themselves from inactivating mutation.',
    citations: [{ pmid: '19847258', doi: '10.1038/nature08467', label: 'Jackson 2009', checked: 'cross-checked' }] },
  {
    from: 'sasp', to: 'immune-surveillance', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'SASP chemokines recruit immune cells that clear senescent and pre-malignant cells — the beneficial arm of an otherwise damaging secretome.',
    citations: [{ pmid: '22080947', doi: '10.1038/nature10599', label: 'Kang 2011', checked: 'cross-checked' }] },
  {
    from: 'sasp', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'The same secretome can be pro-tumourigenic in a paracrine fashion, supplying growth factors and proteases that favour neighbouring transformed cells.',
    citations: [{ doi: '10.1073/pnas.211053698', label: 'Krtolica 2001', checked: 'cross-checked' }] },
  {
    from: 'stem-cell-rejuvenation', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Restoring proliferative and self-renewal capacity restores the substrate that transformation requires; long-lived proliferative cells accumulate mutations.',
    citations: [{ pmid: '19092804', doi: '10.1038/nature07602', label: 'Barker 2009', checked: 'cross-checked' }] },
  {
    from: 'autophagy', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Context-dependent: autophagy suppresses transformation early, but supports survival of established tumours under metabolic and therapeutic stress.',
    citations: [{ pmid: '22534666', doi: '10.1038/nrc3262', label: 'White 2012', checked: 'cross-checked' }] },
  // DELIBERATELY UNCITED — the only oncogenic-coupling edge without a source.
  //
  // Searching for it returned real papers on mitochondrial ROS and genomic
  // instability, and none of them supports the claim AS WRITTEN. The closest,
  // PMID 27078622, works through nuclear retention of cyclin D1 after low-dose
  // irradiation: a different mechanism, in a different context, and not
  // "oxidative lesion burden on nuclear DNA".
  //
  // Attaching it would give this edge the appearance of a source while quietly
  // changing what the edge means, which is a worse failure than leaving it bare.
  // Either someone finds a paper testing this specific route, or the mechanism
  // text is rewritten to match the evidence that does exist.
  {
    from: 'mitochondrial-dysfunction', to: 'genomic-instability', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Dysfunctional mitochondria raise reactive oxygen species, increasing oxidative lesion burden on nuclear DNA.',
  },
  {
    from: 'epigenetic-reprogramming', to: 'tumour-suppressor-loss', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'theoretical',
    mechanism: 'HYPOTHESIS: reprogramming remodels methylation genome-wide, which could in principle silence tumour-suppressor loci. Mechanistically plausible; not established.',
    citations: [{ pmid: '24529372', doi: '10.1016/j.cell.2014.01.005', label: 'Ohnishi 2014', checked: 'cross-checked' }] },
];

/* ------------------------------- biomarkers ------------------------------- */

export const BIOMARKER_NODES: GraphNode[] = [
  { id: 'epigenetic-clock', kind: 'biomarker', label: 'Epigenetic clock', honesty: 'simplified',
    summary: 'A weighted predictor over CpG methylation (Horvath, Hannum, PhenoAge, GrimAge, DunedinPACE). A statistical estimate of age, not a measurement of ageing.' },
  { id: 'telomere-length', kind: 'biomarker', label: 'Telomere length', honesty: 'exact',
    summary: 'Mean or distributional telomere length by TRF, qPCR T/S or Flow-FISH. A robust population-level correlate and a weak individual-level predictor.' },
  { id: 'p16-burden', kind: 'biomarker', label: 'Senescent burden (p16INK4a)', honesty: 'simplified',
    summary: 'Tissue or circulating-cell p16INK4a expression as a proxy for senescent-cell load. No single marker is specific; a panel is required.' },
  { id: 'inflammatory-panel', kind: 'biomarker', label: 'Inflammatory panel', honesty: 'exact',
    summary: 'IL-6, CRP, TNF-α and related analytes. Elevated with age ("inflammageing") but non-specific — it moves with infection, adiposity and acute stress.' },
  { id: 'nad-pool', kind: 'biomarker', label: 'NAD+ pool', honesty: 'exact',
    summary: 'NAD+ and NAD+/NADH quantification. Blood metabolites are accessible; the tissue pool that matters mechanistically usually is not.' },
  { id: 'mitochondrial-capacity', kind: 'biomarker', label: 'Mitochondrial capacity', honesty: 'exact',
    summary: 'Respirometry (basal, maximal, spare capacity) and membrane potential. A direct functional readout rather than a correlate.' },
  { id: 'autophagic-flux', kind: 'biomarker', label: 'Autophagic flux', honesty: 'exact',
    summary: 'LC3 turnover measured with and without lysosomal inhibition. A static LC3-II level is NOT this and cannot substitute for it.' },
  { id: 'regenerative-capacity', kind: 'biomarker', label: 'Regenerative capacity', honesty: 'simplified',
    summary: 'Clonogenic, engraftment or injury-response assays. Functionally meaningful, but assay-specific and hard to standardise across labs.' },
];

/** Which mechanism each biomarker reads out, and whether it does so directly. */
const BIOMARKER_EDGES_SOURCE: CuratedEdge[] = [
  { from: 'epigenetic-clock', to: 'epigenetic-reprogramming', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Reads the methylation state the mechanism acts on — which also makes it circular as an endpoint for reprogramming interventions.',
    citations: [{ pmid: '24138928', doi: '10.1186/gb-2013-14-10-r115', label: 'Horvath 2013', checked: 'cross-checked' }] },
  { from: 'telomere-length', to: 'telomere-attrition', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'Direct measurement of the quantity the mechanism describes.',
    citations: [{ doi: '10.1093/nar/30.10.e47', label: 'Cawthon 2002', checked: 'cross-checked' }] },
  // UNCITED. This edge asserts a LIMITATION — that length is a poor proxy for
  // telomerase activity. The right source shows the dissociation; searches
  // returned papers praising each assay instead. A paper about the method is not
  // a paper about the method's failure mode.
  { from: 'telomere-length', to: 'telomerase', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Indirect: length reflects the balance of attrition and extension, not telomerase activity itself. Use TRAP for activity.' },
  { from: 'p16-burden', to: 'cellular-senescence', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Proxy for senescent load; p16 also rises in non-senescent contexts, so a panel is required.',
    citations: [{ pmid: '28650766', doi: '10.1080/15384101.2017.1339850', label: 'Frescas 2017', checked: 'cross-checked' }] },
  // UNCITED. Needs a source for the CONFOUND — IL-6 and TNF-alpha moving with
  // infection and adiposity independently of senescent burden. Searches returned
  // papers proposing SASP panels, which is the opposite claim.
  { from: 'inflammatory-panel', to: 'sasp', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Circulating cytokines partly reflect SASP output, but the same analytes move with infection and adiposity.' },
  { from: 'nad-pool', to: 'mitochondrial-dysfunction', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'NAD+ availability constrains oxidative metabolism and sirtuin activity.',
    citations: [{ pmid: '26118927', doi: '10.1016/j.cmet.2015.05.023', label: 'Cantó 2015', checked: 'cross-checked' }] },
  // UNCITED. The PARP/NAD+ biochemistry is well documented, but this edge is
  // about NAD+ as a READOUT of repair activity, which is a different and weaker
  // claim. No paper found that supports the measurement direction.
  { from: 'nad-pool', to: 'dna-repair', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'NAD+ is the required substrate for PARP-mediated repair signalling.' },
  // UNCITED. "Mitochondrial capacity" covers several assays (respirometry,
  // membrane potential, ATP flux) and no single paper establishes it as a direct
  // readout of dysfunction. Either the edge names a specific assay, or it needs a
  // methods review that says so explicitly.
  { from: 'mitochondrial-capacity', to: 'mitochondrial-dysfunction', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'Direct functional readout of the mechanism.' },
  { from: 'autophagic-flux', to: 'autophagy', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'Direct measurement of pathway throughput.',
    citations: [{ pmid: '33634751', doi: '10.1080/15548627.2020.1797280', label: 'Klionsky 2021', checked: 'cross-checked' }] },
  // UNCITED. The edge concedes its own weakness ("assay-dependent"). A citation
  // must support that concession, not a single transplantation protocol. Not found.
  { from: 'regenerative-capacity', to: 'stem-cell-rejuvenation', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Functional readout of the compartment, though assay-dependent.' },
];

/* --------------------------- assembled graph --------------------------- */

function hallmarkNodes(): GraphNode[] {
  return HALLMARKS.map((h) => ({
    id: h.id, kind: 'hallmark' as const, label: h.label, summary: h.summary,
    molecules: h.molecules, honesty: h.honesty,
  }));
}

function interventionNodes(): GraphNode[] {
  return INTERVENTIONS.map((i) => ({
    id: i.id, kind: 'intervention' as const, label: i.label, summary: i.description, honesty: i.honesty,
  }));
}

/**
 * The curated edges, with the empty-citation default applied. Consumers see a
 * `GraphEdge` with a `citations` array; authors above write the array without it.
 */
export const ONCOGENIC_EDGES: GraphEdge[] = curated(ONCOGENIC_EDGES_SOURCE);
export const BIOMARKER_EDGES: GraphEdge[] = curated(BIOMARKER_EDGES_SOURCE);

export const GRAPH_NODES: GraphNode[] = [
  ...hallmarkNodes(),
  ...CANCER_NODES,
  ...BIOMARKER_NODES,
  ...interventionNodes(),
];

export const GRAPH_EDGES: GraphEdge[] = [
  ...MECHANISTIC_EDGES.map((e): GraphEdge => ({
    from: e.from, to: e.to, kind: 'mechanistic', effect: e.effect, mechanism: e.mechanism, honesty: e.honesty,
    citations: e.citations ?? [],
  })),
  ...ONCOGENIC_EDGES,
  ...BIOMARKER_EDGES,
  // `targets` edges are generated from the intervention registry and record
  // intent rather than a finding, so they carry no citations by construction and
  // are exempt from the audit — see CLAIM_EDGE_KINDS.
  ...INTERVENTIONS.flatMap((i): GraphEdge[] => i.targets.map((t) => ({
    from: i.id, to: t, kind: 'targets', effect: 'targets',
    mechanism: `${i.label} is aimed at ${t}. This edge records intent, not demonstrated effect.`,
    honesty: i.honesty,
    citations: [],
  }))),
];

const NODE_BY_ID = new Map<GraphNodeId, GraphNode>(GRAPH_NODES.map((n) => [n.id, n]));

export function getNode(id: GraphNodeId): GraphNode | undefined {
  return NODE_BY_ID.get(id);
}

export function nodesOfKind(kind: NodeKind): GraphNode[] {
  return GRAPH_NODES.filter((n) => n.kind === kind);
}

export function edgesFrom(id: GraphNodeId, kind?: EdgeKind): GraphEdge[] {
  return GRAPH_EDGES.filter((e) => e.from === id && (!kind || e.kind === kind));
}

export function edgesTo(id: GraphNodeId, kind?: EdgeKind): GraphEdge[] {
  return GRAPH_EDGES.filter((e) => e.to === id && (!kind || e.kind === kind));
}

/** Every edge touching a node, in either direction — the neighbourhood view the UI renders. */
export function neighbourhood(id: GraphNodeId): { incoming: GraphEdge[]; outgoing: GraphEdge[] } {
  return { incoming: edgesTo(id), outgoing: edgesFrom(id) };
}

/**
 * Shortest directed path between two nodes, ignoring edge sign. Used by the
 * hypothesis engine to explain WHY two nodes might be connected, and by the
 * critic to find alternative routes that could explain an observation.
 * Breadth-first, so the returned path is minimal in hop count.
 */
export function findPath(from: GraphNodeId, to: GraphNodeId, maxHops = 4): GraphEdge[] | null {
  if (from === to) return [];
  const queue: { node: GraphNodeId; path: GraphEdge[] }[] = [{ node: from, path: [] }];
  const seen = new Set<GraphNodeId>([from]);
  while (queue.length) {
    const { node, path } = queue.shift()!;
    if (path.length >= maxHops) continue;
    for (const e of edgesFrom(node)) {
      if (seen.has(e.to)) continue;
      const next = [...path, e];
      if (e.to === to) return next;
      seen.add(e.to);
      queue.push({ node: e.to, path: next });
    }
  }
  return null;
}

/** Structural integrity — every edge endpoint must resolve to a declared node. */
export function danglingEdges(): GraphEdge[] {
  return GRAPH_EDGES.filter((e) => !NODE_BY_ID.has(e.from) || !NODE_BY_ID.has(e.to));
}
