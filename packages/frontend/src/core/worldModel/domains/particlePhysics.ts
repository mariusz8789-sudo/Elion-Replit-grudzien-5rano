import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * PARTICLE PHYSICS: a collider run accumulating resonance candidates.
 *
 * Adapted from the Qwen "Genesis Particle Physics Laboratory" proposal. What
 * was kept is the part that had no equivalent anywhere in this repository —
 * REAL relativistic kinematics and REAL PDG reference constants. What was
 * rejected is everything the proposal duplicated: its own `determinism.ts`
 * (this repo has `core/events/hash.ts`), its own world/accelerator/camera/
 * scene/state-machine/orchestrator stack (this repo has `WorldGraph`,
 * `TemporalEngine`, `scenarioEngine.ts` and real Three.js renderers), and its
 * own Matrix/Memory/Chat/Replay ports (all already exist). See
 * `docs/GENESIS_PARTICLE_PHYSICS_AUDIT.md` for the element-by-element verdict.
 *
 * ## Why an accumulating counting experiment, and not per-event Monte Carlo
 *
 * `quantumTunneling.ts` already documents the constraint this domain has to
 * respect: `domainState` is `Record<string, number>`, it is diffed into the
 * delta log, and it is SHARED by reference between a branch and its fork
 * unless it is plain numeric state. A per-event Monte Carlo generator holds a
 * PRNG stream, so two forks drawing from one stream would silently diverge —
 * which is exactly the failure the WorldGraph is built to prevent.
 *
 * So this solver accumulates DETERMINISTIC EXPECTED YIELDS instead: each tick
 * adds the expected number of signal and background candidates for that tick's
 * luminosity, from closed-form physics. Same physics, no stochastic stream, and
 * a fork is bit-identical to its parent by construction. Per-event kinematics
 * still exists and is still exact — see `twoBodyDecayMomenta`, used for the
 * single-event view, driven by the tick index rather than a PRNG.
 *
 * ## HONEST LIMITS — what these yields are and are not
 *
 *  - Yields are in ARBITRARY NORMALISED UNITS, not picobarns. The line shape is
 *    the real relativistic Breit-Wigner and its RATIOS between energies are
 *    meaningful; the absolute scale is set by `PEAK_YIELD_PER_LUMI_UNIT`, which
 *    is a normalisation constant, NOT a measured cross-section. Nothing here
 *    may be reported as a cross-section measurement.
 *  - Background is a flat continuum under the peak: real Drell-Yan continuum
 *    falls with mass. Flat is the honest simplification for a fixed narrow
 *    window and is declared as such, never fitted to data.
 *  - No initial-state radiation, no beam energy spread, no pile-up, no trigger
 *    model. Detector response is one Gaussian momentum resolution and one flat
 *    tracking efficiency inside a hard |eta| acceptance edge.
 *  - Hence `MODEL_ESTIMATE`: a real model of an idealised apparatus, the same
 *    tier `quantumTunneling.ts` and `epidemicSEIR.ts` use, never
 *    `GROUNDED_EXACT`.
 */
export const PARTICLE_PHYSICS_SOLVER_ID = 'particle-collider-resonance-counting';
export const PARTICLE_PHYSICS_DOMAIN_ID = 'particle-physics';

export const PARTICLE_COLLIDER_STEP_EVENT_TYPE = 'particle.collider.step';

// ---------------------------------------------------------------------------
// Reference constants (PDG). REFERENCE provenance: published values, cited.
// ---------------------------------------------------------------------------

/** Z boson pole mass, PDG: 91.1876 GeV. */
export const Z_MASS_MEV = 91187.6;
/** Z boson total width, PDG: 2.4952 GeV. */
export const Z_WIDTH_MEV = 2495.2;
/** Muon mass, PDG: 105.6583755 MeV. */
export const MUON_MASS_MEV = 105.6583755;

/**
 * Sets the absolute yield scale. A NORMALISATION CONSTANT, not a measured
 * cross-section: it makes "candidates at the pole, per unit luminosity, at
 * full acceptance and efficiency" equal to 1000 so the numbers a person reads
 * are legible. Every RATIO in this domain is independent of it.
 */
const PEAK_YIELD_PER_LUMI_UNIT = 1000;

/**
 * Flat continuum background under the peak, per unit luminosity, in the same
 * arbitrary units. Declared, not fitted: see the module doc's honest limits.
 */
const BACKGROUND_YIELD_PER_LUMI_UNIT = 40;

// ---------------------------------------------------------------------------
// Real relativistic kinematics (the accepted core of the Qwen proposal)
// ---------------------------------------------------------------------------

export interface FourVector { readonly E: number; readonly px: number; readonly py: number; readonly pz: number; }

export const momentumMagnitude = (v: FourVector): number => Math.sqrt(v.px * v.px + v.py * v.py + v.pz * v.pz);
export const transverseMomentum = (v: FourVector): number => Math.sqrt(v.px * v.px + v.py * v.py);
export const addFour = (a: FourVector, b: FourVector): FourVector => ({ E: a.E + b.E, px: a.px + b.px, py: a.py + b.py, pz: a.pz + b.pz });

/**
 * Invariant mass sqrt(E^2 - |p|^2). Returns null for a spacelike four-vector
 * rather than NaN or a coerced zero: a negative m^2 is not a small mass, it is
 * a four-vector that cannot be a particle, and the caller must see that.
 */
export function invariantMass(v: FourVector): number | null {
  const m2 = v.E * v.E - (v.px * v.px + v.py * v.py + v.pz * v.pz);
  if (m2 < -1e-9) return null;
  return Math.sqrt(Math.max(0, m2));
}

/** Pseudorapidity. Null when the track has no transverse component to define it against. */
export function pseudorapidity(v: FourVector): number | null {
  const pT = transverseMomentum(v);
  if (pT <= 0 || momentumMagnitude(v) <= 0) return null;
  return Math.asinh(v.pz / pT);
}

/**
 * Exact two-body decay momentum in the parent rest frame:
 * p = sqrt((M^2-(m1+m2)^2)(M^2-(m1-m2)^2)) / 2M.
 * Null when the decay is kinematically forbidden — never a clamped zero, which
 * would silently turn an impossible decay into a stationary one.
 */
export function twoBodyMomentumMeV(parentMassMeV: number, m1MeV: number, m2MeV: number): number | null {
  // The threshold is checked DIRECTLY, and must be: the Kallen product below is
  // a product of two factors that both go negative together for equal daughter
  // masses, but for UNEQUAL masses — muon capture, p -> n + nu — the second
  // factor stays positive, so a forbidden reaction would come back as a
  // perfectly plausible positive momentum. Sign-checking the product alone is
  // not enough, and this test is the physics: M must reach m1 + m2.
  if (!(parentMassMeV > 0) || parentMassMeV < m1MeV + m2MeV) return null;
  const m2sq = parentMassMeV * parentMassMeV;
  const k = (m2sq - (m1MeV + m2MeV) ** 2) * (m2sq - (m1MeV - m2MeV) ** 2);
  if (k < 0) return null;
  return Math.sqrt(k) / (2 * parentMassMeV);
}

/**
 * One exact back-to-back two-body decay in the parent rest frame, at a polar
 * angle DERIVED FROM THE TICK rather than drawn from a PRNG — the same
 * determinism discipline the module doc explains. Energy and momentum are
 * conserved exactly by construction, which this domain's own test checks
 * rather than assumes.
 */
export interface UnitVector { readonly x: number; readonly y: number; readonly z: number; }

/**
 * A deterministic, non-repeating direction for tick `n` — the golden-angle
 * spiral, which spreads successive ticks over the sphere without a random
 * stream. This is the single place a direction is chosen in this module, so
 * every channel inherits the same determinism discipline.
 */
export function tickDirection(tick: number): UnitVector {
  const cosTheta = ((tick * 2) % 21) / 10 - 1;
  const phi = tick * 2.399963229728653;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  return { x: sinTheta * Math.cos(phi), y: sinTheta * Math.sin(phi), z: cosTheta };
}

/**
 * One exact back-to-back two-body final state in the parent rest frame, for
 * daughters of ANY two masses. Energy and momentum are conserved exactly by
 * construction — which this domain's own tests check rather than assume — and
 * both daughters come out on their real mass shells.
 *
 * Null when the reaction is kinematically forbidden, never a clamped zero.
 */
export function twoBodyFinalState(
  parentMassMeV: number,
  m1MeV: number,
  m2MeV: number,
  tick: number,
): { readonly first: FourVector; readonly second: FourVector } | null {
  const p = twoBodyMomentumMeV(parentMassMeV, m1MeV, m2MeV);
  if (p === null) return null;
  const d = tickDirection(tick);
  return {
    first: { E: Math.sqrt(m1MeV * m1MeV + p * p), px: p * d.x, py: p * d.y, pz: p * d.z },
    second: { E: Math.sqrt(m2MeV * m2MeV + p * p), px: -p * d.x, py: -p * d.y, pz: -p * d.z },
  };
}

/**
 * The equal-mass case, kept as its own name because a symmetric pair is what
 * the di-muon event view asks for. Identical numbers to `twoBodyFinalState`.
 */
export function twoBodyDecayMomenta(parentMassMeV: number, daughterMassMeV: number, tick: number): { readonly plus: FourVector; readonly minus: FourVector } | null {
  const pair = twoBodyFinalState(parentMassMeV, daughterMassMeV, daughterMassMeV, tick);
  return pair === null ? null : { plus: pair.first, minus: pair.second };
}

/**
 * Lorentz boost of a four-vector INTO the lab frame, from a frame moving with
 * velocity `beta` (in units of c) relative to the lab. The standard general
 * boost, written out rather than approximated: it is what makes a three-body
 * final state conserve energy and momentum exactly instead of nearly.
 */
export function boostFourVector(v: FourVector, beta: UnitVector): FourVector {
  const b2 = beta.x * beta.x + beta.y * beta.y + beta.z * beta.z;
  if (b2 <= 0) return v;
  if (b2 >= 1) return v; // a superluminal boost is not a boost; the caller's guard failed
  const gamma = 1 / Math.sqrt(1 - b2);
  const bp = beta.x * v.px + beta.y * v.py + beta.z * v.pz;
  const k = (gamma - 1) * bp / b2 + gamma * v.E;
  return {
    E: gamma * (v.E + bp),
    px: v.px + k * beta.x,
    py: v.py + k * beta.y,
    pz: v.pz + k * beta.z,
  };
}

/**
 * Relativistic Breit-Wigner line shape, in the standard s-dependent form
 * sigma(s) ~ s*Gamma^2 / ((s - M^2)^2 + M^2*Gamma^2), normalised so the value
 * at the pole is exactly 1. Shape only: this is a RELATIVE production weight
 * across energies, never a cross-section in picobarns.
 */
export function breitWignerWeight(sqrtSMeV: number, massMeV: number, widthMeV: number): number {
  if (!Number.isFinite(sqrtSMeV) || sqrtSMeV <= 0) return 0;
  const s = sqrtSMeV * sqrtSMeV;
  const m2 = massMeV * massMeV;
  const g2 = widthMeV * widthMeV;
  const numerator = s * g2;
  const denominator = (s - m2) ** 2 + m2 * g2;
  const atPole = (m2 * g2) / (m2 * g2);
  return denominator === 0 ? 0 : (numerator / denominator) / atPole / (m2 / m2);
}

/**
 * Abramowitz & Stegun 7.1.26 error-function approximation (max abs error
 * 1.5e-7) — used for the fraction of a Gaussian-smeared peak that lands inside
 * the mass window. Cited approximation, not an invented formula.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return sign * y;
}

/**
 * Fraction of reconstructed candidates landing inside a mass window of
 * +/- `halfWindowMeV`, given a Gaussian di-muon mass resolution. The resolution
 * on the PAIR mass follows from the per-track relative momentum resolution:
 * sigma_M/M = sigma_p/p / sqrt(2) for two tracks of comparable momentum — the
 * standard propagation, stated rather than hidden.
 */
export function massWindowFraction(halfWindowMeV: number, relativeMomentumResolution: number, peakMassMeV: number): number {
  const sigmaM = (peakMassMeV * relativeMomentumResolution) / Math.SQRT2;
  if (sigmaM <= 0) return 1;
  return erf(halfWindowMeV / (sigmaM * Math.SQRT2));
}

// ---------------------------------------------------------------------------
// Domain state and solver
// ---------------------------------------------------------------------------

export interface ColliderRunState {
  /** Centre-of-mass energy the machine is running at. The lever an operator really has. */
  sqrtSMeV: number;
  /** Luminosity delivered per tick, in the same arbitrary normalised units as the yields. */
  luminosityPerTick: number;
  /** Per-track relative momentum resolution, e.g. 0.02 = 2%. */
  momentumResolutionRel: number;
  /** Hard |eta| acceptance edge of the tracker. */
  acceptanceEtaMax: number;
  /** Flat per-track reconstruction efficiency. */
  trackingEfficiency: number;
  /** Half-width of the fixed di-muon mass window candidates are counted in. */
  massWindowHalfMeV: number;
  integratedLuminosity: number;
  signalCandidates: number;
  backgroundCandidates: number;
  signalToBackground: number;
  /** S/sqrt(B), the simple counting significance. Not the full Asimov formula — see below. */
  significance: number;
}

export const COLLIDER_DEFAULTS: ColliderRunState = {
  sqrtSMeV: 89000,
  luminosityPerTick: 1,
  momentumResolutionRel: 0.02,
  acceptanceEtaMax: 2.0,
  trackingEfficiency: 0.9,
  massWindowHalfMeV: 3000,
  integratedLuminosity: 0,
  signalCandidates: 0,
  backgroundCandidates: 0,
  signalToBackground: 0,
  significance: 0,
};

/**
 * Geometric acceptance for a pair of back-to-back tracks from an isotropic
 * decay, as the fraction of solid angle inside |eta| < etaMax: tanh(etaMax).
 * Real closed form for an isotropic distribution, not a fitted efficiency.
 */
export function etaAcceptanceFraction(acceptanceEtaMax: number): number {
  return Math.tanh(Math.max(0, acceptanceEtaMax));
}

/** Both muons must be reconstructed for the pair to be a candidate, hence efficiency squared. */
const pairEfficiency = (trackingEfficiency: number): number => trackingEfficiency * trackingEfficiency;

export interface ColliderTickYield { readonly signal: number; readonly background: number; }

/**
 * The physics of one tick, as a pure function so it can be tested and reasoned
 * about without a WorldGraph. Signal is shaped by the Breit-Wigner weight AND
 * by how much of the smeared peak survives the mass window; background is a
 * flat continuum inside that same window, so it is NOT shaped by the line
 * shape and NOT narrowed by better resolution. That asymmetry is the whole
 * physical content of the resolution lever and it is real.
 */
export function colliderTickYield(state: ColliderRunState): ColliderTickYield {
  const acceptance = etaAcceptanceFraction(state.acceptanceEtaMax) * pairEfficiency(state.trackingEfficiency);
  const lineShape = breitWignerWeight(state.sqrtSMeV, Z_MASS_MEV, Z_WIDTH_MEV);
  const inWindow = massWindowFraction(state.massWindowHalfMeV, state.momentumResolutionRel, Z_MASS_MEV);
  const signal = PEAK_YIELD_PER_LUMI_UNIT * state.luminosityPerTick * lineShape * inWindow * acceptance;
  const background = BACKGROUND_YIELD_PER_LUMI_UNIT * state.luminosityPerTick * acceptance;
  return { signal, background };
}

export function makeParticleColliderSolver(): DomainSolver {
  return (entity: WorldModelEntity, ctx): SolverResult => {
    const params = { ...COLLIDER_DEFAULTS, ...(entity.domainState as unknown as Partial<ColliderRunState>) } as ColliderRunState;
    const { signal, background } = colliderTickYield(params);

    const signalCandidates = params.signalCandidates + signal;
    const backgroundCandidates = params.backgroundCandidates + background;
    const integratedLuminosity = params.integratedLuminosity + params.luminosityPerTick;
    const signalToBackground = backgroundCandidates > 0 ? signalCandidates / backgroundCandidates : 0;
    // S/sqrt(B): the simple counting significance, valid for B >> 1. Deliberately
    // NOT the Asimov formula — with a flat declared background and normalised
    // units, quoting the more precise expression would imply a calibration this
    // model does not have.
    const significance = backgroundCandidates > 0 ? signalCandidates / Math.sqrt(backgroundCandidates) : 0;

    const next: ColliderRunState = { ...params, integratedLuminosity, signalCandidates, backgroundCandidates, signalToBackground, significance };

    const observation: Observation = {
      observationId: `collider-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: sqrt(s)=${(params.sqrtSMeV / 1000).toFixed(2)} GeV, S=${signalCandidates.toFixed(1)}, B=${backgroundCandidates.toFixed(1)}, S/B=${signalToBackground.toFixed(3)}, S/sqrt(B)=${significance.toFixed(2)}`,
      measurements: [
        { key: 'signalCandidates', value: signalCandidates, tick: ctx.tick, entity: entity.ref, provenance: ['domains/particlePhysics.ts#breitWignerWeight', 'PDG Z mass/width (REFERENCE)'] },
        { key: 'backgroundCandidates', value: backgroundCandidates, tick: ctx.tick, entity: entity.ref, provenance: ['domains/particlePhysics.ts#BACKGROUND_YIELD_PER_LUMI_UNIT (declared flat continuum, not fitted)'] },
        { key: 'signalToBackground', value: signalToBackground, tick: ctx.tick, entity: entity.ref, provenance: ['domains/particlePhysics.ts#colliderTickYield'] },
        { key: 'significance', value: significance, tick: ctx.tick, entity: entity.ref, provenance: ['domains/particlePhysics.ts#S-over-sqrt-B (simple counting significance)'] },
      ],
      provenance: ['domains/particlePhysics.ts', 'arbitrary normalised yield units — NOT picobarns'],
    };

    const eventParameters = { ...next };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('collider-evt', entity.id, ctx.tick, eventParameters),
      type: PARTICLE_COLLIDER_STEP_EVENT_TYPE,
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'collider-run-step',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: PARTICLE_PHYSICS_SOLVER_ID },
    };

    return {
      patch: { domainState: { ...next } as unknown as Record<string, number>, statusLabel: colliderStatusLabel(next) },
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

/**
 * The run's own real state, as a short allowlisted string — the same
 * convention `graphics/ADAPTER_CONTRACT.md` requires of every domain that
 * reaches a renderer: a fixed vocabulary, never free prose.
 */
export const COLLIDER_STATES = ['OFF_PEAK', 'NEAR_PEAK', 'ON_PEAK'] as const;
export type ColliderStatusLabel = (typeof COLLIDER_STATES)[number];

export function colliderStatusLabel(state: ColliderRunState): ColliderStatusLabel {
  const detuningMeV = Math.abs(state.sqrtSMeV - Z_MASS_MEV);
  if (detuningMeV <= Z_WIDTH_MEV / 2) return 'ON_PEAK';
  if (detuningMeV <= Z_WIDTH_MEV * 2) return 'NEAR_PEAK';
  return 'OFF_PEAK';
}

export interface AddColliderRunOptions {
  colliderId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<ColliderRunState>;
}

export function addColliderRun(graph: WorldGraph, options: AddColliderRunOptions = {}): EntityId {
  const ref = { kind: 'collider-run', id: options.colliderId ?? 'collider-1' };
  const params = { ...COLLIDER_DEFAULTS, ...options.params };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Collider Run (di-muon resonance search)',
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: { ...params } as unknown as Record<string, number>,
    domainBinding: { solverId: PARTICLE_PHYSICS_SOLVER_ID, domainId: PARTICLE_PHYSICS_DOMAIN_ID },
    statusLabel: colliderStatusLabel(params),
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

// ---------------------------------------------------------------------------
// FIDELITY TIERS — how faithful a model is, as a separate question from
// whether a solver ran at all
// ---------------------------------------------------------------------------

/**
 * Adapted from the Qwen "Particle & Atomic Physics Laboratory" proposal, which
 * asked for an explicit fidelity vocabulary. It is kept because it carries
 * information `GroundingLevel` structurally cannot:
 *
 *  - `GroundingLevel` answers "did a real domain solver run, and was its update
 *    exact, approximate, a generic heuristic, or absent?"
 *  - `FidelityTier` answers "the solver that ran — how faithful is the physics
 *    inside it?"
 *
 * Three of the four tiers below collapse onto the single `MODEL_ESTIMATE`
 * grounding (see `fidelityGrounding`), and that collapse is exactly the
 * information loss this axis repairs: a real empirical parametrisation and a
 * hard-sphere cartoon are both `MODEL_ESTIMATE`, and a reader deserves to know
 * which one produced the number in front of them.
 *
 *  - `EXACT_KINEMATICS` — closed-form relativistic kinematics, exact up to
 *    floating point. Conservation is a theorem here, not an aspiration.
 *  - `SIMPLIFIED` — a real, published, citable physical model with declared
 *    terms omitted (e.g. a measured diffractive slope, the V-A Michel
 *    spectrum with the electron mass neglected).
 *  - `TOY` — the right functional shape with unfitted parameters. Useful for
 *    showing a trend, never for quoting a number.
 *  - `DEMONSTRATION` — a picture. Produces something to look at and nothing to
 *    report.
 *
 * The two axes may never contradict each other, so a channel never states its
 * grounding directly: it is derived from the tier by `fidelityGrounding`.
 */
export const FIDELITY_TIERS = ['EXACT_KINEMATICS', 'SIMPLIFIED', 'TOY', 'DEMONSTRATION'] as const;
export type FidelityTier = (typeof FIDELITY_TIERS)[number];

/** The one mapping from fidelity to the repo's existing grounding disclosure. */
export function fidelityGrounding(tier: FidelityTier): GroundingLevel {
  return tier === 'EXACT_KINEMATICS' ? 'GROUNDED_EXACT' : 'MODEL_ESTIMATE';
}

/** Ranks tiers so a run can report the WEAKEST link in what it used, not the strongest. */
export function weakestFidelity(tiers: readonly FidelityTier[]): FidelityTier {
  let worst: FidelityTier = 'EXACT_KINEMATICS';
  for (const t of tiers) if (FIDELITY_TIERS.indexOf(t) > FIDELITY_TIERS.indexOf(worst)) worst = t;
  return worst;
}

// ---------------------------------------------------------------------------
// Additional PDG reference constants used by the reaction channels
// ---------------------------------------------------------------------------

/** Electron mass, PDG: 0.51099895000 MeV. */
export const ELECTRON_MASS_MEV = 0.51099895;
/** Proton mass, PDG: 938.27208816 MeV. */
export const PROTON_MASS_MEV = 938.27208816;
/** Neutron mass, PDG: 939.56542052 MeV. */
export const NEUTRON_MASS_MEV = 939.56542052;
/** Muon mean lifetime, PDG: 2.1969811 us. */
export const MUON_LIFETIME_SECONDS = 2.1969811e-6;
/** Hydrogen ground-state ionisation energy (Rydberg), CODATA: 13.605693 eV. */
export const HYDROGEN_IONIZATION_ENERGY_EV = 13.605693122;
/**
 * Elastic pp diffractive slope, B ~ 20 GeV^-2 at LHC energies (TOTEM). A
 * MEASURED parameter used as a parametrisation, not a first-principles result —
 * which is precisely why the channel using it is `SIMPLIFIED` and not
 * `EXACT_KINEMATICS`.
 */
export const PP_ELASTIC_SLOPE_PER_GEV2 = 20;

// ---------------------------------------------------------------------------
// Real closed-form channel physics
// ---------------------------------------------------------------------------

/**
 * Michel spectrum, the V-A prediction for the electron energy in muon decay:
 * dGamma/dx proportional to x^2(3-2x) with x = 2E_e/m_mu in [0,1]. Returned
 * NORMALISED, so it integrates to exactly 1 over [0,1]: 6x^2 - 4x^3.
 *
 * This is the real matrix-element result, not flat phase space. Its mean,
 * <x> = 0.7, puts the mean electron energy at 0.35*m_mu = 36.98 MeV — the
 * measured value — and this domain's tests check that by integration rather
 * than taking it on trust.
 *
 * Declared omissions: the electron mass is neglected (m_e/m_mu = 0.005) and
 * there are no radiative corrections. Hence `SIMPLIFIED`.
 */
export function michelSpectrumDensity(x: number): number {
  if (x < 0 || x > 1) return 0;
  return 6 * x * x - 4 * x * x * x;
}

/** The Michel CDF, in closed form: F(x) = 2x^3 - x^4, monotone on [0,1] with F(1) = 1. */
export function michelCdf(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 2 * x * x * x - x * x * x * x;
}

/**
 * Inverts the Michel CDF by bisection — deterministic, 60 halvings, so the
 * result is reproducible to floating-point precision on any machine. Used to
 * turn a tick index into an electron energy without a PRNG stream.
 */
export function michelInverseCdf(u: number): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (michelCdf(mid) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Electron-impact ionisation cross-section of atomic hydrogen, in cm^2, by the
 * Lotz (1967) empirical formula:
 *
 *   sigma = a*q*ln(E/P)/(E*P) * [1 - b*exp(-c*(E/P - 1))]
 *
 * with the published hydrogen parameters a = 4.0e-14 cm^2 eV^2, b = 0.60,
 * c = 0.56, q = 1 electron, P = the Rydberg ionisation energy. W. Lotz,
 * Z. Physik 206, 205 (1967).
 *
 * Two things in here are REAL and neither is a fit made up in this repository:
 *  - the HARD THRESHOLD at P: below 13.6 eV the cross-section is exactly zero,
 *    because there is not enough energy to unbind the electron; and
 *  - the NON-MONOTONIC shape: it rises from threshold, peaks near 55 eV, and
 *    then falls like ln(E)/E. Raising the beam energy past the peak makes the
 *    experiment WORSE, which is the opposite of the collider intuition and is
 *    the central discoverable fact of the atomic environment.
 *
 * Reproduces the measured peak of about 0.65e-16 cm^2 near 55 eV.
 */
export function electronImpactIonizationCrossSectionCm2(electronEnergyEV: number): number {
  const P = HYDROGEN_IONIZATION_ENERGY_EV;
  if (!Number.isFinite(electronEnergyEV) || electronEnergyEV <= P) return 0;
  const r = electronEnergyEV / P;
  const rise = (4.0e-14 * Math.log(r)) / (electronEnergyEV * P);
  return rise * (1 - 0.6 * Math.exp(-0.56 * (r - 1)));
}

// ---------------------------------------------------------------------------
// Reaction channels — the catalogue of what this laboratory can actually run
// ---------------------------------------------------------------------------

export interface ChannelParticle {
  readonly species: string;
  readonly restMassMeV: number;
  readonly charge: number;
  readonly fourMomentum: FourVector;
}

export interface ChannelOutcome {
  readonly finalState: readonly ChannelParticle[];
  /** Relative production weight where the channel has one (the resonance); 1 otherwise. */
  readonly relativeWeight: number;
}

export interface ReactionChannel {
  readonly channelId: string;
  readonly name: string;
  readonly fidelity: FidelityTier;
  /** What must hold for the channel to produce anything at all, in prose. */
  readonly validRange: string;
  readonly assumptions: readonly string[];
  readonly notModelled: readonly string[];
  /**
   * Produces one final state at the given centre-of-mass energy and tick, or
   * `null` when the reaction is kinematically forbidden there. Null is the
   * honest answer for below-threshold input and is never coerced into an
   * event with zero momentum.
   */
  readonly evaluate: (sqrtSMeV: number, tick: number) => ChannelOutcome | null;
}

const pair = (
  sqrtSMeV: number,
  tick: number,
  a: { species: string; mass: number; charge: number },
  b: { species: string; mass: number; charge: number },
): readonly ChannelParticle[] | null => {
  const state = twoBodyFinalState(sqrtSMeV, a.mass, b.mass, tick);
  if (state === null) return null;
  return [
    { species: a.species, restMassMeV: a.mass, charge: a.charge, fourMomentum: state.first },
    { species: b.species, restMassMeV: b.mass, charge: b.charge, fourMomentum: state.second },
  ];
};

/** e+e- -> mu+mu-. Pure two-body kinematics: exact, with a real threshold at 2*m_mu. */
export const EE_TO_MUMU_CHANNEL: ReactionChannel = {
  channelId: 'ee-annihilation',
  name: 'e+e- -> mu+ mu-',
  fidelity: 'EXACT_KINEMATICS',
  validRange: 'sqrt(s) >= 2 * m(mu) = 211.32 MeV',
  assumptions: ['Centre-of-mass frame', 'Two-body final state', 'Muons on their PDG mass shell'],
  notModelled: ['Production rate — this channel gives the KINEMATICS only, never a cross-section', 'Initial-state radiation', 'Angular distribution (1 + cos^2 theta) — the direction here is a deterministic tick sequence'],
  evaluate: (sqrtSMeV, tick) => {
    const out = pair(sqrtSMeV, tick, { species: 'muon', mass: MUON_MASS_MEV, charge: -1 }, { species: 'antimuon', mass: MUON_MASS_MEV, charge: +1 });
    return out === null ? null : { finalState: out, relativeWeight: 1 };
  },
};

/** e+e- -> Z -> mu+mu-. Same exact kinematics, weighted by the real relativistic line shape. */
export const Z_RESONANCE_CHANNEL: ReactionChannel = {
  channelId: 'ee-z-resonance',
  name: 'e+e- -> Z -> mu+ mu-',
  fidelity: 'SIMPLIFIED',
  validRange: 'any sqrt(s) >= 2 * m(mu); the weight is only meaningful near the Z pole',
  assumptions: ['Relativistic Breit-Wigner used as a SHAPE, normalised to 1 at the pole', 'PDG Z mass and width (REFERENCE)', 'Z -> mu+mu- only'],
  notModelled: ['Absolute cross-section — the weight is relative, never picobarns', 'Initial-state radiation and beam energy spread', 'Interference with the photon continuum'],
  evaluate: (sqrtSMeV, tick) => {
    const out = pair(sqrtSMeV, tick, { species: 'muon', mass: MUON_MASS_MEV, charge: -1 }, { species: 'antimuon', mass: MUON_MASS_MEV, charge: +1 });
    return out === null ? null : { finalState: out, relativeWeight: breitWignerWeight(sqrtSMeV, Z_MASS_MEV, Z_WIDTH_MEV) };
  },
};

/** mu- + p -> n + nu_mu. Two-body with UNEQUAL masses; exact, with a real threshold. */
export const MUON_CAPTURE_CHANNEL: ReactionChannel = {
  channelId: 'muon-capture',
  name: 'mu- + p -> n + nu(mu)',
  fidelity: 'EXACT_KINEMATICS',
  validRange: 'sqrt(s) >= m(n) = 939.57 MeV',
  assumptions: ['Centre-of-mass frame', 'Two-body final state', 'Massless neutrino'],
  notModelled: ['Capture rate and its Z^4 dependence in a real nucleus', 'Nuclear structure — this is capture on a FREE proton', 'Neutrino mass (below any scale here)'],
  evaluate: (sqrtSMeV, tick) => {
    const out = pair(sqrtSMeV, tick, { species: 'neutron', mass: NEUTRON_MASS_MEV, charge: 0 }, { species: 'neutrino', mass: 0, charge: 0 });
    return out === null ? null : { finalState: out, relativeWeight: 1 };
  },
};

/**
 * mu -> e nu nubar, with the REAL Michel electron spectrum.
 *
 * Built so that energy and momentum are conserved EXACTLY despite being a
 * three-body decay: the electron energy is drawn from the Michel CDF, and the
 * two neutrinos are then constructed as an exact back-to-back pair inside the
 * recoiling system and boosted into the muon frame. Nothing is left over.
 */
export const MUON_DECAY_CHANNEL: ReactionChannel = {
  channelId: 'muon-decay',
  name: 'mu -> e + nu + nubar (Michel spectrum)',
  fidelity: 'SIMPLIFIED',
  validRange: 'muon at rest; electron energy in [0, m(mu)/2]',
  assumptions: ['V-A Michel spectrum x^2(3-2x) for the electron energy', 'Electron mass neglected in the spectrum, so the electron is treated as massless', 'Muon decays at rest'],
  notModelled: ['Radiative corrections', 'Muon and electron polarisation (the spectrum here is the unpolarised one)', 'The muon lifetime — this channel gives one decay, not a rate'],
  evaluate: (_sqrtSMeV, tick) => {
    // A deterministic quantile per tick: the golden-ratio low-discrepancy
    // sequence, which fills [0,1) evenly without a random stream.
    const u = (tick * 0.6180339887498949) % 1;
    const x = michelInverseCdf(u);
    const eElectron = (x * MUON_MASS_MEV) / 2;
    if (eElectron <= 0) return null;
    const d = tickDirection(tick);
    const electron: FourVector = { E: eElectron, px: eElectron * d.x, py: eElectron * d.y, pz: eElectron * d.z };

    // Everything the electron did not take is the two-neutrino system.
    const recoilE = MUON_MASS_MEV - eElectron;
    const recoil: FourVector = { E: recoilE, px: -electron.px, py: -electron.py, pz: -electron.pz };
    const recoilMass = invariantMass(recoil);
    if (recoilMass === null || recoilMass <= 0) return null;

    // Two massless neutrinos, back to back in the recoil rest frame...
    const half = recoilMass / 2;
    const nd = tickDirection(tick + 7);
    const restA: FourVector = { E: half, px: half * nd.x, py: half * nd.y, pz: half * nd.z };
    const restB: FourVector = { E: half, px: -half * nd.x, py: -half * nd.y, pz: -half * nd.z };
    // ...then boosted into the muon frame, which makes the sum exactly `recoil`.
    const beta: UnitVector = { x: recoil.px / recoilE, y: recoil.py / recoilE, z: recoil.pz / recoilE };
    return {
      finalState: [
        { species: 'electron', restMassMeV: 0, charge: -1, fourMomentum: electron },
        { species: 'neutrino', restMassMeV: 0, charge: 0, fourMomentum: boostFourVector(restA, beta) },
        { species: 'antineutrino', restMassMeV: 0, charge: 0, fourMomentum: boostFourVector(restB, beta) },
      ],
      relativeWeight: 1,
    };
  },
};

/**
 * pp -> pp elastic, with the MEASURED diffractive slope dsigma/d|t| ~ exp(-B|t|),
 * B ~ 20 GeV^-2. The kinematics are exact; the angular distribution is a real
 * empirical parametrisation rather than a first-principles calculation, which
 * is what makes this `SIMPLIFIED` and not `EXACT_KINEMATICS`.
 */
export const PP_ELASTIC_CHANNEL: ReactionChannel = {
  channelId: 'pp-elastic',
  name: 'p p -> p p (elastic, diffractive slope)',
  fidelity: 'SIMPLIFIED',
  validRange: 'sqrt(s) >= 2 * m(p) = 1876.54 MeV; the slope is an LHC-energy value',
  assumptions: ['dsigma/d|t| proportional to exp(-B|t|) with B = 20 GeV^-2 (TOTEM, measured)', 'Exact two-body elastic kinematics', 'Centre-of-mass frame'],
  notModelled: ['Coulomb-nuclear interference at very small |t|', 'The diffractive dip and its energy dependence', 'Absolute elastic cross-section'],
  evaluate: (sqrtSMeV, tick) => {
    const p = twoBodyMomentumMeV(sqrtSMeV, PROTON_MASS_MEV, PROTON_MASS_MEV);
    if (p === null || p <= 0) return null;
    const pGeV = p / 1000;
    const tMaxGeV2 = 4 * pGeV * pGeV;
    const u = (tick * 0.6180339887498949) % 1;
    // Inverse CDF of an exponential truncated at |t|max — exact, deterministic.
    const span = 1 - Math.exp(-PP_ELASTIC_SLOPE_PER_GEV2 * tMaxGeV2);
    const tGeV2 = -Math.log(1 - u * span) / PP_ELASTIC_SLOPE_PER_GEV2;
    const cosTheta = Math.min(1, Math.max(-1, 1 - tGeV2 / (2 * pGeV * pGeV)));
    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const phi = tick * 2.399963229728653;
    const E = Math.sqrt(PROTON_MASS_MEV * PROTON_MASS_MEV + p * p);
    const d = { x: sinTheta * Math.cos(phi), y: sinTheta * Math.sin(phi), z: cosTheta };
    return {
      finalState: [
        { species: 'proton', restMassMeV: PROTON_MASS_MEV, charge: +1, fourMomentum: { E, px: p * d.x, py: p * d.y, pz: p * d.z } },
        { species: 'proton', restMassMeV: PROTON_MASS_MEV, charge: +1, fourMomentum: { E, px: -p * d.x, py: -p * d.y, pz: -p * d.z } },
      ],
      relativeWeight: 1,
    };
  },
};

/**
 * e- + H -> e- + e- + H+, at the Lotz cross-section.
 *
 * The channel's weight is the REAL cross-section in cm^2, so this is the one
 * channel here whose weight carries physical units and can be compared with
 * published measurements. The threshold is exact: below 13.6 eV it returns
 * `null`, because the reaction cannot happen.
 */
export const ELECTRON_IMPACT_IONIZATION_CHANNEL: ReactionChannel = {
  channelId: 'electron-impact-ionization',
  name: 'e- + H -> e- + e- + H+ (Lotz cross-section)',
  fidelity: 'SIMPLIFIED',
  validRange: 'incident electron energy > 13.606 eV (the hydrogen ionisation threshold)',
  assumptions: ['Lotz (1967) empirical cross-section for atomic hydrogen', 'Ground-state hydrogen target', 'Energy shared between the two outgoing electrons above threshold'],
  notModelled: ['Differential angular distribution of the two electrons', 'Excitation channels that do not ionise', 'Multiple ionisation, and any target but ground-state H'],
  evaluate: (incidentEnergyMeV, tick) => {
    const energyEV = incidentEnergyMeV * 1e6;
    const sigma = electronImpactIonizationCrossSectionCm2(energyEV);
    if (sigma <= 0) return null;
    const availableEV = energyEV - HYDROGEN_IONIZATION_ENERGY_EV;
    const share = (tick * 0.6180339887498949) % 1;
    const scatteredEV = availableEV * share;
    const knockedEV = availableEV - scatteredEV;
    const d = tickDirection(tick);
    const toMeV = (ev: number) => ev / 1e6;
    return {
      finalState: [
        { species: 'electron', restMassMeV: ELECTRON_MASS_MEV, charge: -1, fourMomentum: { E: toMeV(scatteredEV), px: toMeV(scatteredEV) * d.x, py: toMeV(scatteredEV) * d.y, pz: toMeV(scatteredEV) * d.z } },
        { species: 'electron', restMassMeV: ELECTRON_MASS_MEV, charge: -1, fourMomentum: { E: toMeV(knockedEV), px: -toMeV(knockedEV) * d.x, py: -toMeV(knockedEV) * d.y, pz: -toMeV(knockedEV) * d.z } },
        { species: 'hydrogen-ion', restMassMeV: PROTON_MASS_MEV, charge: +1, fourMomentum: { E: PROTON_MASS_MEV, px: 0, py: 0, pz: 0 } },
      ],
      relativeWeight: sigma,
    };
  },
};

/**
 * Every channel this laboratory can actually execute. A channel appears here
 * only if a real function in this file computes it and a real test checks it —
 * a channel that is only a name and a fidelity label would be a design mockup,
 * which is what this integration was told not to produce. Qwen's `pn-scattering`,
 * `ion-ion` and `atom-atom-elastic` entries were dropped for exactly that
 * reason: each was an isotropic two-body draw with no physics distinguishing it
 * from the next one.
 */
export const REACTION_CHANNELS: readonly ReactionChannel[] = [
  EE_TO_MUMU_CHANNEL,
  Z_RESONANCE_CHANNEL,
  MUON_CAPTURE_CHANNEL,
  MUON_DECAY_CHANNEL,
  PP_ELASTIC_CHANNEL,
  ELECTRON_IMPACT_IONIZATION_CHANNEL,
];

export function getReactionChannel(channelId: string): ReactionChannel | null {
  return REACTION_CHANNELS.find((c) => c.channelId === channelId) ?? null;
}

/** Total four-momentum of a final state — the quantity conservation tests check. */
export function totalFourMomentum(particles: readonly ChannelParticle[]): FourVector {
  return particles.reduce<FourVector>((acc, p) => addFour(acc, p.fourMomentum), { E: 0, px: 0, py: 0, pz: 0 });
}

/** Total electric charge of a final state, in units of e. */
export function totalCharge(particles: readonly ChannelParticle[]): number {
  return particles.reduce((acc, p) => acc + p.charge, 0);
}
