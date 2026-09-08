import { entityId } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  CHEMISTRY_KINETICS_DOMAIN_ID,
  CHEMISTRY_KINETICS_SOLVER_ID,
  DEMO_ACTIVATION_ENERGY_KJ,
  buildChemistryExperimentWorld,
  makeChemistryKineticsSolver,
} from '../worldModel/domains/chemistryKinetics';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE SECOND `WorldLeverCatalog` — proving the discovery-from-a-sentence
 * contract (`worldGoalIntent.ts`) is genuinely domain-generic, not something
 * that happened to work once for the flood city.
 *
 * Built on the real, already-validated Arrhenius kinetics ECS domain
 * (`worldModel/domains/chemistryKinetics.ts` — see
 * `__tests__/worldModelChemistryDomain.test.ts`): one substance entity, one
 * `DomainSolver` computing k(T) from a real `ModelGraph`, decayed each tick
 * by the exact analytic solution of dC/dt = -kC. No new chemistry is
 * invented here — this file only declares which of that world's real,
 * already-mutable fields (`physics.temperatureK`, `chemical.activationEnergyKJ`)
 * an operator could plausibly turn into a lever, the same way
 * `GENESIS_FLOOD_LEVERS` declares the flood city's.
 *
 * Only `import type` is taken from `./worldGoalIntent` — this module holds no
 * runtime reference to it, so `worldGoalIntent.ts` can safely import the
 * concrete catalog below without a circular value dependency.
 */
export const CHEMISTRY_LEVER_CATALOG_VERSION = '1.0.0';

/**
 * Stable, deterministic ids (see `entityId`: a pure `${kind}:${id}` format,
 * not dependent on any graph state) — computed once here so `buildWorld` and
 * `entityIdForMetric` always agree on the same entity, exactly as the flood
 * catalog's constants do.
 */
export const GENESIS_CHEMISTRY_LAB_ID = entityId({ kind: 'lab', id: 'genesis-chem-lab' });
export const GENESIS_CHEMISTRY_SUBSTANCE_ID = entityId({ kind: 'substance', id: 'genesis-chem-substance' });

/** The world's starting temperature before any lever runs — ordinary room-ish conditions. */
const AMBIENT_TEMPERATURE_K = 300;
/** The "full strength" (`strength = 1`) heating-lever temperature. */
const ELEVATED_TEMPERATURE_K = 900;
/** The "full strength" (`strength = 1`) catalysed activation energy — a real catalyst lowers Ea; this is a declared, not measured, illustrative value, same honesty rule as `DEMO_ACTIVATION_ENERGY_KJ` itself. */
const CATALYZED_ACTIVATION_ENERGY_KJ = 60;

/** The relation a criterion needs to express "move this metric in the wanted direction" — duplicated from `worldGoalIntent.ts` rather than imported, since importing a value from there would create the circular dependency this file is written to avoid. */
function relationFor(direction: 'minimize' | 'maximize'): 'less-than' | 'greater-than' {
  return direction === 'minimize' ? 'less-than' : 'greater-than';
}

/** Interpolates one substance field from `baseValue` (strength 0) to `fullValue` (strength 1) — same shape as the flood catalog's `floodplainLever`. */
function temperatureLever(fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const substance = graph.getEntity(GENESIS_CHEMISTRY_SUBSTANCE_ID);
    graph.updateEntity(substance.id, {
      physics: { ...substance.physics, massKg: substance.physics?.massKg ?? 1, temperatureK: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

function activationEnergyLever(fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const substance = graph.getEntity(GENESIS_CHEMISTRY_SUBSTANCE_ID);
    graph.updateEntity(substance.id, {
      chemical: { ...substance.chemical, activationEnergyKJ: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/**
 * A real, honest negative control: `makeChemistryKineticsSolver` never reads
 * `physics.massKg` — first-order decay is a FRACTION of whatever is present,
 * so scaling up the sample quantity cannot move `concentrationFraction` in
 * this model. Declared as a lever anyway (a plausible-sounding mechanism —
 * "more substance decays slower" is a real intuition people have) so the
 * catalogue has a genuinely falsifiable competing hypothesis, the same role
 * the flood city's `lever:outlet-capacity` plays there.
 */
function sampleQuantityLever(fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const substance = graph.getEntity(GENESIS_CHEMISTRY_SUBSTANCE_ID);
    graph.updateEntity(substance.id, {
      physics: { ...substance.physics, massKg: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

/**
 * The levers this chemistry world actually has. Both are real, already-read
 * inputs to the Arrhenius rate constant k(T) = A·exp(-Ea/RT) that
 * `chemistryKinetics.ts`'s solver computes every tick — this file adds no
 * new mechanism, it only exposes the two of that equation's own terms an
 * operator could plausibly act on (raise T; lower Ea via a catalyst).
 */
export const GENESIS_CHEMISTRY_LEVERS: readonly WorldLever[] = [
  // Declared first, same as the flood catalog's own `lever:outlet-capacity`: a
  // plausible-sounding mechanism the model actually falsifies, so a search over
  // "every declared lever" meets a real refutation before it meets a winner.
  {
    leverId: 'lever:sample-quantity',
    phrases: ['sample size', 'sample quantity', 'more substance', 'amount of substance', 'ilość próbki', 'ilosc probki', 'ilość substancji', 'ilosc substancji'],
    targetEntityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:sample-quantity',
      statement: `Substance decay is limited by how much substance is present, so a larger sample ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'increasing sample quantity',
      entityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'A first-order rate law acts on whatever fraction is present, so quantity should not change the fraction remaining — a testable, falsifiable claim.',
      },
      apply: sampleQuantityLever(5, 1),
      rationale: 'Sample mass is a real, mutable field on this entity — worth testing even though first-order kinetics predicts no effect.',
    }),
  },
  {
    leverId: 'lever:temperature',
    phrases: ['temperature', 'heat', 'heating', 'temperatura', 'podgrzew', 'ogrzew', 'ciepło', 'cieplo'],
    targetEntityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:temperature',
      statement: `Substance decay is controlled by temperature, so heating it ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'raising substance temperature',
      entityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'The Arrhenius rate constant k(T) rises with temperature, so a hotter substance decays faster.',
      },
      apply: temperatureLever(ELEVATED_TEMPERATURE_K, AMBIENT_TEMPERATURE_K),
      rationale: 'Temperature is the Arrhenius model’s own rate-controlling input, read fresh every tick.',
    }),
  },
  {
    leverId: 'lever:catalyst',
    phrases: ['catalyst', 'catalysis', 'catalyzer', 'katalizator', 'katalizy', 'katalizatora'],
    targetEntityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:catalyst',
      statement: `Substance decay is limited by activation energy, so a catalyst ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: 'lowering activation energy via a catalyst',
      entityId: GENESIS_CHEMISTRY_SUBSTANCE_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'A catalyst opens a lower-energy pathway, raising k(T) at the same temperature.',
      },
      apply: activationEnergyLever(CATALYZED_ACTIVATION_ENERGY_KJ, DEMO_ACTIVATION_ENERGY_KJ),
      rationale: 'Activation energy is the Arrhenius model’s own barrier term, read fresh every tick.',
    }),
  },
];

export const GENESIS_CHEMISTRY_KINETICS_CATALOG_ID = 'genesis-chemistry-kinetics';

function buildGenesisChemistryKineticsWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const world = buildChemistryExperimentWorld({
    labId: 'genesis-chem-lab',
    substanceId: 'genesis-chem-substance',
    initialTemperatureK: AMBIENT_TEMPERATURE_K,
  });
  const router = new SolverRouter();
  router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
  const updater: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);
  return { graph: world.graph, updater };
}

export const GENESIS_CHEMISTRY_KINETICS_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_CHEMISTRY_KINETICS_CATALOG_ID,
  worldId: 'genesis-chemistry-kinetics-lab',
  domainId: CHEMISTRY_KINETICS_DOMAIN_ID,
  buildWorld: buildGenesisChemistryKineticsWorld,
  metricPhrases: {
    'remaining concentration': 'concentrationFraction',
    'concentration remaining': 'concentrationFraction',
    'substance remaining': 'concentrationFraction',
    concentration: 'concentrationFraction',
    'stężenie substancji': 'concentrationFraction',
    'stezenie substancji': 'concentrationFraction',
    'pozostała ilość': 'concentrationFraction',
    'pozostala ilosc': 'concentrationFraction',
    stężenie: 'concentrationFraction',
    stezenie: 'concentrationFraction',
  },
  entityIdForMetric: {
    concentrationFraction: GENESIS_CHEMISTRY_SUBSTANCE_ID,
  },
  levers: GENESIS_CHEMISTRY_LEVERS,
  decisionAtTick: 1,
  horizonTick: 24,
  dt: 3600,
  declaredAssumptions: [
    'Demo substance kinetics (activation energy, pre-exponential factor) are illustrative constants, not measured data for a real compound',
    'The Arrhenius rate constant k(T) is computed by a documented `simplified` ModelGraph node — disclosed as MODEL_ESTIMATE, never GROUNDED_EXACT',
    'First-order decay only: dC/dt = -k·C, integrated by its exact analytic solution over each tick',
  ],
  notModelledFactors: [
    'Reverse reaction / equilibrium',
    'Concentration-dependent (non-first-order) kinetics',
    'Solvent, pressure, and any non-thermal catalytic effect beyond the declared activation-energy lever',
    'Real compound identity, safety data, or synthesis feasibility',
  ],
};
