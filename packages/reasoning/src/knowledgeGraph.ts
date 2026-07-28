import { HALLMARKS, MECHANISTIC_EDGES, type HallmarkId } from './hallmarks.ts';
import { INTERVENTIONS, type InterventionId } from './interventions.ts';
import type { HonestyLevel } from './types.ts';

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
}

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
export const ONCOGENIC_EDGES: GraphEdge[] = [
  {
    from: 'cellular-senescence', to: 'tp53-axis', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'Senescence is one of the terminal outcomes p53 enforces after damage. The arrest IS part of the tumour-suppressive response, not merely correlated with it.',
  },
  {
    from: 'cellular-senescence', to: 'rb-axis', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'Stable senescent arrest is maintained by p16INK4a–CDK4/6–RB signalling; p16 is a senescence marker and a tumour suppressor at the same time.',
  },
  {
    from: 'telomerase', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'TERT reactivation removes the replicative limit. Approximately 85–90% of human cancers do this; it is a canonical immortalisation step.',
  },
  {
    from: 'telomere-attrition', to: 'genomic-instability', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'Uncapped telomeres are processed as double-strand breaks, driving breakage–fusion–bridge cycles and chromosomal rearrangement.',
  },
  {
    from: 'yamanaka-factors', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'MYC is both a Yamanaka factor and one of the most frequently activated human oncogenes. This is why OSK (MYC omitted) is preferred in rejuvenation work.',
  },
  {
    from: 'dna-repair', to: 'genomic-instability', kind: 'oncogenic-coupling', effect: 'counteracts', honesty: 'exact',
    mechanism: 'Intact repair suppresses the mutation and rearrangement burden that enables transformation.',
  },
  {
    from: 'dna-repair', to: 'tumour-suppressor-loss', kind: 'oncogenic-coupling', effect: 'counteracts', honesty: 'exact',
    mechanism: 'Repair capacity protects the tumour-suppressor loci themselves from inactivating mutation.',
  },
  {
    from: 'sasp', to: 'immune-surveillance', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'exact',
    mechanism: 'SASP chemokines recruit immune cells that clear senescent and pre-malignant cells — the beneficial arm of an otherwise damaging secretome.',
  },
  {
    from: 'sasp', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'The same secretome can be pro-tumourigenic in a paracrine fashion, supplying growth factors and proteases that favour neighbouring transformed cells.',
  },
  {
    from: 'stem-cell-rejuvenation', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Restoring proliferative and self-renewal capacity restores the substrate that transformation requires; long-lived proliferative cells accumulate mutations.',
  },
  {
    from: 'autophagy', to: 'oncogene-activation', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Context-dependent: autophagy suppresses transformation early, but supports survival of established tumours under metabolic and therapeutic stress.',
  },
  {
    from: 'mitochondrial-dysfunction', to: 'genomic-instability', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'simplified',
    mechanism: 'Dysfunctional mitochondria raise reactive oxygen species, increasing oxidative lesion burden on nuclear DNA.',
  },
  {
    from: 'epigenetic-reprogramming', to: 'tumour-suppressor-loss', kind: 'oncogenic-coupling', effect: 'promotes', honesty: 'theoretical',
    mechanism: 'HYPOTHESIS: reprogramming remodels methylation genome-wide, which could in principle silence tumour-suppressor loci. Mechanistically plausible; not established.',
  },
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
export const BIOMARKER_EDGES: GraphEdge[] = [
  { from: 'epigenetic-clock', to: 'epigenetic-reprogramming', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Reads the methylation state the mechanism acts on — which also makes it circular as an endpoint for reprogramming interventions.' },
  { from: 'telomere-length', to: 'telomere-attrition', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'Direct measurement of the quantity the mechanism describes.' },
  { from: 'telomere-length', to: 'telomerase', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Indirect: length reflects the balance of attrition and extension, not telomerase activity itself. Use TRAP for activity.' },
  { from: 'p16-burden', to: 'cellular-senescence', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Proxy for senescent load; p16 also rises in non-senescent contexts, so a panel is required.' },
  { from: 'inflammatory-panel', to: 'sasp', kind: 'measures', effect: 'measures', honesty: 'simplified',
    mechanism: 'Circulating cytokines partly reflect SASP output, but the same analytes move with infection and adiposity.' },
  { from: 'nad-pool', to: 'mitochondrial-dysfunction', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'NAD+ availability constrains oxidative metabolism and sirtuin activity.' },
  { from: 'nad-pool', to: 'dna-repair', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'NAD+ is the required substrate for PARP-mediated repair signalling.' },
  { from: 'mitochondrial-capacity', to: 'mitochondrial-dysfunction', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'Direct functional readout of the mechanism.' },
  { from: 'autophagic-flux', to: 'autophagy', kind: 'measures', effect: 'measures', honesty: 'exact',
    mechanism: 'Direct measurement of pathway throughput.' },
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

export const GRAPH_NODES: GraphNode[] = [
  ...hallmarkNodes(),
  ...CANCER_NODES,
  ...BIOMARKER_NODES,
  ...interventionNodes(),
];

export const GRAPH_EDGES: GraphEdge[] = [
  ...MECHANISTIC_EDGES.map((e): GraphEdge => ({
    from: e.from, to: e.to, kind: 'mechanistic', effect: e.effect, mechanism: e.mechanism, honesty: e.honesty,
  })),
  ...ONCOGENIC_EDGES,
  ...BIOMARKER_EDGES,
  ...INTERVENTIONS.flatMap((i): GraphEdge[] => i.targets.map((t) => ({
    from: i.id, to: t, kind: 'targets', effect: 'targets',
    mechanism: `${i.label} is aimed at ${t}. This edge records intent, not demonstrated effect.`,
    honesty: i.honesty,
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
