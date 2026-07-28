import type { HallmarkId } from './hallmarks.ts';
import { getNode, type CancerNodeId } from './knowledgeGraph.ts';
import type { HonestyLevel } from './types.ts';

/**
 * Cell State Transition Engine.
 *
 * Ageing is usually drawn as a set of parallel "hallmarks", which is useful for
 * cataloguing damage and useless for reasoning about what a cell will DO. Cells
 * occupy states, and interventions matter only insofar as they change which
 * transition a cell takes. This module models the six states a somatic cell moves
 * between and, for each transition, the mechanisms that DRIVE it and the
 * mechanisms that BLOCK it.
 *
 * The blockers are the point. In this biology the same molecules appear on both
 * sides: p53 and RB block the transition into cancer AND enforce the transition
 * into senescence. Removing a blocker to avoid one state pushes the cell toward
 * another. A model with only drivers would make rejuvenation look free.
 *
 * REVERSIBILITY IS STATED PER TRANSITION and is not wishful. Senescence is a
 * stable arrest: the honest model has cells LEAVING it by clearance, not by
 * reverting. Transformation is not reversible at all. Where reversibility is an
 * open research question — as for partial reprogramming — it is marked
 * 'experimental' and the honesty level says so.
 */

/**
 * A transition can be driven or blocked by an ageing mechanism OR by an oncogenic
 * axis — immune surveillance blocks paracrine transformation, and p53/RB block
 * entry into cancer. Restricting this to hallmarks alone would force a type cast
 * and silently drop the most important blockers in the model.
 */
export type StateInfluence = HallmarkId | CancerNodeId;

export type CellState = 'healthy' | 'aging' | 'senescent' | 'stem-like' | 'regenerative' | 'cancer';

export const CELL_STATES: Record<CellState, { label: string; description: string; desirable: boolean }> = {
  healthy: {
    label: 'Healthy', desirable: true,
    description: 'Differentiated, functional, capable of division within normal control. Low damage burden, intact checkpoints.',
  },
  aging: {
    label: 'Aging', desirable: false,
    description: 'Still functional but carrying accumulated damage: shortened telomeres, epigenetic drift, declining proteostasis and mitochondrial capacity. Not yet arrested.',
  },
  senescent: {
    label: 'Senescent', desirable: false,
    description: 'Stable cell-cycle arrest with continued metabolic activity and resistance to apoptosis. Secretes the SASP. Simultaneously a tumour-suppressive programme and a source of tissue damage.',
  },
  'stem-like': {
    label: 'Stem-like', desirable: false,
    description: 'Dedifferentiated, self-renewing, not performing tissue function. A necessary intermediate for regeneration and the state from which teratomas arise.',
  },
  regenerative: {
    label: 'Regenerative', desirable: true,
    description: 'Actively dividing and redifferentiating to restore tissue. Transient by definition — a cell that stays here is not regenerating, it is proliferating.',
  },
  cancer: {
    label: 'Cancer', desirable: false,
    description: 'Proliferating outside normal growth control, with checkpoint loss and genomic instability. Terminal in this model: no documented route returns from it.',
  },
};

export type Reversibility =
  /** Documented to reverse under known conditions. */
  | 'reversible'
  /** Cells leave the state only by being removed, not by reverting. */
  | 'exit-by-clearance'
  /** Reversal is an open research question, not an established capability. */
  | 'experimental'
  /** No documented route back. */
  | 'irreversible';

export interface StateTransition {
  id: string;
  from: CellState;
  to: CellState;
  label: string;
  /** Mechanisms whose increase pushes a cell along this transition. */
  drivenBy: StateInfluence[];
  /** Mechanisms whose activity opposes it. Blockers are usually tumour suppressors. */
  blockedBy: StateInfluence[];
  /** The biology, stated so a reader can dispute the transition itself. */
  mechanism: string;
  reversibility: Reversibility;
  honesty: HonestyLevel;
  /** What is NOT claimed by including this transition. */
  caveat: string;
}

export const STATE_TRANSITIONS: StateTransition[] = [
  {
    id: 'healthy-to-aging', from: 'healthy', to: 'aging', label: 'Damage accumulation',
    drivenBy: ['telomere-attrition', 'mitochondrial-dysfunction', 'epigenetic-reprogramming'],
    blockedBy: ['dna-repair', 'autophagy', 'telomerase'],
    mechanism: 'Replicative telomere loss, oxidative and replicative DNA lesions, epigenetic drift and declining proteostasis accumulate faster than maintenance clears them. The cell remains functional but its reserve shrinks.',
    reversibility: 'reversible',
    honesty: 'exact',
    caveat: 'The transition is gradual and has no sharp boundary; treating it as a discrete step is a modelling simplification, not a claim about a switch.',
  },
  {
    id: 'aging-to-senescent', from: 'aging', to: 'senescent', label: 'Arrest enforcement',
    drivenBy: ['telomere-attrition', 'sasp', 'mitochondrial-dysfunction'],
    blockedBy: ['dna-repair', 'telomerase', 'autophagy'],
    mechanism: 'A critically short telomere or an unrepaired double-strand break produces a persistent DNA damage response. p53–p21 imposes arrest and p16INK4a–RB makes it stable. Paracrine SASP signalling from neighbouring senescent cells lowers the threshold.',
    reversibility: 'exit-by-clearance',
    honesty: 'exact',
    caveat: 'Senescent arrest is stable by definition. This model does NOT include a senescent→aging reversal, because no established route reverts a senescent cell to a proliferation-competent one.',
  },
  {
    id: 'senescent-cleared', from: 'senescent', to: 'healthy', label: 'Immune clearance or senolysis',
    drivenBy: ['sasp'],
    blockedBy: [],
    mechanism: 'SASP chemokines recruit cytotoxic immune cells that remove the senescent cell; the vacated niche is repopulated by a neighbouring healthy cell. Senolytic intervention substitutes for the immune arm.',
    reversibility: 'reversible',
    honesty: 'simplified',
    caveat: 'The senescent cell is REMOVED, not repaired. Tissue recovers only if a replacement-competent cell remains — in a depleted compartment, clearance leaves a hole rather than a repair.',
  },
  {
    id: 'aging-to-stem-like', from: 'aging', to: 'stem-like', label: 'Reprogramming / dedifferentiation',
    drivenBy: ['yamanaka-factors', 'epigenetic-reprogramming'],
    blockedBy: ['cellular-senescence'],
    mechanism: 'OSKM expression remodels methylation and chromatin toward an embryonic configuration, erasing age-associated marks together with differentiation state.',
    reversibility: 'experimental',
    honesty: 'simplified',
    caveat: 'Whether a cell can be taken PART of the way and returned to its original identity is the open question of the field. This transition asserts dedifferentiation, not controlled partial rejuvenation.',
  },
  {
    id: 'stem-like-to-regenerative', from: 'stem-like', to: 'regenerative', label: 'Redifferentiation',
    drivenBy: ['stem-cell-rejuvenation', 'autophagy'],
    blockedBy: ['sasp', 'cellular-senescence'],
    mechanism: 'Niche signals direct the dedifferentiated cell back down a lineage, restoring tissue function. Autophagic clearance supports the metabolic switch redifferentiation requires.',
    reversibility: 'reversible',
    honesty: 'simplified',
    caveat: 'Requires an intact niche. In aged tissue the niche is itself degraded, which is why the same stem cell performs differently in young and old hosts.',
  },
  {
    id: 'stem-like-to-cancer', from: 'stem-like', to: 'cancer', label: 'Loss of differentiation control',
    drivenBy: ['yamanaka-factors', 'stem-cell-rejuvenation'],
    blockedBy: ['dna-repair'],
    mechanism: 'A self-renewing cell that does not receive or does not obey differentiation cues continues proliferating. Sustained OSKM expression in vivo produces teratomas; MYC is both a reprogramming factor and a canonical oncogene.',
    reversibility: 'irreversible',
    honesty: 'exact',
    caveat: 'This is the documented failure mode of reprogramming in vivo, not a speculative risk.',
  },
  {
    id: 'aging-to-cancer', from: 'aging', to: 'cancer', label: 'Transformation',
    drivenBy: ['telomere-attrition', 'telomerase', 'mitochondrial-dysfunction', 'sasp'],
    blockedBy: ['dna-repair', 'cellular-senescence'],
    mechanism: 'Mutation burden accumulates; telomere dysfunction drives chromosomal rearrangement; telomerase reactivation removes the replicative limit; the SASP supplies a permissive, growth-factor-rich microenvironment. Transformation requires that senescent arrest and repair both fail.',
    reversibility: 'irreversible',
    honesty: 'exact',
    caveat: 'Senescence appears as a BLOCKER here and as an undesirable state elsewhere. That is not an inconsistency in the model — it is the central trade-off of the field.',
  },
  {
    id: 'aging-to-regenerative', from: 'aging', to: 'regenerative', label: 'Niche-driven repair',
    drivenBy: ['stem-cell-rejuvenation', 'autophagy', 'dna-repair'],
    blockedBy: ['sasp', 'cellular-senescence'],
    mechanism: 'Injury or systemic signals activate resident progenitors; heterochronic experiments show that part of the age-associated decline in this response is imposed by the systemic environment rather than fixed in the cell.',
    reversibility: 'reversible',
    honesty: 'simplified',
    caveat: 'Documented across compartments, but the identity of the responsible systemic factors is contested and individual candidates have a difficult replication history.',
  },
  {
    id: 'regenerative-to-healthy', from: 'regenerative', to: 'healthy', label: 'Repair completion',
    drivenBy: ['autophagy', 'dna-repair'],
    blockedBy: ['mitochondrial-dysfunction'],
    mechanism: 'Proliferation stops on niche saturation and the cell resumes differentiated function. Failure to exit at this point is the difference between regeneration and hyperplasia.',
    reversibility: 'reversible',
    honesty: 'simplified',
    caveat: 'The exit signal is tissue-specific and poorly characterised in most compartments.',
  },
  {
    id: 'senescent-to-cancer', from: 'senescent', to: 'cancer', label: 'Paracrine transformation of neighbours',
    drivenBy: ['sasp'],
    blockedBy: ['immune-surveillance'],
    mechanism: 'The senescent cell itself is arrested. Its secretome supplies growth factors and proteases that favour transformation of NEIGHBOURING cells — the transition is paracrine, not cell-autonomous.',
    reversibility: 'irreversible',
    honesty: 'simplified',
    caveat: 'Modelled as a state transition for tractability, but the cell that becomes cancerous is NOT the senescent cell. Reading this edge as senescent-cell escape would be wrong.',
  },
];

const BY_STATE = new Map<CellState, StateTransition[]>();
for (const t of STATE_TRANSITIONS) BY_STATE.set(t.from, [...(BY_STATE.get(t.from) ?? []), t]);

export function transitionsFrom(state: CellState): StateTransition[] {
  return BY_STATE.get(state) ?? [];
}

export function transitionsInto(state: CellState): StateTransition[] {
  return STATE_TRANSITIONS.filter((t) => t.to === state);
}

export interface TransitionPressure {
  transition: StateTransition;
  /**
   * Net pressure on this transition given a set of mechanism movements.
   * Positive = the perturbation favours the transition; negative = opposes it.
   * DIRECTION AND COUNT ONLY — the graph holds no magnitudes, so this is not a rate.
   */
  pressure: number;
  driversMoved: { mechanism: StateInfluence; label: string; direction: 'up' | 'down'; effect: 'favours' | 'opposes' }[];
  blockersMoved: { mechanism: StateInfluence; label: string; direction: 'up' | 'down'; effect: 'favours' | 'opposes' }[];
  reasoning: string[];
}

/**
 * Given a set of mechanism movements, compute which transitions become more or
 * less favoured. A driver moving up favours the transition; a BLOCKER moving up
 * opposes it. That sign flip on blockers is what makes the model useful — it is
 * how "removing senescence" shows up as pressure toward cancer.
 */
export function transitionPressure(movements: Map<StateInfluence, 'up' | 'down'>): TransitionPressure[] {
  const out: TransitionPressure[] = [];

  for (const transition of STATE_TRANSITIONS) {
    const driversMoved: TransitionPressure['driversMoved'] = [];
    const blockersMoved: TransitionPressure['blockersMoved'] = [];
    let pressure = 0;

    for (const mechanism of transition.drivenBy) {
      const direction = movements.get(mechanism);
      if (!direction) continue;
      const effect = direction === 'up' ? 'favours' : 'opposes';
      pressure += direction === 'up' ? 1 : -1;
      driversMoved.push({ mechanism, label: getNode(mechanism)?.label ?? mechanism, direction, effect });
    }
    for (const mechanism of transition.blockedBy) {
      const direction = movements.get(mechanism);
      if (!direction) continue;
      // A blocker rising OPPOSES the transition — the sign is inverted.
      const effect = direction === 'up' ? 'opposes' : 'favours';
      pressure += direction === 'up' ? -1 : 1;
      blockersMoved.push({ mechanism, label: getNode(mechanism)?.label ?? mechanism, direction, effect });
    }

    if (driversMoved.length === 0 && blockersMoved.length === 0) continue;

    const reasoning = [
      `Transition: ${CELL_STATES[transition.from].label} → ${CELL_STATES[transition.to].label} (${transition.label}).`,
      ...driversMoved.map((d) => `${d.label} moves ${d.direction}; it DRIVES this transition, so the movement ${d.effect} it.`),
      ...blockersMoved.map((b) => `${b.label} moves ${b.direction}; it BLOCKS this transition, so the movement ${b.effect} it.`),
      `Net pressure ${pressure > 0 ? '+' : ''}${pressure}: the perturbation ${pressure > 0 ? 'favours' : pressure < 0 ? 'opposes' : 'does not clearly move'} this transition.`,
      'Counts of documented influences only. No rate, no probability and no timescale is implied.',
    ];

    out.push({ transition, pressure, driversMoved, blockersMoved, reasoning });
  }

  return out.sort((a, b) => Math.abs(b.pressure) - Math.abs(a.pressure) || b.pressure - a.pressure);
}

/** Transitions that lead somewhere undesirable and are being favoured — the warning list. */
export function adverseTransitions(pressures: TransitionPressure[]): TransitionPressure[] {
  return pressures.filter((p) => p.pressure > 0 && !CELL_STATES[p.transition.to].desirable);
}

/** Transitions toward a desirable state that are being favoured. */
export function beneficialTransitions(pressures: TransitionPressure[]): TransitionPressure[] {
  return pressures.filter((p) => p.pressure > 0 && CELL_STATES[p.transition.to].desirable);
}
