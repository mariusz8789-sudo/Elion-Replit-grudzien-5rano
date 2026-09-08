import type { InquiryLoopInput, ParameterHypothesis, SystemUnderStudy } from './inquiryLoop';

/**
 * PHYSICS ON THE EXPERIMENT FABRIC — a tunnel junction whose barrier nobody has
 * measured.
 *
 * ## Why this is here and not a WorldGraph lever catalogue
 *
 * `domains/quantumTunneling.ts` was named for the WorldGraph substrate, and it
 * does not belong there. Its own module doc says `runScenario` is "a pure,
 * deterministic function of four plain numbers" and caches it because the
 * result "cannot have changed" — and that is exactly what a measurement on a
 * real `TemporalEngine` shows: transmission is BIT-IDENTICAL at tick 1, tick 2,
 * tick 10 and tick 40. Fork mid-run and change the barrier and you get one step
 * and then a flat line forever.
 *
 * By the checklist in `docs/TWO_AUTONOMOUS_LOOPS_DECISION.md` that is a no at
 * line 1 (nothing evolves), a no at line 3 (one entity, no cascades) and a yes
 * at line 6 (a pure function of its inputs). A WorldGraph catalogue for it would
 * run and produce correct numbers and be a lie of structure. So the junction is
 * modelled as what it is: a PARAMETER question, on the Fabric's own
 * `quantum-tunneling-1d`, driven by `inquiryLoop`. See §7.2 of that document.
 *
 * ## The science, and why choosing the next experiment is a real problem here
 *
 * A tunnel junction is characterised by a barrier HEIGHT and a barrier WIDTH,
 * and an experiment measures neither — it measures transmission. The two trade
 * off: a tall thin barrier and a low broad one can transmit almost identically.
 * Worse, the degeneracy is energy-dependent in a way that matters
 * operationally. MEASURED on the real split-step Fourier integrator, the four
 * junctions below transmit
 *
 *     at E = 1.3   0.6097  0.6135  0.6173  0.6583     — a 7.4% spread
 *     at E = 0.3   2.7e-4  1.5e-3  5.5e-3  1.1e-2     — a 40x spread
 *
 * Well above the barrier everything transmits and every junction looks the
 * same; the exponential sensitivity to height and width only appears deep in
 * the tunnelling regime. That is the real reason tunnelling spectroscopy is
 * done at low bias, and it makes "which energy should I measure at next" a
 * genuine question rather than a formality.
 *
 * ## What this file is not
 *
 * It is not a model of any real junction, tip, sample or instrument. It is four
 * declared parameter assignments and a real solver, and the only thing the loop
 * can conclude is which of those four survives contact with that solver.
 */

export const QUANTUM_JUNCTION_SYSTEM_ID = 'quantum-tunnel-junction';

/** The Fabric model this inquiry runs on. Real, already registered, already backend-executable. */
export const QUANTUM_JUNCTION_MODEL_ID = 'quantum-tunneling-1d';

/**
 * The four candidate junctions, spanning the runner's own validated ranges
 * (barrier 0.4-2.5, width 1-8). Chosen so that they are nearly indistinguishable
 * at high incident energy and strongly separable at low energy — which is a
 * property of the physics, verified by measurement, not an arrangement.
 */
export const QUANTUM_JUNCTION_CANDIDATES = [
  { id: 'h:thin-tall', barrier: 2.2, width: 1.6, description: 'a tall, thin barrier' },
  { id: 'h:mid-narrow', barrier: 1.8, width: 1.8, description: 'a fairly tall, narrow barrier' },
  { id: 'h:mid-wide', barrier: 1.2, width: 2.5, description: 'a moderate, wider barrier' },
  { id: 'h:low-broad', barrier: 0.8, width: 4.0, description: 'a low, broad barrier' },
] as const;

export const QUANTUM_JUNCTION_HYPOTHESES: readonly ParameterHypothesis[] = QUANTUM_JUNCTION_CANDIDATES.map((c) => ({
  hypothesisId: c.id,
  statement: `This junction is ${c.description}: barrier ${c.barrier}, width ${c.width} (natural units).`,
  claimedValues: { barrier: c.barrier, width: c.width },
  // Equal priors: nothing has been measured, and inventing a preference between
  // four declared candidates would be belief the caller never committed to.
  priorConfidence: 0.5,
}));

/**
 * Incident energies the instrument can actually set, high to low.
 *
 * Ordered high-to-low because that is the order the loop scans them in, and
 * because it makes the loop's refusals honest: if a high energy would already
 * separate the survivors, there is no reason to make it reach for a low-bias
 * measurement that is harder to take. All lie inside the runner's validated
 * 0.2-1.6 range.
 */
export const QUANTUM_PROBE_ENERGIES: readonly number[] = [1.3, 1.0, 0.8, 0.55, 0.4, 0.3, 0.2];

/**
 * The declared opening measurement: E = 1.3, above every candidate barrier.
 *
 * Deliberately the LEAST informative energy in the list. It is what an
 * instrument reaches for first — a strong, easy, high-current measurement — and
 * measured, it separates nothing: all four junctions transmit between 0.6097
 * and 0.6583, inside any reasonable agreement band. The inquiry therefore has
 * to earn its answer with a second, harder measurement, and which one it
 * reaches for is decided by what this one returned.
 */
export const QUANTUM_OPENING_ENERGY = 1.3;

/**
 * The declared agreement band, +/-25%.
 *
 * A property of the measurement, not of this module: it stands in for the
 * combined current-noise and calibration uncertainty of a junction measurement.
 * Stated here rather than buried because it is what decides falsification, and
 * a tighter band would falsify more aggressively on the same real data.
 */
export const QUANTUM_AGREEMENT_TOLERANCE = 0.25;

/**
 * Builds the system under study for one real junction.
 *
 * `hiddenParameters` are the junction actually on the instrument — a fact about
 * this sample, supplied by whoever set the inquiry up, never read by hypothesis
 * selection or belief revision. `inquiryLoop` enforces that with the type
 * system (`ObservableSystem`), not with a comment.
 */
export function quantumJunctionSystem(barrier: number, width: number, systemId = QUANTUM_JUNCTION_SYSTEM_ID): SystemUnderStudy {
  return {
    systemId,
    label: `Tunnel junction (barrier and width not yet measured)`,
    modelId: QUANTUM_JUNCTION_MODEL_ID,
    hiddenParameters: { barrier, width },
    probeParameterId: 'energy',
    candidateProbeValues: QUANTUM_PROBE_ENERGIES,
    fixedParameters: {},
    observedMetric: 'transmission',
    agreementTolerance: QUANTUM_AGREEMENT_TOLERANCE,
  };
}

/** The whole inquiry, ready to hand to `runAutonomousInquiry` or `runInquiryAndRemember`. */
export function quantumJunctionInquiry(barrier: number, width: number, maxRounds = 4): InquiryLoopInput {
  return {
    question: 'What barrier height and width does this tunnel junction have?',
    system: quantumJunctionSystem(barrier, width),
    hypotheses: QUANTUM_JUNCTION_HYPOTHESES,
    openingProbeValue: QUANTUM_OPENING_ENERGY,
    maxRounds,
  };
}

/**
 * What this inquiry cannot answer, carried alongside it so a caller reporting a
 * result has the limits in hand rather than having to remember them.
 *
 * `inquiryLoop` already emits its own model-scoped limitations; these are the
 * ones specific to reading a 1D tunnelling calculation as a statement about a
 * junction.
 */
export const QUANTUM_JUNCTION_NOT_MODELLED: readonly string[] = [
  'One dimension, one particle, natural units (h-bar = m = 1), a rectangular barrier and absorbing edges — a real junction is none of those things',
  'Transmission here is the fraction of the packet past the barrier after a FINITE evolution (1200 frames of dt=0.02), not the asymptotic transmission coefficient of scattering theory',
  'No tip, no sample, no surface states, no image-potential lowering, no inelastic channels and no temperature',
  'No current: a real instrument measures current at a bias, and converting transmission to current needs a density of states this model does not have',
  'Only the four declared junctions were ever in contention — the inquiry cannot find a barrier nobody proposed',
];
