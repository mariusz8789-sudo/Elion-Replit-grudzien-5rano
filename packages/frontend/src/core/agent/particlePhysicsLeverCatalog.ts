import { entityId } from '../worldModel/ecs/types';
import { WorldGraph } from '../worldModel/ecs/worldGraph';
import {
  addColliderRun,
  COLLIDER_DEFAULTS,
  makeParticleColliderSolver,
  PARTICLE_PHYSICS_SOLVER_ID,
  Z_MASS_MEV,
} from '../worldModel/domains/particlePhysics';
import { SolverRouter } from '../worldModel/solvers/solverRouter';
import type { TemporalUpdater } from '../worldModel/temporal/temporalEngine';
import { relationFor } from './leverCriterion';
import type { WorldLever, WorldLeverCatalog } from './worldGoalIntent';

/**
 * THE DISCOVERY ENGINE ON PARTICLE PHYSICS — the seventh domain on the
 * WorldGraph substrate, after flood, chemistry, epidemiology, cell biology,
 * electrical engineering and rainfall-runoff.
 *
 * This catalogue is the integration surface for the Qwen "Particle Physics
 * Laboratory" proposal: its real kinematics and PDG constants live in
 * `domains/particlePhysics.ts`, and everything it proposed to BUILD ALONGSIDE
 * Genesis — a second world engine, a second state machine, a second Matrix,
 * Memory, Replay, Chat and renderer — was rejected as duplication. What reaches
 * the user instead is this: a real question, run by the DISCOVERY LOOP THAT
 * ALREADY EXISTS, producing a real Evidence Bundle in the Scientific Memory
 * that already exists, replayable by the replay that already exists, and
 * presentable on `EvidenceShowcaseScreen.tsx` with no new screen at all.
 *
 * ## The question, and why it is a real one
 *
 * A collider run is counting di-muon candidates around the Z pole. The operator
 * has four knobs, and the honest, non-obvious scientific content is that they
 * do NOT all do the same thing to the same figure of merit:
 *
 *  - Beam energy moves the real Breit-Wigner line shape. Detuning off the pole
 *    costs signal and nothing else, so it moves BOTH purity and significance.
 *  - Momentum resolution narrows the reconstructed peak, so more of the signal
 *    lands inside a FIXED mass window while the flat background inside that
 *    window does not change. It moves purity.
 *  - Acceptance and luminosity scale signal and background by exactly the same
 *    factor. They cannot move S/B AT ALL — that is not a modelling gap, it is
 *    the arithmetic of a ratio — while they do move S/sqrt(B).
 *
 * So a goal phrased about PURITY and a goal phrased about SIGNIFICANCE have
 * genuinely different answers on the same apparatus. That is a discovery worth
 * running a loop for, and the two levers that come out inert against S/B are
 * inert for a stated statistical reason, in the same spirit as the generator
 * catalogue's nameplate and tank levers.
 */

export const GENESIS_COLLIDER_ID = entityId({ kind: 'collider-run', id: 'collider-1' });

export const GENESIS_PARTICLE_PHYSICS_CATALOG_ID = 'genesis-particle-collider';

/** One tick is a ten-minute block of stable beam, in the seconds the engine counts in. */
const COLLIDER_DT_SECONDS = 600;

/** Two blocks in: the run is established and every arm has the same head start. */
const COLLIDER_DECISION_TICK = 2;

/**
 * Thirty blocks — five hours of stable beam. Long enough that the accumulated
 * background is far above the S/sqrt(B) validity floor (B >> 1) at every arm,
 * and short enough that no arm has saturated anything: yields here accumulate
 * linearly forever, so there is no clamp to hide behind.
 */
const COLLIDER_HORIZON_TICK = 30;

/** Tuning the machine onto the PDG Z pole, from a detuned 89.0 GeV start. */
const ON_PEAK_SQRT_S_MEV = Z_MASS_MEV;
/** 2% -> 0.5% per-track momentum resolution: a real upgrade, the scale of a silicon tracker replacement. */
const IMPROVED_MOMENTUM_RESOLUTION = 0.005;
/** |eta| 2.0 -> 2.5: extending tracking coverage forward, a real detector upgrade. */
const WIDER_ACCEPTANCE_ETA = 2.5;
/** 4x the luminosity per block: a real machine upgrade, and a real test of what more data can and cannot buy. */
const HIGHER_LUMINOSITY = 4;

/**
 * Builds a fresh collider run plus the updater that advances it — `SolverRouter.routeTick`
 * bound to the real particle solver, the same construction every other lever catalogue uses.
 * The run starts DETUNED (89.0 GeV, about 2.2 GeV below the pole) so that tuning onto
 * resonance is something the loop can actually discover rather than something handed to it.
 */
export function buildColliderDiscoveryWorld(): { graph: WorldGraph; updater: TemporalUpdater } {
  const graph = new WorldGraph();
  addColliderRun(graph);
  const router = new SolverRouter();
  router.register(PARTICLE_PHYSICS_SOLVER_ID, makeParticleColliderSolver());
  const updater: TemporalUpdater = (g, dtSeconds, tick) => router.routeTick(g, dtSeconds, tick);
  return { graph, updater };
}

/** Scales one collider parameter from its baseline to a declared full value. */
function colliderParamLever(key: string, fullValue: number, baseValue: number) {
  return (graph: WorldGraph, strength: number) => {
    const collider = graph.getEntity(GENESIS_COLLIDER_ID)!;
    graph.updateEntity(collider.id, {
      domainState: { ...collider.domainState, [key]: baseValue + (fullValue - baseValue) * strength },
    });
  };
}

export const GENESIS_PARTICLE_PHYSICS_LEVERS: readonly WorldLever[] = [
  {
    leverId: 'lever:beam-energy',
    phrases: ['beam energy', 'energy', 'tune', 'resonance', 'on peak', 'centre of mass', 'center of mass', 'energia', 'strojen', 'rezonans'],
    targetEntityId: GENESIS_COLLIDER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:beam-energy',
      statement: `Candidate yield is set by where the beam energy sits on the resonance, so tuning to the ${(ON_PEAK_SQRT_S_MEV / 1000).toFixed(4)} GeV pole ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `tuning the centre-of-mass energy onto the ${(ON_PEAK_SQRT_S_MEV / 1000).toFixed(4)} GeV resonance pole`,
      entityId: GENESIS_COLLIDER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'The Breit-Wigner line shape is steep near the pole, so a couple of GeV of detuning changes production by a large factor while the flat background is unchanged.',
      },
      apply: colliderParamLever('sqrtSMeV', ON_PEAK_SQRT_S_MEV, COLLIDER_DEFAULTS.sqrtSMeV),
      rationale: 'Centre-of-mass energy is the real machine parameter the relativistic Breit-Wigner shape is evaluated at, not a label on the run.',
    }),
  },
  {
    leverId: 'lever:detector-resolution',
    phrases: ['resolution', 'momentum resolution', 'tracker', 'tracking', 'rozdzielcz', 'detektor'],
    targetEntityId: GENESIS_COLLIDER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:detector-resolution',
      statement: `The mass window keeps a fixed width, so sharpening momentum resolution to ${(IMPROVED_MOMENTUM_RESOLUTION * 100).toFixed(1)}% ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `sharpening per-track momentum resolution to ${(IMPROVED_MOMENTUM_RESOLUTION * 100).toFixed(1)}%`,
      entityId: GENESIS_COLLIDER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'A narrower reconstructed peak puts more signal inside the same fixed mass window, while the flat continuum inside that window is unchanged.',
      },
      apply: colliderParamLever('momentumResolutionRel', IMPROVED_MOMENTUM_RESOLUTION, COLLIDER_DEFAULTS.momentumResolutionRel),
      rationale: 'Momentum resolution is a real detector parameter and it enters the yield through a real Gaussian window integral, not a fudge factor.',
    }),
  },
  {
    leverId: 'lever:acceptance',
    phrases: ['acceptance', 'coverage', 'eta', 'forward', 'akceptacj', 'pokryci'],
    targetEntityId: GENESIS_COLLIDER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:acceptance',
      statement: `Extending tracking coverage to |eta| < ${WIDER_ACCEPTANCE_ETA} accepts more pairs, so it ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `extending tracking acceptance to |eta| < ${WIDER_ACCEPTANCE_ETA}`,
      entityId: GENESIS_COLLIDER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'Wider solid-angle coverage accepts more candidate pairs; whether that helps depends on whether the metric is a ratio, which is exactly what this tests.',
      },
      apply: colliderParamLever('acceptanceEtaMax', WIDER_ACCEPTANCE_ETA, COLLIDER_DEFAULTS.acceptanceEtaMax),
      rationale: 'Geometric acceptance is a real detector parameter entering as tanh(etaMax) for an isotropic decay — and it multiplies signal and background identically, which is a real fact about it, not an omission.',
    }),
  },
  {
    leverId: 'lever:luminosity',
    phrases: ['luminosity', 'more data', 'statistics', 'run longer', 'świetlnoś', 'swietlnos', 'luminozj', 'więcej danych', 'wiecej danych'],
    targetEntityId: GENESIS_COLLIDER_ID,
    hypothesis: (metric, direction) => ({
      hypothesisId: 'h:luminosity',
      statement: `Delivering ${HIGHER_LUMINOSITY}x the luminosity per block collects proportionally more candidates, so it ${direction === 'minimize' ? 'lowers' : 'raises'} "${metric}".`,
      mechanism: `delivering ${HIGHER_LUMINOSITY}x the luminosity per beam block`,
      entityId: GENESIS_COLLIDER_ID,
      criterion: {
        metric,
        relation: relationFor(direction),
        rationale: 'More luminosity is more of everything: whether that moves the metric depends on whether the metric is a ratio of two things that both scale, which is what this tests.',
      },
      apply: colliderParamLever('luminosityPerTick', HIGHER_LUMINOSITY, COLLIDER_DEFAULTS.luminosityPerTick),
      rationale: 'Luminosity is the real machine parameter both yields are proportional to — so it is decisive for a count and provably inert for a ratio, and the loop should be able to find that out.',
    }),
  },
];

/** The metric this world's goals are normally about: purity of the candidate sample. */
export const GENESIS_PARTICLE_PHYSICS_OBJECTIVE_METRIC = 'signalToBackground';

export const GENESIS_PARTICLE_PHYSICS_CATALOG: WorldLeverCatalog = {
  catalogId: GENESIS_PARTICLE_PHYSICS_CATALOG_ID,
  worldId: 'genesis-particle-collider',
  domainId: 'particle-physics',
  buildWorld: buildColliderDiscoveryWorld,
  metricPhrases: {
    'signal to background': 'signalToBackground',
    'signal-to-background': 'signalToBackground',
    'purity': 'signalToBackground',
    'czystoś': 'signalToBackground',
    'czystos': 'signalToBackground',
    'stosunek sygnału': 'signalToBackground',
    'significance': 'significance',
    'discovery significance': 'significance',
    'istotnoś': 'significance',
    'istotnos': 'significance',
    'candidates': 'signalCandidates',
    'signal candidates': 'signalCandidates',
    'kandydat': 'signalCandidates',
    'background': 'backgroundCandidates',
    'tło': 'backgroundCandidates',
    'tlo': 'backgroundCandidates',
  },
  entityIdForMetric: {
    signalToBackground: GENESIS_COLLIDER_ID,
    significance: GENESIS_COLLIDER_ID,
    signalCandidates: GENESIS_COLLIDER_ID,
    backgroundCandidates: GENESIS_COLLIDER_ID,
  },
  levers: GENESIS_PARTICLE_PHYSICS_LEVERS,
  decisionAtTick: COLLIDER_DECISION_TICK,
  horizonTick: COLLIDER_HORIZON_TICK,
  dt: COLLIDER_DT_SECONDS,
  declaredAssumptions: [
    'Yields are in arbitrary normalised units, NOT picobarn cross-sections — only ratios between arms are meaningful',
    'Background is a declared flat continuum under the peak, never fitted to data',
    'Z mass and width are PDG published values (REFERENCE), not a measurement made here',
    'Detector response is one Gaussian momentum resolution and one flat efficiency inside a hard |eta| edge',
  ],
  notModelledFactors: [
    'Initial-state radiation and beam energy spread',
    'Pile-up, trigger efficiency and dead time',
    'Systematic uncertainties — every verdict here is statistical only',
    'Cost and schedule of any detector or machine upgrade',
  ],
};
