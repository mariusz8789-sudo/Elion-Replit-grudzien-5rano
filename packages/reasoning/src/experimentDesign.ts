import { getHallmark, type HallmarkId, type Readout } from './hallmarks.ts';
import { getIntervention, type InterventionId } from './interventions.ts';
import { analyseCancerSafety } from './cancerSafety.ts';
import type { EvidenceTier } from './evidence.ts';
import { critique } from './critic.ts';
import type { Hypothesis } from './discovery.ts';

/**
 * Longevity Discovery Platform — Experiment Designer.
 *
 * Generates a complete experimental plan for a hypothesis: systems, controls,
 * endpoints, discriminating predictions and failure modes.
 *
 * WHY THIS IS HONESTLY GENERATABLE. Everything here is METHODOLOGY, not results.
 * Which control a senescence experiment needs, which endpoint measures autophagic
 * flux rather than autophagosome count, why an LC3 blot without a lysosomal
 * inhibitor cannot answer the question — these are facts about experimental
 * design, and stating them fabricates nothing.
 *
 * "Expected outcomes" are DISCRIMINATING PREDICTIONS, not forecasts: what the
 * hypothesis predicts versus what the null predicts, so that the experiment can
 * distinguish them. A plan whose predicted outcomes are identical under both is
 * a plan that cannot learn anything, and the designer flags exactly that.
 */

export interface ModelSystem {
  tier: EvidenceTier;
  name: string;
  rationale: string;
  /** What this system structurally cannot answer. */
  limitation: string;
}

export interface ExperimentalControl {
  kind: 'vehicle' | 'positive' | 'negative' | 'mediation' | 'age-matched' | 'allocation';
  description: string;
  /** The specific artefact this control rules out. */
  guardsAgainst: string;
}

export interface Endpoint {
  assay: string;
  measures: string;
  kind: 'direct' | 'proxy';
  role: 'primary' | 'secondary' | 'safety';
  /** Method caveat that would invalidate the reading if ignored. */
  caveat?: string;
}

export interface FailureMode {
  description: string;
  likelihood: 'common' | 'plausible' | 'uncommon';
  mitigation: string;
}

export interface ExperimentPlan {
  hypothesisId: string;
  title: string;
  question: string;
  cellModels: ModelSystem[];
  animalModels: ModelSystem[];
  controls: ExperimentalControl[];
  endpoints: Endpoint[];
  /** What the hypothesis predicts vs what the null predicts — must differ. */
  discriminatingPredictions: { underHypothesis: string; underNull: string }[];
  failureModes: FailureMode[];
  /** Statistical and design notes derived from the plan, not from a power calculation. */
  designNotes: string[];
  /** True when the predictions do not actually distinguish the hypotheses. */
  isUninformative: boolean;
}

/** Standard cell systems per mechanism. Named models in routine laboratory use. */
const CELL_MODELS: Partial<Record<HallmarkId, ModelSystem[]>> = {
  'telomere-attrition': [
    { tier: 'in-vitro-human', name: 'Human diploid fibroblasts (IMR-90, WI-38) under serial passage', rationale: 'The system in which the Hayflick limit was defined; telomere shortening is measurable across passages.', limitation: 'Culture stress accelerates shortening relative to tissue in vivo, so absolute rates do not transfer.' },
  ],
  telomerase: [
    { tier: 'in-vitro-human', name: 'Primary fibroblasts ± hTERT, with TRAP readout', rationale: 'Isogenic pair differing only in telomerase activity isolates the variable of interest.', limitation: 'Immortalised comparators diverge from the parental line over passage, confounding long experiments.' },
  ],
  'yamanaka-factors': [
    { tier: 'in-vitro-human', name: 'Human dermal fibroblasts with inducible OSK', rationale: 'Doxycycline-inducible expression allows the transient, dose-controlled exposure partial reprogramming requires.', limitation: 'Reprogramming efficiency is highly donor- and passage-dependent; cross-experiment comparison needs the same donor line.' },
  ],
  'epigenetic-reprogramming': [
    { tier: 'in-vitro-human', name: 'Donor-matched fibroblasts with methylation array profiling', rationale: 'Donor matching removes the largest source of inter-individual methylation variance.', limitation: 'Clocks were trained on tissue cohorts, not culture; applying them to cultured cells is off-label for the predictor.' },
  ],
  'cellular-senescence': [
    { tier: 'in-vitro-human', name: 'IMR-90 with irradiation- or oncogene-induced senescence', rationale: 'Produces a defined, synchronous senescent population rather than a mixed culture.', limitation: 'Induced senescence differs in secretome from the replicative senescence that accumulates with age.' },
  ],
  sasp: [
    { tier: 'in-vitro-human', name: 'Conditioned medium from senescent IMR-90 onto naive reporter cells', rationale: 'Separates paracrine SASP effects from cell-autonomous ones.', limitation: 'Conditioned medium concentrates factors non-physiologically and omits immune clearance entirely.' },
  ],
  'dna-repair': [
    { tier: 'in-vitro-human', name: 'Patient-derived progeroid fibroblasts (WRN-, LMNA-mutant) against matched controls', rationale: 'A human genetic system in which repair capacity is the manipulated variable.', limitation: 'Progeroid syndromes are segmental — they model a subset of ageing features, not ageing.' },
  ],
  'stem-cell-rejuvenation': [
    { tier: 'in-vitro-human', name: 'Primary haematopoietic or satellite cells with clonogenic assay', rationale: 'Directly measures regenerative capacity rather than a correlate of it.', limitation: 'Isolation itself activates quiescent cells, altering the property being measured.' },
  ],
  'mitochondrial-dysfunction': [
    { tier: 'in-vitro-human', name: 'Primary myotubes or fibroblasts with extracellular-flux respirometry', rationale: 'Gives basal, maximal and spare respiratory capacity as separate quantities.', limitation: 'Respirometry measures capacity under forced conditions, not in-vivo utilisation.' },
  ],
  autophagy: [
    { tier: 'in-vitro-human', name: 'GFP-LC3-RFP or mt-Keima reporter lines', rationale: 'Reporter lines measure flux and mitophagy rather than static autophagosome counts.', limitation: 'Reporter overexpression can itself perturb the pathway under study.' },
  ],
};

const ANIMAL_MODELS: ModelSystem[] = [
  { tier: 'invertebrate', name: 'C. elegans lifespan cohorts', rationale: 'Short lifespan and large n make survival curves cheap and statistically clean.', limitation: 'Post-mitotic soma and no adaptive immunity — several mammalian ageing mechanisms have no counterpart.' },
  { tier: 'invertebrate', name: 'Drosophila melanogaster lifespan cohorts', rationale: 'Adds a tissue-renewing gut compartment that C. elegans lacks.', limitation: 'Diet composition dominates fly lifespan and confounds intervention effects unless tightly controlled.' },
  { tier: 'rodent', name: 'Aged C57BL/6 cohorts with survival and frailty endpoints', rationale: 'Mammalian physiology with lifespan and healthspan endpoints measurable in the same animals.', limitation: 'Single inbred background; effects frequently fail to replicate across strains and across sexes.' },
  { tier: 'rodent', name: 'Progeroid models (Ercc1-deficient, LmnaG609G)', rationale: 'Compresses the experimental timeline from years to months.', limitation: 'Accelerated phenotype is segmental — a result here does not establish an effect on normal ageing.' },
  { tier: 'non-human-primate', name: 'Rhesus macaque cohort', rationale: 'Closest available physiology and immune architecture.', limitation: 'Small n, decade-scale duration, and essentially never independently replicated.' },
];

function endpointsFor(hallmarkId: HallmarkId, role: Endpoint['role']): Endpoint[] {
  const hallmark = getHallmark(hallmarkId);
  if (!hallmark) return [];
  return hallmark.readouts.map((r: Readout) => ({
    assay: r.assay,
    measures: r.measures,
    kind: r.kind,
    role,
    caveat: r.kind === 'proxy'
      ? 'Proxy readout: can move for reasons unrelated to the mechanism, so it cannot carry a primary endpoint alone.'
      : undefined,
  }));
}

/**
 * Build a full plan for a hypothesis. Every element is derived from the graph and
 * the registries — the endpoints come from the mechanism's own declared readouts,
 * the failure modes from its declared caveats and from the critic's challenges.
 */
export function designExperiment(h: Hypothesis): ExperimentPlan {
  const hallmarkNodes = h.nodes.filter((n): n is HallmarkId => getHallmark(n as HallmarkId) !== undefined);
  const interventionNodes = h.nodes.filter((n) => getIntervention(n as InterventionId) !== undefined) as InterventionId[];

  const primaryHallmark = hallmarkNodes[hallmarkNodes.length - 1];
  const mediator = hallmarkNodes.length >= 2 ? hallmarkNodes[0] : undefined;

  const cellModels = hallmarkNodes.flatMap((id) => CELL_MODELS[id] ?? []);
  const animalModels = ANIMAL_MODELS.filter((m) => m.tier === 'invertebrate' || m.tier === 'rodent');

  const controls: ExperimentalControl[] = [
    { kind: 'vehicle', description: 'Vehicle-only arm processed identically and in parallel.', guardsAgainst: 'Attributing handling, solvent or timing effects to the intervention.' },
    { kind: 'allocation', description: 'Randomised allocation with outcome assessment blind to group.', guardsAgainst: 'Selection and measurement bias — the two largest inflators of effect size in preclinical work.' },
    { kind: 'age-matched', description: 'Young and old untreated arms establishing the ageing baseline in the same experiment.', guardsAgainst: 'Interpreting a change as rejuvenation without knowing the size of the age difference being reversed.' },
  ];
  if (mediator) {
    controls.push({
      kind: 'mediation',
      description: `An arm in which ${getHallmark(mediator)?.label ?? mediator} is blocked while the intervention is applied.`,
      guardsAgainst: 'Attributing the effect to the proposed mediator when an alternative route carries it. This is the control the critic identified as decisive.',
    });
  }
  if (interventionNodes.length > 0) {
    controls.push({
      kind: 'negative',
      description: 'An inactive analogue or catalytically dead construct at matched exposure.',
      guardsAgainst: 'Off-target and delivery-vehicle effects being read as on-target activity.',
    });
  }

  const endpoints: Endpoint[] = [
    ...(primaryHallmark ? endpointsFor(primaryHallmark, 'primary') : []),
    ...(mediator && mediator !== primaryHallmark ? endpointsFor(mediator, 'secondary') : []),
  ];

  // Safety endpoints are added automatically wherever the graph documents an
  // oncogenic route — the researcher does not have to remember to ask.
  for (const id of interventionNodes) {
    const safety = analyseCancerSafety(id);
    if (!safety || safety.risks.length === 0) continue;
    endpoints.push({
      assay: 'Tumour incidence and clonal expansion surveillance',
      measures: `Oncogenic outcome on ${[...new Set(safety.risks.map((r) => r.axisLabel))].join(', ')}`,
      kind: 'direct', role: 'safety',
      caveat: 'Requires a horizon long enough for tumours to appear; a short efficacy study cannot deliver this endpoint.',
    });
  }

  const primaryIsProxyOnly = endpoints.filter((e) => e.role === 'primary').every((e) => e.kind === 'proxy');
  const discriminatingPredictions = buildPredictions(h, primaryHallmark, mediator);
  const isUninformative = discriminatingPredictions.length === 0
    || discriminatingPredictions.every((p) => p.underHypothesis === p.underNull);

  const failureModes = buildFailureModes(h, primaryIsProxyOnly, endpoints);

  const designNotes: string[] = [
    'Effect sizes are not predicted here, so this plan cannot substitute for a power calculation; run one from pilot variance before committing the cohort.',
    'Pre-register the primary endpoint and the analysis before data collection — the rubric in evidence.ts scores preregistration, and unregistered analyses are discounted.',
  ];
  if (primaryIsProxyOnly) {
    designNotes.push('Every available primary readout for this mechanism is a proxy. Add an independent functional endpoint or the result will grade poorly however it turns out.');
  }
  if (animalModels.length && cellModels.length) {
    designNotes.push('Run the cell system first: it is cheaper and, if the mediation control fails there, the animal cohort is not worth funding.');
  }

  return {
    hypothesisId: h.id,
    title: `Experimental plan — ${h.kind.replace(/-/g, ' ')}`,
    question: h.statement,
    cellModels, animalModels, controls, endpoints,
    discriminatingPredictions, failureModes, designNotes, isUninformative,
  };
}

function buildPredictions(h: Hypothesis, primary?: HallmarkId, mediator?: HallmarkId): ExperimentPlan['discriminatingPredictions'] {
  const out: ExperimentPlan['discriminatingPredictions'] = [];
  const primaryLabel = primary ? (getHallmark(primary)?.label ?? primary) : 'the primary endpoint';
  const mediatorLabel = mediator ? (getHallmark(mediator)?.label ?? mediator) : null;

  if (h.kind === 'indirect-path' && mediatorLabel) {
    out.push({
      underHypothesis: `${primaryLabel} moves in the predicted direction, AND the effect is abolished when ${mediatorLabel} is blocked.`,
      underNull: `Either ${primaryLabel} does not move, or it moves equally with ${mediatorLabel} blocked — which would place the effect on another route.`,
    });
  }
  if (h.kind === 'safety-offset') {
    out.push({
      underHypothesis: 'The combination arm shows a smaller oncogenic signal than the single riskier strategy, at comparable efficacy.',
      underNull: 'The combination shows the same or a larger oncogenic signal, indicating the offsetting directions differ too much in magnitude to cancel.',
    });
  }
  if (h.kind === 'loop-interruption') {
    out.push({
      underHypothesis: 'Loop output falls non-linearly with the size of the perturbation, and the time course shows the delay an amplifying loop predicts.',
      underNull: 'Loop output falls in proportion to the perturbation, which is what a simple linear chain would produce — no loop amplification needed to explain it.',
    });
  }
  if (h.kind === 'conflict-resolution') {
    out.push({
      underHypothesis: 'The direction of effect flips across the tested contexts, identifying which variable selects between the two documented routes.',
      underNull: 'The direction is the same in every context, meaning the conflict in the literature comes from methodology rather than from biology.',
    });
  }
  if (h.kind === 'unaddressed-coupling') {
    out.push({
      underHypothesis: 'Targeting both mechanisms produces an effect larger than either alone at matched total exposure.',
      underNull: 'Dual targeting matches the better single arm, indicating the coupling already propagates the effect without a second intervention.',
    });
  }
  if (h.kind === 'missing-measurement') {
    out.push({
      underHypothesis: 'The candidate assay responds reproducibly to a known perturbation and shows acceptable test–retest reliability.',
      underNull: 'The assay does not track the known perturbation, or its retest variance exceeds the effect it would need to detect.',
    });
  }
  return out;
}

function buildFailureModes(h: Hypothesis, primaryIsProxyOnly: boolean, endpoints: Endpoint[]): FailureMode[] {
  const modes: FailureMode[] = [
    { description: 'Underpowered for the true effect size, producing a null that is mistaken for evidence of absence.', likelihood: 'common', mitigation: 'Pilot for variance, then power the study; report confidence intervals rather than only p-values.' },
    { description: 'Batch, cage or litter effects confounded with treatment group.', likelihood: 'common', mitigation: 'Randomise across batches and cages, and include batch as a term in the analysis.' },
    { description: 'Survivorship bias: the frailest animals or cells drop out and the survivors look improved.', likelihood: 'plausible', mitigation: 'Analyse by intention-to-treat over the full cohort and report attrition per arm.' },
  ];

  if (primaryIsProxyOnly) {
    modes.push({
      description: 'The primary readout is a proxy and moves for a reason unrelated to the mechanism, producing a confident but wrong positive.',
      likelihood: 'common',
      mitigation: 'Pair the proxy with a direct functional endpoint; require both to move before calling the result positive.',
    });
  }
  if (endpoints.some((e) => e.assay.includes('LC3'))) {
    modes.push({
      description: 'LC3-II measured without a lysosomal inhibitor. A raised level is equally consistent with more autophagy and with blocked degradation — opposite conclusions from the same blot.',
      likelihood: 'common',
      mitigation: 'Always run the flux comparison with and without the inhibitor; never report a static LC3-II level as autophagy.',
    });
  }
  if (endpoints.some((e) => e.assay.toLowerCase().includes('β-gal') || e.assay.includes('p16'))) {
    modes.push({
      description: 'Senescence identified by a single marker. No marker is specific, and both SA-β-gal and p16 rise in non-senescent contexts.',
      likelihood: 'common',
      mitigation: 'Require a panel — arrest, marker expression, lamin B1 loss and secretome — before classifying a cell as senescent.',
    });
  }

  // Fold the critic's challenges in, so the plan carries the objections with it.
  for (const c of critique(h).challenges) {
    modes.push({
      description: c.statement,
      likelihood: c.severity === 'fatal-if-true' ? 'plausible' : 'uncommon',
      mitigation: c.discriminatingTest,
    });
  }
  return modes;
}
