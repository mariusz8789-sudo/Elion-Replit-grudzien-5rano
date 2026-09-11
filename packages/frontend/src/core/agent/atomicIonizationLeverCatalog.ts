import { entityId } from '../worldModel/ecs/types';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  addIonizationChamber,
  ATOMIC_IONIZATION_SOLVER_ID,
  IONIZATION_DEFAULTS,
  IONIZATION_PEAK_ENERGY_EV,
  makeAtomicIonizationSolver,
} from '../worldModel/domains/atomicIonization';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE ATOMIC LAB — the second environment of the Genesis Particle & Atomic
 * Physics Laboratory, run by the SAME Discovery Loop as the collider.
 *
 * The collider catalogue next door taught a monotone lesson: tune onto the
 * resonance and everything improves. This apparatus deliberately teaches the
 * opposite one, and it is the real reason this environment exists rather than
 * being a relabelled collider:
 *
 * ## The energy lever has NO fixed sign
 *
 * The Lotz electron-impact ionisation cross-section is zero below 13.606 eV,
 * rises to a maximum near 55 eV, and then FALLS like ln(E)/E. So two arms that
 * both "raise the beam energy" reach opposite verdicts:
 *
 *  - tuning to the 55 eV peak RAISES the ion yield;
 *  - the naive jump to 300 eV LOWERS it, by roughly a factor of two.
 *
 * A loop that has learned "more energy is better" from the collider gets that
 * hypothesis falsified here, by real published physics rather than by a
 * modelling gap. That is the whole point of running a laboratory with more than
 * one environment in it.
 *
 * ## And the density lever saturates
 *
 * Interaction probability is Beer-Lambert, 1 - exp(-n*sigma*L), so the density
 * knob buys less and less. It also enters ONLY through the product n*sigma*L,
 * which makes it and the path-length knob provably the same knob — checked by
 * test in `particlePhysicsDomain.test.ts` rather than claimed here.
 */

export const GENESIS_IONIZATION_CHAMBER_ID = entityId({ kind: 'ionization-chamber', id: 'chamber-1' });

export const GENESIS_ATOMIC_IONIZATION_CATALOG_ID = 'genesis-atomic-ionization';

/** One tick is one second of delivered beam. */
const IONIZATION_DT_SECONDS = 1;

/** Two seconds in: the chamber has settled and every arm has the same head start. */
const IONIZATION_DECISION_TICK = 2;

/**
 * Thirty seconds of beam. Long enough that the accumulated background is far
 * above the S/sqrt(B) validity floor (B >> 1) on every arm, and short enough
 * that no arm has run the target gas down — nothing here depletes, so there is
 * no clamp for a verdict to hide behind.
 */
const IONIZATION_HORIZON_TICK = 30;

/** The naive intervention: turn the beam energy well up, past the cross-section peak. */
const NAIVE_HIGH_BEAM_ENERGY_EV = 300;
/** A hundredfold denser target gas — a real vacuum-system change, and it saturates. */
const HIGHER_TARGET_DENSITY_PER_CM3 = 1e15;
/** 80% -> 98% ion collection: a real electrode and field-cage upgrade. */
const IMPROVED_COLLECTION_EFFICIENCY = 0.98;

/**
 * Builds a fresh ionisation chamber plus the updater that advances it —
 * `SolverRouter.routeTick` bound to the real atomic solver, the same
 * construction every other lever catalogue in this repository uses.
 *
 * The chamber starts at 30 eV: above the ionisation threshold, but BELOW the
 * cross-section peak, so the direction of the energy lever is a genuinely open
 * question the loop has to settle rather than one handed to it.
 */
export function buildIonizationDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const graph = new WorldGraph();
  addIonizationChamber(graph);
  const router = new SolverRouter();
  router.register(ATOMIC_IONIZATION_SOLVER_ID, makeAtomicIonizationSolver());
  const updater: TemporalUpdater = (g, dtSeconds, tick) => router.routeTick(g, dtSeconds, tick);
  return { graph, updater };
}

/** Scales one chamber parameter from its baseline to a declared full value. */
function chamberParamLever(key: string, fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const chamber = graph.getEntity(GENESIS_IONIZATION_CHAMBER_ID)!;
    graph.updateEntity(chamber.id, {
      domainState: { ...chamber.domainState, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

export const GENESIS_ATOMIC_IONIZATION_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:tune-to-cross-section-peak',
    phrases: ['peak', 'cross section peak', 'optimum energy', 'tune', 'maximum', 'szczyt', 'maksimum', 'optymaln'],
    targetEntityId: GENESIS_IONIZATION_CHAMBER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:tune-to-cross-section-peak',
      statement: `The ionisation cross-section peaks near ${IONIZATION_PEAK_ENERGY_EV} eV, so tuning the beam there ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `tuning the electron beam to the ${IONIZATION_PEAK_ENERGY_EV} eV cross-section maximum`,
      entityId: GENESIS_IONIZATION_CHAMBER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'The Lotz cross-section rises from the 13.606 eV threshold to a maximum near 55 eV, so moving toward that maximum increases the chance each beam electron ionises an atom.',
      },
      apply: chamberParamLever('beamEnergyEV', IONIZATION_PEAK_ENERGY_EV, IONIZATION_DEFAULTS.beamEnergyEV),
      rationale: 'Beam energy is the real machine parameter the published cross-section is evaluated at, and the peak is a property of the measured data, not a tuning constant chosen here.',
    }),
  },
  {
    leverId: 'lever:raise-beam-energy',
    phrases: ['beam energy', 'higher energy', 'more energy', 'accelerate', 'energia', 'wyższa energia', 'wyzsza energia'],
    targetEntityId: GENESIS_IONIZATION_CHAMBER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:raise-beam-energy',
      statement: `Driving the beam to ${NAIVE_HIGH_BEAM_ENERGY_EV} eV gives every electron far more energy than it needs to ionise, so it ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `raising the electron beam energy to ${NAIVE_HIGH_BEAM_ENERGY_EV} eV`,
      entityId: GENESIS_IONIZATION_CHAMBER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'The intuition that a more energetic beam ionises more is exactly what this arm tests — and the measured cross-section falls like ln(E)/E above its peak, so the intuition is testable and can fail.',
      },
      apply: chamberParamLever('beamEnergyEV', NAIVE_HIGH_BEAM_ENERGY_EV, IONIZATION_DEFAULTS.beamEnergyEV),
      rationale: 'Beam energy well past the cross-section peak is a real, common experimental mistake, and this apparatus is able to prove it is one.',
    }),
  },
  {
    leverId: 'lever:target-density',
    phrases: ['density', 'target density', 'pressure', 'more gas', 'gestos', 'gęstoś', 'ciśnien', 'cisnien'],
    targetEntityId: GENESIS_IONIZATION_CHAMBER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:target-density',
      statement: `Raising the target gas density to ${HIGHER_TARGET_DENSITY_PER_CM3.toExponential(0)} atoms/cm^3 puts more atoms in the beam's way, so it ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `raising the hydrogen target density to ${HIGHER_TARGET_DENSITY_PER_CM3.toExponential(0)} atoms/cm^3`,
      entityId: GENESIS_IONIZATION_CHAMBER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Interaction probability is Beer-Lambert, 1 - exp(-n*sigma*L): denser target, more interactions — but with diminishing returns as the beam starts to be used up.',
      },
      apply: chamberParamLever('targetDensityPerCm3', HIGHER_TARGET_DENSITY_PER_CM3, IONIZATION_DEFAULTS.targetDensityPerCm3),
      rationale: 'Target density is a real chamber parameter, it enters through a real attenuation law, and the residual-gas background does not scale with it — which is why it moves purity and the other levers barely do.',
    }),
  },
  {
    leverId: 'lever:collection-efficiency',
    phrases: ['collection', 'efficiency', 'electrode', 'field cage', 'zbieran', 'wydajnoś', 'wydajnos'],
    targetEntityId: GENESIS_IONIZATION_CHAMBER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:collection-efficiency',
      statement: `Collecting ${(IMPROVED_COLLECTION_EFFICIENCY * 100).toFixed(0)}% of the ions produced instead of ${(IONIZATION_DEFAULTS.collectionEfficiency * 100).toFixed(0)}% ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `improving ion collection efficiency to ${(IMPROVED_COLLECTION_EFFICIENCY * 100).toFixed(0)}%`,
      entityId: GENESIS_IONIZATION_CHAMBER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Better collection counts more of the ions that were already produced — it multiplies the real signal and the residual-gas background by the same factor, and leaves the fixed dark rate alone.',
      },
      apply: chamberParamLever('collectionEfficiency', IMPROVED_COLLECTION_EFFICIENCY, IONIZATION_DEFAULTS.collectionEfficiency),
      rationale: 'Collection efficiency is a real electrode-geometry parameter; it is decisive for a count and nearly inert for a ratio, and the loop should be able to find that out.',
    }),
  },
];

/** The metric this world's goals are normally about: how many ions were actually counted. */
export const GENESIS_ATOMIC_IONIZATION_OBJECTIVE_METRIC = 'ionCounts';

export const GENESIS_ATOMIC_IONIZATION_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_ATOMIC_IONIZATION_CATALOG_ID,
  worldId: 'genesis-atomic-ionization',
  domainId: 'atomic-physics',
  buildWorld: buildIonizationDiscoveryWorld,
  metricPhrases: {
    'ion yield': 'ionCounts',
    'ions': 'ionCounts',
    'ion counts': 'ionCounts',
    'ionization': 'ionCounts',
    'ionisation': 'ionCounts',
    'jonizacj': 'ionCounts',
    'jony': 'ionCounts',
    'signal to background': 'ionSignalToBackground',
    'purity': 'ionSignalToBackground',
    'czystoś': 'ionSignalToBackground',
    'czystos': 'ionSignalToBackground',
    'significance': 'significance',
    'istotnoś': 'significance',
    'istotnos': 'significance',
    'cross section': 'crossSectionCm2',
    'przekrój czynny': 'crossSectionCm2',
    'przekroj czynny': 'crossSectionCm2',
    'transmission': 'beamTransmission',
    'transmisj': 'beamTransmission',
  },
  entityIdForMetric: {
    ionCounts: GENESIS_IONIZATION_CHAMBER_ID,
    ionSignalToBackground: GENESIS_IONIZATION_CHAMBER_ID,
    significance: GENESIS_IONIZATION_CHAMBER_ID,
    crossSectionCm2: GENESIS_IONIZATION_CHAMBER_ID,
    beamTransmission: GENESIS_IONIZATION_CHAMBER_ID,
  },
  levers: GENESIS_ATOMIC_IONIZATION_LEVERS,
  decisionAtTick: IONIZATION_DECISION_TICK,
  horizonTick: IONIZATION_HORIZON_TICK,
  dt: IONIZATION_DT_SECONDS,
  declaredAssumptions: [
    'Ionisation cross-section is the Lotz (1967) empirical fit to measured data for ground-state atomic hydrogen — REFERENCE physics, not computed here',
    'Beam current, residual-gas density and detector dark rate are DECLARED apparatus parameters, so only comparisons between arms of one run are meaningful',
    'Interaction probability is Beer-Lambert, so density and path length enter only through the product n*sigma*L and are the same knob',
    'Single ionisation of ground-state hydrogen only; the excitation channel is absent',
  ],
  notModelledFactors: [
    'Space charge, beam divergence and gas heating',
    'Multiple ionisation and any target species but atomic hydrogen',
    'Systematic uncertainties — every verdict here is statistical only',
    'Cost and schedule of any vacuum or electrode upgrade',
  ],
};
