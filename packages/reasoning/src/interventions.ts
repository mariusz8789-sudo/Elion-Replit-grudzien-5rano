import type { HallmarkId } from './hallmarks.ts';
import type { HonestyLevel } from './types.ts';

/**
 * Longevity Discovery Platform — intervention strategy registry (layer 3 of 4).
 *
 * A DELIBERATE STRUCTURAL CHOICE: this type has no dose field, no schedule field
 * and no route-of-administration field, and it never will. Medical advice is
 * therefore not merely discouraged here — it is unrepresentable. There is nowhere
 * to put it. The registry describes RESEARCH STRATEGIES and the mechanistic
 * reasoning behind them, at the level of a review article's introduction.
 *
 * The registry also ships ZERO efficacy data. `rationale` explains why a
 * researcher would investigate a strategy; it is explicitly not evidence that the
 * strategy works. Efficacy enters only as EvidenceRecords with citations, entered
 * by a scientist (evidence.ts), and is appraised in appraisal.ts.
 *
 * `tensions` is the part that earns the platform its keep. Every strategy here
 * has a documented mechanistic reason it might do harm, and those reasons are
 * shipped alongside the rationale rather than left for the reader to remember.
 * A platform that lists only reasons to hope is a marketing brochure.
 */

export type InterventionId =
  | 'telomerase-activation'
  | 'partial-reprogramming'
  | 'senolytics'
  | 'senomorphics'
  | 'autophagy-induction'
  | 'mtor-inhibition'
  | 'nad-restoration'
  | 'mitophagy-enhancement'
  | 'dna-repair-support'
  | 'stem-cell-therapy'
  | 'systemic-factor-modulation';

/**
 * How far a strategy has travelled toward the clinic. This is a statement about
 * the STATE OF STUDY, not about whether it works — 'clinical-trials' means trials
 * exist, not that they succeeded.
 */
export type ClinicalStatus = 'preclinical' | 'early-clinical' | 'clinical-trials';

/** A documented mechanistic reason a strategy could cause harm. */
export interface MechanisticTension {
  id: string;
  label: string;
  /** The mechanism by which the benefit and the harm share a cause. */
  mechanism: string;
  severity: 'theoretical' | 'documented-preclinical' | 'documented-clinical';
  /** What measurement would tell you whether this tension is being realised. */
  monitoredBy: string;
}

export interface Intervention {
  id: InterventionId;
  label: string;
  /** What the strategy does, mechanistically. No efficacy claim. */
  description: string;
  /** Mechanisms the strategy is aimed at. */
  targets: HallmarkId[];
  /** Why a researcher would try this. Reasoning, NOT evidence. */
  rationale: string;
  /** Agents or modalities studied in the literature. Named for orientation only — never dosed, never recommended. */
  studiedModalities: string[];
  clinicalStatus: ClinicalStatus;
  tensions: MechanisticTension[];
  honesty: HonestyLevel;
  honestyNote: string;
}

export const INTERVENTIONS: Intervention[] = [
  {
    id: 'telomerase-activation',
    label: 'Telomerase activation',
    description:
      'Restoring or increasing telomerase activity in somatic cells, either by delivering TERT or by upregulating endogenous expression, so that telomeres are extended rather than progressively lost.',
    targets: ['telomerase', 'telomere-attrition', 'cellular-senescence'],
    rationale:
      'If critically short telomeres trigger replicative senescence, then preventing that shortening should postpone the trigger. The mechanism is well characterised and the causal chain is short.',
    studiedModalities: ['TERT gene delivery (viral vectors)', 'small-molecule TERT transcriptional activators'],
    clinicalStatus: 'preclinical',
    tensions: [
      {
        id: 'telomerase-oncogenesis',
        label: 'Oncogenic risk shares the mechanism with the benefit',
        mechanism:
          'Roughly 85–90% of human cancers reactivate telomerase; unlimited replicative capacity is precisely what allows a transformed clone to become a tumour. The property being restored therapeutically is the property tumours acquire.',
        severity: 'documented-clinical',
        monitoredBy: 'Tumour incidence and clonal expansion surveillance; this cannot be assessed by telomere length alone.',
      },
    ],
    honesty: 'exact',
    honestyNote:
      'The mechanism is established; the therapeutic proposition is not. No human evidence of lifespan or healthspan benefit is asserted here, and the oncogenic tension is not hypothetical.',
  },
  {
    id: 'partial-reprogramming',
    label: 'Partial epigenetic reprogramming',
    description:
      'Transient or cyclic expression of reprogramming factors — usually OSK, omitting MYC — intended to reset age-associated epigenetic marks without carrying the cell all the way to pluripotency.',
    targets: ['yamanaka-factors', 'epigenetic-reprogramming', 'cellular-senescence', 'stem-cell-rejuvenation'],
    rationale:
      'Full reprogramming demonstrably resets epigenetic age in vitro. If the reset can be stopped partway, age-associated marks might be removed while cell identity is retained.',
    studiedModalities: ['cyclic OSK expression (inducible systems)', 'transient mRNA delivery', 'chemical reprogramming cocktails'],
    clinicalStatus: 'preclinical',
    tensions: [
      {
        id: 'reprogramming-identity-loss',
        label: 'Loss of cell identity and teratoma formation',
        mechanism:
          'The same factors that erase age-associated marks erase differentiation state. Sustained expression produces teratomas in vivo; the therapeutic window between "rejuvenated" and "dedifferentiated" is narrow and not established.',
        severity: 'documented-preclinical',
        monitoredBy: 'Lineage-marker retention and histology for teratoma; an epigenetic clock reading cannot detect identity loss.',
      },
      {
        id: 'reprogramming-clock-circularity',
        label: 'The endpoint may be measuring the intervention, not ageing',
        mechanism:
          'Epigenetic clocks are built from methylation marks, and reprogramming acts directly on methylation. A clock reading falling is therefore partly guaranteed by the mechanism, independently of whether the tissue is functionally younger.',
        severity: 'documented-preclinical',
        monitoredBy: 'Functional endpoints (regeneration, strength, survival) measured independently of any methylation-based readout.',
      },
    ],
    honesty: 'simplified',
    honestyNote:
      'Reprogramming to pluripotency is established and Nobel-recognised. PARTIAL reprogramming as a rejuvenation strategy is an active research question. The registry states the rationale and the tensions, and asserts no result.',
  },
  {
    id: 'senolytics',
    label: 'Senolytics (clearance of senescent cells)',
    description:
      'Selective elimination of senescent cells, typically by interfering with the anti-apoptotic pathways those cells depend on to survive their own damage response.',
    targets: ['cellular-senescence', 'sasp', 'stem-cell-rejuvenation'],
    rationale:
      'Senescent cells accumulate with age and export a pro-inflammatory secretome. Removing the source is mechanistically more direct than neutralising each secreted factor.',
    studiedModalities: ['BCL-2 family inhibitors (navitoclax class)', 'dasatinib + quercetin combination', 'FOXO4-p53 interfering peptides'],
    clinicalStatus: 'early-clinical',
    tensions: [
      {
        id: 'senescence-is-also-protective',
        label: 'Senescence is a tumour-suppressive and wound-healing programme',
        mechanism:
          'Senescent arrest prevents damaged cells from dividing, and transient senescence participates in wound healing, tissue patterning and fibrosis resolution. Indiscriminate clearance removes a protective programme along with the pathological burden.',
        severity: 'documented-preclinical',
        monitoredBy: 'Wound-healing and regeneration assays alongside senescent-burden measurement; burden alone cannot show the cost.',
      },
      {
        id: 'senolytic-off-target',
        label: 'The survival pathways targeted are not senescence-specific',
        mechanism:
          'BCL-2 family dependence is shared with platelets and other normal cells, which is the documented origin of dose-limiting toxicity for this class in oncology.',
        severity: 'documented-clinical',
        monitoredBy: 'Haematological safety monitoring — a longevity endpoint will not surface it.',
      },
    ],
    honesty: 'exact',
    honestyNote:
      'Senescent-cell accumulation and the existence of senolytic compounds are established. Clinical benefit for ageing is not, and no dose or regimen is described here or anywhere in this platform.',
  },
  {
    id: 'senomorphics',
    label: 'Senomorphics (SASP suppression)',
    description:
      'Suppressing the secretory programme of senescent cells without killing them — for example by interfering with NF-κB, C/EBPβ, JAK/STAT or cGAS–STING signalling.',
    targets: ['sasp', 'cellular-senescence'],
    rationale:
      'If most of the harm attributed to senescent cells is delivered by the secretome, silencing the secretome may capture the benefit without removing the arrest that suppresses tumours.',
    studiedModalities: ['JAK inhibitors', 'NF-κB pathway inhibitors', 'cGAS–STING pathway inhibitors'],
    clinicalStatus: 'preclinical',
    tensions: [
      {
        id: 'sasp-immune-clearance',
        label: 'The SASP recruits the immune clearance it is being blamed for needing',
        mechanism:
          'SASP chemokines summon immune cells that remove senescent and pre-malignant cells. Silencing the signal may let the senescent burden persist unremoved.',
        severity: 'documented-preclinical',
        monitoredBy: 'Senescent burden measured over time, not just cytokine concentrations.',
      },
      {
        id: 'sasp-broad-immunosuppression',
        label: 'The pathways are shared with normal immune signalling',
        mechanism:
          'NF-κB and JAK/STAT are core immune pathways; suppressing them systemically carries the infection risk documented for these drug classes in inflammatory disease.',
        severity: 'documented-clinical',
        monitoredBy: 'Infection surveillance and immune competence assays.',
      },
    ],
    honesty: 'exact',
    honestyNote: 'Pathway biology is established. No claim is made that SASP suppression slows ageing in any organism.',
  },
  {
    id: 'autophagy-induction',
    label: 'Autophagy induction',
    description:
      'Increasing autophagic flux — the actual rate of delivery to and degradation in the lysosome — through nutrient-sensing pathways or direct pathway activation.',
    targets: ['autophagy', 'mitochondrial-dysfunction', 'stem-cell-rejuvenation'],
    rationale:
      'Loss-of-function of core ATG genes shortens lifespan in model organisms, and several interventions that extend lifespan in those organisms require intact autophagy to do so. That makes autophagy a candidate common node rather than one more parallel effect.',
    studiedModalities: ['caloric restriction and time-restricted feeding protocols', 'spermidine', 'AMPK activators'],
    clinicalStatus: 'early-clinical',
    tensions: [
      {
        id: 'autophagy-tumour-survival',
        label: 'Established tumours use autophagy to survive stress',
        mechanism:
          'Autophagy is protective for the cell that performs it. In an already-transformed clone this supports survival under metabolic and therapeutic stress — the same programme, opposite consequence.',
        severity: 'documented-preclinical',
        monitoredBy: 'Context matters more than magnitude here; tumour surveillance rather than a flux measurement.',
      },
      {
        id: 'autophagy-flux-vs-level',
        label: 'The usual readout does not measure the thing',
        mechanism:
          'A raised LC3-II level is equally consistent with more autophagosome formation and with blocked degradation — opposite states. Only flux measurement with a lysosomal inhibitor distinguishes them.',
        severity: 'documented-preclinical',
        monitoredBy: 'LC3 turnover assayed with and without a lysosomal inhibitor; a static blot is not sufficient.',
      },
    ],
    honesty: 'exact',
    honestyNote:
      'Pathway biology and the model-organism genetics are established. Human healthspan benefit is not, and no protocol is prescribed here.',
  },
  {
    id: 'mtor-inhibition',
    label: 'mTOR inhibition',
    description:
      'Pharmacological inhibition of mTORC1 signalling, the principal nutrient-sensing suppressor of autophagy.',
    targets: ['autophagy', 'stem-cell-rejuvenation', 'cellular-senescence'],
    rationale:
      'mTORC1 sits at a convergence point for nutrient sensing, protein synthesis and autophagy, which makes it one of the most mechanistically connected single targets in the field.',
    studiedModalities: ['rapamycin and rapalogs (research use)'],
    clinicalStatus: 'clinical-trials',
    tensions: [
      {
        id: 'mtor-immunosuppression',
        label: 'The clinically established effect is immunosuppression',
        mechanism:
          'mTOR inhibitors are approved as transplant immunosuppressants. Their best-documented human effect is suppression of adaptive immunity, with the associated infection risk.',
        severity: 'documented-clinical',
        monitoredBy: 'Infection incidence and vaccine-response assays.',
      },
      {
        id: 'mtor-metabolic',
        label: 'Documented metabolic and wound-healing effects',
        mechanism:
          'Hyperlipidaemia, glucose intolerance, stomatitis and impaired wound healing are documented in the transplant population.',
        severity: 'documented-clinical',
        monitoredBy: 'Standard metabolic panel and wound-healing assessment.',
      },
    ],
    honesty: 'exact',
    honestyNote:
      'Human pharmacology is well documented — and what is documented is immunosuppression, not rejuvenation. Nothing here is a dosing or usage recommendation.',
  },
  {
    id: 'nad-restoration',
    label: 'NAD+ restoration',
    description:
      'Raising cellular NAD+ availability, typically via biosynthetic precursors, to support NAD+-dependent enzymes including sirtuins and PARPs.',
    targets: ['mitochondrial-dysfunction', 'dna-repair'],
    rationale:
      'NAD+ concentrations decline with age in several tissues, and NAD+ is a required cofactor for both sirtuin deacetylation and PARP-mediated DNA repair, coupling it to two mechanisms at once.',
    studiedModalities: ['nicotinamide riboside', 'nicotinamide mononucleotide', 'NAMPT modulators'],
    clinicalStatus: 'clinical-trials',
    tensions: [
      {
        id: 'nad-tissue-heterogeneity',
        label: 'A rise in blood NAD+ is not a rise where it matters',
        mechanism:
          'Precursor supplementation reliably raises blood NAD+ metabolites; whether the relevant intracellular pool in the relevant tissue rises is a separate question that the accessible measurement does not answer.',
        severity: 'documented-clinical',
        monitoredBy: 'Tissue-level NAD+ quantification, not plasma metabolite concentration.',
      },
      {
        id: 'nad-proliferation',
        label: 'Proliferating cells also need NAD+',
        mechanism:
          'NAD+ availability supports the biosynthetic and repair demands of any dividing cell, including transformed ones — a theoretical concern that has not been resolved either way.',
        severity: 'theoretical',
        monitoredBy: 'Long-term tumour incidence; short trials cannot address it.',
      },
    ],
    honesty: 'simplified',
    honestyNote:
      'The NAD+ decline and its cofactor role are established. Human trials have generally shown metabolite changes; healthspan benefit is not established and is not claimed here.',
  },
  {
    id: 'mitophagy-enhancement',
    label: 'Mitophagy enhancement',
    description:
      'Selectively increasing clearance of damaged mitochondria through the PINK1/Parkin axis or related selective-autophagy routes.',
    targets: ['mitochondrial-dysfunction', 'autophagy'],
    rationale:
      'If damaged mitochondria accumulate because clearance fails rather than because damage rises, then restoring clearance addresses the actual failing step.',
    studiedModalities: ['urolithin A', 'PINK1/Parkin pathway activators'],
    clinicalStatus: 'early-clinical',
    tensions: [
      {
        id: 'mitophagy-excess-clearance',
        label: 'Clearance beyond biogenesis depletes the pool',
        mechanism:
          'Mitophagy without matched biogenesis reduces total mitochondrial content, which in high-demand tissue is a loss rather than a cleanup.',
        severity: 'theoretical',
        monitoredBy: 'Mitochondrial content and respiratory capacity measured together, not clearance rate alone.',
      },
    ],
    honesty: 'simplified',
    honestyNote: 'The clearance pathway is established. Whether enhancing it benefits human healthspan is unresolved.',
  },
  {
    id: 'dna-repair-support',
    label: 'DNA repair support',
    description:
      'Interventions intended to preserve or restore genome-maintenance capacity, including support for repair-pathway cofactors and reduction of genotoxic load.',
    targets: ['dna-repair', 'cellular-senescence', 'telomere-attrition'],
    rationale:
      'Inherited repair defects produce segmental progeroid syndromes in humans — the most direct human genetic evidence that genome maintenance capacity and ageing phenotypes are linked.',
    studiedModalities: ['PARP cofactor availability (NAD+ axis)', 'reduction of genotoxic exposure'],
    clinicalStatus: 'preclinical',
    tensions: [
      {
        id: 'repair-progeroid-inference',
        label: 'Progeroid syndromes are segmental, not accelerated ageing',
        mechanism:
          'Werner and Hutchinson–Gilford syndromes reproduce a SUBSET of ageing features and omit others entirely. Reasoning from "repair defect causes progeria" to "repair support slows ageing" crosses a gap the genetics does not close.',
        severity: 'documented-clinical',
        monitoredBy: 'Nothing monitors this — it is an inferential limit, and the appraisal labels it as one.',
      },
    ],
    honesty: 'simplified',
    honestyNote:
      'Repair biology and the progeroid genetics are established. The therapeutic inference drawn from them is explicitly flagged as an inference.',
  },
  {
    id: 'stem-cell-therapy',
    label: 'Stem-cell and niche restoration',
    description:
      'Restoring regenerative capacity by supplying stem cells, or by modifying the niche so that resident stem cells recover function.',
    targets: ['stem-cell-rejuvenation', 'cellular-senescence'],
    rationale:
      'Heterochronic experiments indicate that part of the age-associated decline in regeneration is imposed by the environment rather than fixed in the cell, which implies a reversible component.',
    studiedModalities: ['haematopoietic stem-cell transplantation (established for other indications)', 'mesenchymal stromal cell administration', 'niche-directed signalling modulation'],
    clinicalStatus: 'early-clinical',
    tensions: [
      {
        id: 'stemcell-tumorigenicity',
        label: 'Transplanted proliferative cells carry tumour risk',
        mechanism:
          'Cells selected for proliferative and self-renewal capacity are, by that same property, capable of forming tumours if differentiation control fails.',
        severity: 'documented-clinical',
        monitoredBy: 'Long-term imaging and histological surveillance.',
      },
      {
        id: 'stemcell-unregulated-clinics',
        label: 'The field has a documented history of unregulated administration',
        mechanism:
          'Serious adverse events, including blindness, have been documented from unregulated stem-cell administration marketed on the strength of preclinical rationale.',
        severity: 'documented-clinical',
        monitoredBy: 'Regulatory status of the specific protocol — this is a governance question, not a laboratory measurement.',
      },
    ],
    honesty: 'simplified',
    honestyNote:
      'Transplantation is established for specific haematological indications. Its use as an anti-ageing intervention is not established, and the harm record here is real rather than theoretical.',
  },
  {
    id: 'systemic-factor-modulation',
    label: 'Systemic factor modulation',
    description:
      'Altering circulating factors — by dilution, exchange or targeted addition and removal — to change the systemic environment that tissues age in.',
    targets: ['stem-cell-rejuvenation', 'sasp', 'cellular-senescence'],
    rationale:
      'Heterochronic parabiosis and plasma-dilution experiments showed that regenerative capacity in aged tissue responds to systemic environment, implicating circulating factors as a lever.',
    studiedModalities: ['therapeutic plasma exchange', 'plasma dilution', 'targeted depletion of specific circulating factors'],
    clinicalStatus: 'early-clinical',
    tensions: [
      {
        id: 'systemic-uncharacterised',
        label: 'The active factors are largely unidentified',
        mechanism:
          'If the mechanism is "something in plasma", then the intervention cannot be specified, dosed or reasoned about mechanistically — and the replication history of individual candidate factors has been contested.',
        severity: 'documented-preclinical',
        monitoredBy: 'Identification and independent replication of specific factors before attribution.',
      },
      {
        id: 'systemic-procedure-risk',
        label: 'The procedure carries its own established risks',
        mechanism:
          'Plasma exchange has documented procedural risks — infection, citrate reactions, haemodynamic effects — that exist independently of any ageing hypothesis.',
        severity: 'documented-clinical',
        monitoredBy: 'Standard apheresis safety monitoring.',
      },
    ],
    honesty: 'theoretical',
    honestyNote:
      'The parabiosis observations are real. The therapeutic proposition rests on unidentified factors, so this entry is marked theoretical rather than simplified.',
  },
];

/**
 * Which WAY each strategy pushes each mechanism it targets.
 *
 * Kept as one table rather than scattered through the entries above, because the
 * cancer-safety engine composes these signs with the oncogenic edges and a single
 * wrong arrow silently inverts a risk verdict. One table can be reviewed in one
 * sitting; eleven scattered fields cannot. A test asserts it stays in step with
 * each intervention's `targets`.
 *
 * Read `increase` / `decrease` as "intended direction of change in that
 * mechanism", not as a claim that the change is achieved.
 */
export type ModulationDirection = 'increase' | 'decrease';

export const TARGET_DIRECTIONS: Record<InterventionId, Partial<Record<HallmarkId, ModulationDirection>>> = {
  'telomerase-activation': { telomerase: 'increase', 'telomere-attrition': 'decrease', 'cellular-senescence': 'decrease' },
  'partial-reprogramming': { 'yamanaka-factors': 'increase', 'epigenetic-reprogramming': 'increase', 'cellular-senescence': 'decrease', 'stem-cell-rejuvenation': 'increase' },
  senolytics: { 'cellular-senescence': 'decrease', sasp: 'decrease', 'stem-cell-rejuvenation': 'increase' },
  // Senomorphics act ON senescent cells but deliberately do NOT reduce senescent
  // burden — silencing the secretome while leaving the arrest intact is the whole
  // point of the class. No direction is declared for 'cellular-senescence' because
  // none is asserted, and the safety engine therefore refuses to compute a risk
  // sign through that target rather than guessing one.
  senomorphics: { sasp: 'decrease' },
  'autophagy-induction': { autophagy: 'increase', 'mitochondrial-dysfunction': 'decrease', 'stem-cell-rejuvenation': 'increase' },
  'mtor-inhibition': { autophagy: 'increase', 'stem-cell-rejuvenation': 'increase', 'cellular-senescence': 'decrease' },
  'nad-restoration': { 'mitochondrial-dysfunction': 'decrease', 'dna-repair': 'increase' },
  'mitophagy-enhancement': { 'mitochondrial-dysfunction': 'decrease', autophagy: 'increase' },
  'dna-repair-support': { 'dna-repair': 'increase', 'cellular-senescence': 'decrease', 'telomere-attrition': 'decrease' },
  'stem-cell-therapy': { 'stem-cell-rejuvenation': 'increase', 'cellular-senescence': 'decrease' },
  'systemic-factor-modulation': { 'stem-cell-rejuvenation': 'increase', sasp: 'decrease', 'cellular-senescence': 'decrease' },
};

export function modulationOf(id: InterventionId, hallmark: HallmarkId): ModulationDirection | undefined {
  return TARGET_DIRECTIONS[id]?.[hallmark];
}

const BY_ID = new Map<InterventionId, Intervention>(INTERVENTIONS.map((i) => [i.id, i]));

export function getIntervention(id: InterventionId): Intervention | undefined {
  return BY_ID.get(id);
}

/** Every documented tension across the registry, most severe first. */
export function allTensions(): { intervention: InterventionId; tension: MechanisticTension }[] {
  const order: Record<MechanisticTension['severity'], number> = {
    'documented-clinical': 0, 'documented-preclinical': 1, theoretical: 2,
  };
  return INTERVENTIONS
    .flatMap((i) => i.tensions.map((tension) => ({ intervention: i.id, tension })))
    .sort((a, b) => order[a.tension.severity] - order[b.tension.severity]);
}
