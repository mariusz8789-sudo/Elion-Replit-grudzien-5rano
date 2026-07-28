import type { HallmarkId } from './hallmarks';
import { getNode } from './knowledgeGraph';
import type { HonestyLevel } from '../types';

/**
 * Multi-species Longevity Engine.
 *
 * Evolution has already run the experiment several times. A handful of organisms
 * have solved problems the human lineage did not — negligible senescence, whole-body
 * regeneration, cancer resistance at large body mass, multi-century lifespan — and
 * the mechanisms behind those solutions are the strongest available evidence that a
 * given ageing mechanism is TRACTABLE rather than thermodynamically fixed.
 *
 * THE HONEST PART, AND THE POINT OF THE MODULE. For several of these organisms the
 * exceptional trait is far better documented than its mechanism. Greenland shark
 * lifespan is established by radiocarbon dating of eye-lens nuclei; the mechanism is
 * essentially unknown. Axolotl regeneration without teratoma is reproducible; why it
 * does not produce tumours is not settled. Every entry therefore carries
 * `mechanismStatus`, and 'unknown' appears where it belongs.
 *
 * That is not a weakness of the module — an organism with a spectacular trait and an
 * unexplained mechanism is the single best-motivated place in comparative biology to
 * point a research programme, and `openQuestions` names those directly.
 *
 * NOTHING HERE IS AN EFFICACY CLAIM. That naked mole rats resist cancer says nothing
 * about whether any human intervention would. Conservation is a reason to look, not
 * evidence that a mechanism transfers.
 */

export type SpeciesId =
  | 'hydra' | 'planarian' | 'axolotl' | 'naked-mole-rat' | 'greenland-shark' | 'bowhead-whale' | 'human';

export type MechanismStatus =
  /** Mechanism characterised and independently replicated. */
  | 'established'
  /** Partly characterised; principal components identified, full picture open. */
  | 'partial'
  /** Trait is documented, mechanism is not. */
  | 'unknown';

export interface SpeciesTrait {
  /** The exceptional capability, stated as observed. */
  trait: string;
  /** How the trait itself was established — the observation, not the explanation. */
  evidenceBasis: string;
  /** Ageing mechanisms this trait bears on. */
  relatesTo: HallmarkId[];
  mechanismStatus: MechanismStatus;
  /** What is known about HOW, honestly bounded. */
  proposedMechanism: string;
  honesty: HonestyLevel;
}

export interface Species {
  id: SpeciesId;
  common: string;
  latin: string;
  /** Approximate maximum lifespan as reported, with the method noted in traits. */
  maxLifespanYears: number | 'indeterminate';
  lineage: string;
  traits: SpeciesTrait[];
  /** Questions this organism poses that nobody has answered. */
  openQuestions: string[];
}

export const SPECIES: Species[] = [
  {
    id: 'hydra', common: 'Hydra', latin: 'Hydra vulgaris', maxLifespanYears: 'indeterminate',
    lineage: 'Cnidaria',
    traits: [
      {
        trait: 'Negligible senescence: no detectable increase in mortality rate with age under laboratory conditions.',
        evidenceBasis: 'Multi-year laboratory cohorts show flat age-specific mortality, which is the demographic definition of negligible senescence.',
        relatesTo: ['stem-cell-rejuvenation', 'cellular-senescence'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Continuous self-renewal of three stem-cell lineages replaces the entire body column, so no somatic cell persists long enough to accumulate damage. High FoxO activity is implicated in maintaining the stem-cell compartment.',
        honesty: 'simplified',
      },
      {
        trait: 'Whole-body regeneration from dissociated tissue fragments.',
        evidenceBasis: 'Reproducible across laboratories since the eighteenth century.',
        relatesTo: ['stem-cell-rejuvenation'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Interstitial stem cells retain broad potency throughout life; positional information is re-established by a Wnt-organising gradient.',
        honesty: 'simplified',
      },
    ],
    openQuestions: [
      'Hydra has a simple body plan with no long-lived post-mitotic tissue. Is negligible senescence a property of its cells, or only of an architecture that permits total cell replacement? The two have opposite implications for mammals.',
    ],
  },
  {
    id: 'planarian', common: 'Planarian', latin: 'Schmidtea mediterranea', maxLifespanYears: 'indeterminate',
    lineage: 'Platyhelminthes',
    traits: [
      {
        trait: 'Whole-animal regeneration from small body fragments, including a complete new head.',
        evidenceBasis: 'Routine laboratory amputation experiments; reproducible and quantitative.',
        relatesTo: ['stem-cell-rejuvenation'],
        mechanismStatus: 'established',
        proposedMechanism: 'Neoblasts — adult pluripotent stem cells constituting a large fraction of body cells — supply every lineage. Single-neoblast transplantation can rescue a lethally irradiated animal.',
        honesty: 'exact',
      },
      {
        trait: 'Apparently unlimited somatic maintenance in asexual strains.',
        evidenceBasis: 'Asexual lines maintained by fission over long laboratory timescales without demographic senescence.',
        relatesTo: ['telomerase', 'telomere-attrition', 'stem-cell-rejuvenation'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Somatic telomerase activity is upregulated during regeneration in asexual animals, maintaining telomere length across fission cycles — the opposite of the somatic repression seen in humans.',
        honesty: 'simplified',
      },
    ],
    openQuestions: [
      'Planarians maintain somatic telomerase without the tumour burden that telomerase reactivation implies in mammals. What supplies the missing tumour-suppressive constraint?',
    ],
  },
  {
    id: 'axolotl', common: 'Axolotl', latin: 'Ambystoma mexicanum', maxLifespanYears: 20,
    lineage: 'Amphibia',
    traits: [
      {
        trait: 'Complete regeneration of limbs, spinal cord, heart and portions of brain, scar-free.',
        evidenceBasis: 'Reproducible across laboratories with quantified fidelity of the regenerated structure.',
        relatesTo: ['stem-cell-rejuvenation', 'yamanaka-factors'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Injury induces a blastema of dedifferentiated, lineage-restricted progenitors that reproliferate and redifferentiate. Positional memory is retained by the cells rather than reimposed from outside.',
        honesty: 'simplified',
      },
      {
        trait: 'Dedifferentiation at scale without teratoma formation, and low reported tumour incidence.',
        evidenceBasis: 'Long-standing laboratory observation; tumour induction requires unusually strong carcinogen exposure.',
        relatesTo: ['stem-cell-rejuvenation', 'cellular-senescence'],
        mechanismStatus: 'unknown',
        proposedMechanism: 'NOT ESTABLISHED. Axolotls dedifferentiate cells routinely — the process that produces teratomas in mammals — and do not form teratomas. Why the constraint holds is an open question rather than a described mechanism.',
        honesty: 'theoretical',
      },
    ],
    openQuestions: [
      'This is the sharpest form of the platform’s central question that nature already answers: an organism performs large-scale dedifferentiation WITHOUT the oncogenic consequence. Identifying that constraint would bear directly on partial reprogramming in mammals.',
      'Is the constraint cell-intrinsic or imposed by the regenerative environment? Only the first would be portable.',
    ],
  },
  {
    id: 'naked-mole-rat', common: 'Naked mole rat', latin: 'Heterocephalus glaber', maxLifespanYears: 30,
    lineage: 'Rodentia',
    traits: [
      {
        trait: 'Maximum lifespan roughly an order of magnitude beyond a similarly sized mouse, without the Gompertzian rise in mortality that characterises most mammals.',
        evidenceBasis: 'Long-running captive colonies with individually tracked animals.',
        relatesTo: ['cellular-senescence', 'dna-repair', 'autophagy'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Multiple contributing factors reported: unusually accurate translation, enhanced proteostasis and autophagy, and stress-resistant fibroblasts. No single mechanism accounts for the phenotype.',
        honesty: 'simplified',
      },
      {
        trait: 'Very low spontaneous tumour incidence.',
        evidenceBasis: 'Necropsy series across captive colonies report tumours as rare; some individual cases have been documented, so "cancer-free" would overstate it.',
        relatesTo: ['cellular-senescence', 'stem-cell-rejuvenation'],
        mechanismStatus: 'partial',
        proposedMechanism: 'High-molecular-mass hyaluronan in the extracellular matrix is associated with early contact inhibition of proliferation. Removing its synthesis increases susceptibility, which is the strongest causal evidence available — though it is unlikely to be the whole explanation.',
        honesty: 'simplified',
      },
    ],
    openQuestions: [
      'Cancer resistance here is at least partly EXTRACELLULAR, not a checkpoint change. Most human anti-ageing strategies act inside the cell — the matrix as a tumour-suppressive compartment is comparatively unexplored.',
      'Does long life follow from cancer resistance, or are both downstream of a shared upstream cause? The distinction determines which one is worth targeting.',
    ],
  },
  {
    id: 'greenland-shark', common: 'Greenland shark', latin: 'Somniosus microcephalus', maxLifespanYears: 400,
    lineage: 'Chondrichthyes',
    traits: [
      {
        trait: 'The longest measured vertebrate lifespan, with age at sexual maturity estimated around 150 years.',
        evidenceBasis: 'Radiocarbon dating of eye-lens nuclei, which are metabolically inert after formation and therefore preserve the isotope signature of the year of birth. This dates the ANIMAL, and says nothing about mechanism.',
        relatesTo: ['telomere-attrition', 'dna-repair', 'mitochondrial-dysfunction'],
        mechanismStatus: 'unknown',
        proposedMechanism: 'NOT ESTABLISHED. Very low metabolic rate in near-freezing water is the usual suggestion, but it is a correlation with the habitat rather than a demonstrated cause, and other cold-water species do not achieve comparable lifespans.',
        honesty: 'theoretical',
      },
    ],
    openQuestions: [
      'The best-documented extreme lifespan in vertebrates has essentially no mechanistic account. Comparative genomics and tissue-level ageing biomarkers in this species are among the highest-information, lowest-competition measurements available in the field.',
      'Is extreme longevity here an adaptation, or the passive consequence of a very slow metabolism? These predict entirely different things for warm-blooded animals.',
    ],
  },
  {
    id: 'bowhead-whale', common: 'Bowhead whale', latin: 'Balaena mysticetus', maxLifespanYears: 200,
    lineage: 'Cetacea',
    traits: [
      {
        trait: 'Lifespan exceeding two centuries in the largest-bodied long-lived mammal.',
        evidenceBasis: 'Aspartic-acid racemisation in eye-lens protein, corroborated by recovery of nineteenth-century harpoon fragments from living animals.',
        relatesTo: ['dna-repair', 'telomere-attrition'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Genome analyses report duplications and variants in DNA-repair and cell-cycle genes including ERCC1 and PCNA. Association from comparative genomics; functional demonstration in the relevant tissue is limited.',
        honesty: 'simplified',
      },
      {
        trait: 'Low cancer incidence despite roughly a thousandfold more cells than a human — a direct instance of Peto’s paradox.',
        evidenceBasis: 'Peto’s paradox is a robust cross-species observation: cancer incidence does not scale with cell number as a naive multi-hit model predicts.',
        relatesTo: ['dna-repair'],
        mechanismStatus: 'partial',
        proposedMechanism: 'Enhanced genome maintenance is the leading account. Different large-bodied lineages appear to have solved the same problem differently — elephants via TP53 copy number — which indicates convergent solutions rather than one conserved trick.',
        honesty: 'simplified',
      },
    ],
    openQuestions: [
      'If large long-lived mammals independently evolved DIFFERENT solutions to Peto’s paradox, then there is no single conserved pathway to copy, and the useful question becomes which solution is compatible with human physiology.',
    ],
  },
  {
    id: 'human', common: 'Human', latin: 'Homo sapiens', maxLifespanYears: 122,
    lineage: 'Primates',
    traits: [
      {
        trait: 'Somatic repression of telomerase with replicative senescence as a tumour barrier.',
        evidenceBasis: 'Established cell and molecular biology; the Hayflick limit is reproducible in primary human fibroblasts.',
        relatesTo: ['telomerase', 'telomere-attrition', 'cellular-senescence'],
        mechanismStatus: 'established',
        proposedMechanism: 'Somatic telomerase repression caps replicative capacity, which suppresses tumours at the cost of a finite regenerative reserve. This is the trade-off the platform’s central question is about.',
        honesty: 'exact',
      },
      {
        trait: 'FOXO3 variants are among the most reproducibly replicated genetic associations with human longevity.',
        evidenceBasis: 'Replicated across multiple independent human cohorts and populations.',
        relatesTo: ['autophagy', 'stem-cell-rejuvenation', 'dna-repair'],
        mechanismStatus: 'partial',
        proposedMechanism: 'FOXO transcription factors regulate stress resistance, autophagy and stem-cell maintenance. The human association is robust; the causal path from variant to lifespan is not established.',
        honesty: 'simplified',
      },
    ],
    openQuestions: [
      'Human somatic telomerase repression looks like an evolutionary trade rather than a constraint. Species that did not make that trade are the natural comparison group for asking what it actually costs.',
    ],
  },
];

const BY_ID = new Map<SpeciesId, Species>(SPECIES.map((s) => [s.id, s]));
export function getSpecies(id: SpeciesId): Species | undefined { return BY_ID.get(id); }

export interface ConservedMechanism {
  hallmark: HallmarkId;
  label: string;
  /** Species whose exceptional traits bear on this mechanism. */
  species: { id: SpeciesId; common: string; trait: string; mechanismStatus: MechanismStatus }[];
  /** How many independent lineages are represented — convergence is the signal. */
  lineages: string[];
  /** Fraction of contributing species whose mechanism is actually characterised. */
  mechanisticClarity: number;
  interpretation: string;
}

/**
 * Mechanisms implicated across multiple lineages. Convergence across DISTANT
 * lineages is the interesting pattern: two solutions arrived at independently
 * suggest the mechanism is genuinely tractable, whereas one spectacular organism
 * may simply be idiosyncratic.
 *
 * `mechanisticClarity` deliberately exposes the module's central honest point —
 * several strongly conserved mechanisms are supported almost entirely by traits
 * whose mechanism nobody has characterised.
 */
export function conservedMechanisms(): ConservedMechanism[] {
  const byHallmark = new Map<HallmarkId, ConservedMechanism>();

  for (const sp of SPECIES) {
    for (const trait of sp.traits) {
      for (const hallmark of trait.relatesTo) {
        const entry = byHallmark.get(hallmark) ?? {
          hallmark, label: getNode(hallmark)?.label ?? hallmark,
          species: [], lineages: [], mechanisticClarity: 0, interpretation: '',
        };
        entry.species.push({ id: sp.id, common: sp.common, trait: trait.trait, mechanismStatus: trait.mechanismStatus });
        if (!entry.lineages.includes(sp.lineage)) entry.lineages.push(sp.lineage);
        byHallmark.set(hallmark, entry);
      }
    }
  }

  const out = [...byHallmark.values()];
  for (const entry of out) {
    const characterised = entry.species.filter((s) => s.mechanismStatus !== 'unknown').length;
    entry.mechanisticClarity = entry.species.length ? Number((characterised / entry.species.length).toFixed(2)) : 0;
    entry.interpretation = buildInterpretation(entry);
  }

  return out.sort((a, b) => b.lineages.length - a.lineages.length || b.species.length - a.species.length);
}

function buildInterpretation(entry: ConservedMechanism): string {
  const parts: string[] = [];
  if (entry.lineages.length >= 3) {
    parts.push(`Implicated in ${entry.lineages.length} distant lineages (${entry.lineages.join(', ')}), which is convergence rather than a single lineage’s idiosyncrasy.`);
  } else {
    parts.push(`Implicated in ${entry.lineages.length} lineage(s); too few to distinguish convergence from idiosyncrasy.`);
  }
  if (entry.mechanisticClarity < 0.6) {
    parts.push(`Only ${Math.round(entry.mechanisticClarity * 100)}% of the contributing traits have a characterised mechanism — the pattern is strong and the explanation is not.`);
  }
  parts.push('Conservation is a reason to investigate. It is not evidence that the mechanism transfers to humans, and nothing here claims it does.');
  return parts.join(' ');
}

export interface SpeciesGap {
  species: SpeciesId;
  common: string;
  trait: string;
  /** Why this specific gap is worth the field's attention. */
  why: string;
}

/** Traits with an established observation and NO characterised mechanism — the highest-information targets. */
export function unexplainedTraits(): SpeciesGap[] {
  return SPECIES.flatMap((sp) =>
    sp.traits
      .filter((t) => t.mechanismStatus === 'unknown')
      .map((t) => ({
        species: sp.id, common: sp.common, trait: t.trait,
        why: `The observation is established (${t.evidenceBasis.split('.')[0]}.) while the mechanism is not. A documented capability with no explanation is the best-motivated target in comparative biology, because the existence proof is already in hand.`,
      })),
  );
}

/** Which mechanisms humans handle differently from the exceptional species. */
export function humanContrast(): { hallmark: HallmarkId; label: string; humanApproach: string; contrastingSpecies: { common: string; approach: string }[] }[] {
  const human = getSpecies('human')!;
  const out: ReturnType<typeof humanContrast> = [];

  for (const trait of human.traits) {
    for (const hallmark of trait.relatesTo) {
      const contrasting = SPECIES
        .filter((s) => s.id !== 'human')
        .flatMap((s) => s.traits.filter((t) => t.relatesTo.includes(hallmark)).map((t) => ({ common: s.common, approach: t.proposedMechanism })));
      if (contrasting.length === 0) continue;
      if (out.some((o) => o.hallmark === hallmark)) continue;
      out.push({ hallmark, label: getNode(hallmark)?.label ?? hallmark, humanApproach: trait.proposedMechanism, contrastingSpecies: contrasting });
    }
  }
  return out;
}
