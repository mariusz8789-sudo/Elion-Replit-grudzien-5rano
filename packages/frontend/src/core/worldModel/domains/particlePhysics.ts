import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
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
export function twoBodyDecayMomenta(parentMassMeV: number, daughterMassMeV: number, tick: number): { readonly plus: FourVector; readonly minus: FourVector } | null {
  const p = twoBodyMomentumMeV(parentMassMeV, daughterMassMeV, daughterMassMeV);
  if (p === null) return null;
  // A deterministic, non-repeating angle sequence: the golden-angle spiral,
  // which spreads successive ticks over the sphere without a random stream.
  const cosTheta = ((tick * 2) % 21) / 10 - 1;
  const phi = tick * 2.399963229728653;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const E = Math.sqrt(daughterMassMeV * daughterMassMeV + p * p);
  const dir = { x: sinTheta * Math.cos(phi), y: sinTheta * Math.sin(phi), z: cosTheta };
  return {
    plus: { E, px: p * dir.x, py: p * dir.y, pz: p * dir.z },
    minus: { E, px: -p * dir.x, py: -p * dir.y, pz: -p * dir.z },
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
