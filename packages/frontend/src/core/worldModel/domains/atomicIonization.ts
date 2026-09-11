import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';
import {
  electronImpactIonizationCrossSectionCm2,
  fidelityGrounding,
  HYDROGEN_IONIZATION_ENERGY_EV,
  type FidelityTier,
} from './particlePhysics';

/**
 * ATOMIC PHYSICS: an electron-impact ionisation chamber.
 *
 * THE ATOMIC LAB ENVIRONMENT of the Genesis Particle & Atomic Physics
 * Laboratory. The collider in `particlePhysics.ts` is one environment of that
 * laboratory; this is another, and the two share the same reaction-channel
 * catalogue, the same fidelity vocabulary, the same WorldGraph, the same
 * SolverRouter, the same Discovery Loop, the same Scientific Memory and the
 * same Replay. Nothing here is a second engine, a second orchestrator or a
 * second workflow — it is the twenty-third domain on the one substrate that
 * already exists.
 *
 * ## The apparatus
 *
 * A monoenergetic electron beam crosses a cell of ground-state atomic hydrogen
 * of number density `n` over a path length `L`. Each beam electron either
 * ionises an atom or does not, and the ions produced are collected with some
 * efficiency. The measured quantity is an ion count; the background is residual
 * gas in the chamber plus a fixed detector dark rate.
 *
 * ## The two real, closed-form pieces of physics
 *
 *  1. The **Lotz cross-section** (see `particlePhysics.ts`): zero below the
 *     13.606 eV threshold, rising to a peak near 55 eV, then falling like
 *     ln(E)/E. It is NON-MONOTONIC, so "turn the beam energy up" is a
 *     hypothesis that can be, and here is, FALSIFIED — the opposite of the
 *     collider, where tuning onto the resonance is unambiguously good.
 *
 *  2. **Beer-Lambert attenuation**: the chance a beam electron interacts at all
 *     over the cell is 1 - exp(-n*sigma*L), not n*sigma*L. So the density and
 *     path-length knobs SATURATE, and they enter only through the product
 *     n*sigma*L — which makes them provably the same knob, a fact this
 *     domain's tests check directly rather than assert.
 *
 * ## HONEST LIMITS
 *
 *  - Ion counts are real counts: beam electrons times a real probability. But
 *    the beam current, the residual-gas density and the dark rate are DECLARED
 *    apparatus parameters, not measurements of any real chamber, so only
 *    comparisons between arms of one run mean anything.
 *  - The cross-section is an empirical parametrisation (Lotz 1967) of measured
 *    data, so it is REFERENCE physics, not something computed here.
 *  - Single ionisation of ground-state hydrogen only. No excitation channel, no
 *    multiple ionisation, no space charge, no beam divergence, no gas heating.
 *  - Hence fidelity `SIMPLIFIED` and grounding `MODEL_ESTIMATE`, derived from
 *    the tier by the single mapping in `particlePhysics.ts` so the two
 *    disclosures can never disagree.
 */
export const ATOMIC_IONIZATION_SOLVER_ID = 'atomic-electron-impact-ionization';
export const ATOMIC_IONIZATION_DOMAIN_ID = 'atomic-physics';

export const ATOMIC_IONIZATION_STEP_EVENT_TYPE = 'atomic.ionization.step';

/** The ionisation chamber is as faithful as the Lotz parametrisation it rests on. */
export const ATOMIC_IONIZATION_FIDELITY: FidelityTier = 'SIMPLIFIED';

export interface IonizationChamberState {
  /** Electron beam kinetic energy, in eV. The lever with the non-monotonic response. */
  beamEnergyEV: number;
  /** Ground-state atomic hydrogen number density in the cell, per cm^3. */
  targetDensityPerCm3: number;
  /** Interaction path length through the cell, in cm. */
  pathLengthCm: number;
  /** Fraction of produced ions actually collected and counted. */
  collectionEfficiency: number;
  /** Beam electrons delivered per tick. A declared apparatus parameter. */
  beamElectronsPerTick: number;
  /** Residual gas density in the chamber, per cm^3 — ionised by the same beam. */
  residualGasPerCm3: number;
  /** Detector dark counts per tick. Fixed: it does not scale with anything. */
  darkCountsPerTick: number;
  integratedBeamElectrons: number;
  ionCounts: number;
  backgroundCounts: number;
  ionSignalToBackground: number;
  significance: number;
  /** Fraction of the beam that crosses the cell without interacting: exp(-n*sigma*L). */
  beamTransmission: number;
  /** The cross-section actually in force this tick, in cm^2 — the published quantity. */
  crossSectionCm2: number;
}

export const IONIZATION_DEFAULTS: IonizationChamberState = {
  // 30 eV: above threshold and BELOW the ~55 eV peak, so the response to the
  // energy lever is genuinely open — it can improve or degrade depending on
  // which way and how far the lever moves.
  beamEnergyEV: 30,
  targetDensityPerCm3: 1e13,
  pathLengthCm: 10,
  collectionEfficiency: 0.8,
  beamElectronsPerTick: 1e6,
  residualGasPerCm3: 5e11,
  darkCountsPerTick: 20,
  integratedBeamElectrons: 0,
  ionCounts: 0,
  backgroundCounts: 0,
  ionSignalToBackground: 0,
  significance: 0,
  beamTransmission: 1,
  crossSectionCm2: 0,
};

export interface IonizationTickYield {
  readonly ions: number;
  readonly background: number;
  readonly transmission: number;
  readonly crossSectionCm2: number;
}

/**
 * The physics of one tick, as a pure function so it can be tested without a
 * WorldGraph. Everything here is closed form and deterministic: there is no
 * PRNG stream, for the same structural reason `particlePhysics.ts` explains —
 * `domainState` is shared by reference between a branch and its fork, so a
 * random stream inside it would make two forks silently diverge.
 */
export function ionizationTickYield(state: IonizationChamberState): IonizationTickYield {
  const sigma = electronImpactIonizationCrossSectionCm2(state.beamEnergyEV);
  const opticalDepth = state.targetDensityPerCm3 * sigma * state.pathLengthCm;
  const transmission = Math.exp(-opticalDepth);
  // Beer-Lambert: the probability of AT LEAST ONE interaction, which saturates
  // at 1 rather than growing without bound like n*sigma*L would.
  const interactionProbability = 1 - transmission;
  const ions = state.beamElectronsPerTick * interactionProbability * state.collectionEfficiency;

  // The same beam ionises the residual gas, so this part of the background
  // tracks the cross-section exactly as the signal does. The dark rate does
  // not, which is the only reason the energy lever moves a RATIO at all.
  const residualDepth = state.residualGasPerCm3 * sigma * state.pathLengthCm;
  const residualCounts = state.beamElectronsPerTick * (1 - Math.exp(-residualDepth)) * state.collectionEfficiency;
  const background = residualCounts + state.darkCountsPerTick;

  return { ions, background, transmission, crossSectionCm2: sigma };
}

export function makeAtomicIonizationSolver(): DomainSolver {
  return (entity: WorldModelEntity, ctx): SolverResult => {
    const params = { ...IONIZATION_DEFAULTS, ...(entity.domainState as unknown as Partial<IonizationChamberState>) } as IonizationChamberState;
    const tick = ionizationTickYield(params);

    const ionCounts = params.ionCounts + tick.ions;
    const backgroundCounts = params.backgroundCounts + tick.background;
    const integratedBeamElectrons = params.integratedBeamElectrons + params.beamElectronsPerTick;
    const ionSignalToBackground = backgroundCounts > 0 ? ionCounts / backgroundCounts : 0;
    // S/sqrt(B), the simple counting significance, valid for B >> 1 — the same
    // form and the same stated caveat as the collider environment uses.
    const significance = backgroundCounts > 0 ? ionCounts / Math.sqrt(backgroundCounts) : 0;

    const next: IonizationChamberState = {
      ...params,
      integratedBeamElectrons,
      ionCounts,
      backgroundCounts,
      ionSignalToBackground,
      significance,
      beamTransmission: tick.transmission,
      crossSectionCm2: tick.crossSectionCm2,
    };

    const observation: Observation = {
      observationId: `ionization-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: E=${params.beamEnergyEV.toFixed(1)} eV, sigma=${tick.crossSectionCm2.toExponential(3)} cm^2, ions=${ionCounts.toFixed(1)}, background=${backgroundCounts.toFixed(1)}, S/B=${ionSignalToBackground.toFixed(3)}`,
      measurements: [
        { key: 'ionCounts', value: ionCounts, tick: ctx.tick, entity: entity.ref, provenance: ['domains/atomicIonization.ts#ionizationTickYield', 'Beer-Lambert 1-exp(-n*sigma*L)'] },
        { key: 'backgroundCounts', value: backgroundCounts, tick: ctx.tick, entity: entity.ref, provenance: ['domains/atomicIonization.ts#residual gas + declared dark rate (not fitted)'] },
        { key: 'ionSignalToBackground', value: ionSignalToBackground, tick: ctx.tick, entity: entity.ref, provenance: ['domains/atomicIonization.ts#ionizationTickYield'] },
        { key: 'significance', value: significance, tick: ctx.tick, entity: entity.ref, provenance: ['domains/atomicIonization.ts#S-over-sqrt-B (simple counting significance)'] },
        { key: 'crossSectionCm2', value: tick.crossSectionCm2, tick: ctx.tick, entity: entity.ref, provenance: ['Lotz, Z. Physik 206, 205 (1967) — empirical fit to measured data (REFERENCE)'] },
        { key: 'beamTransmission', value: tick.transmission, tick: ctx.tick, entity: entity.ref, provenance: ['domains/atomicIonization.ts#Beer-Lambert attenuation'] },
      ],
      provenance: ['domains/atomicIonization.ts', `fidelity ${ATOMIC_IONIZATION_FIDELITY} — Lotz empirical cross-section, declared apparatus parameters`],
    };

    const eventParameters = { ...next };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('ionization-evt', entity.id, ctx.tick, eventParameters),
      type: ATOMIC_IONIZATION_STEP_EVENT_TYPE,
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'ionization-chamber-step',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: ATOMIC_IONIZATION_SOLVER_ID },
    };

    return {
      patch: { domainState: { ...next } as unknown as Record<string, number>, statusLabel: ionizationStatusLabel(next) },
      grounding: fidelityGrounding(ATOMIC_IONIZATION_FIDELITY),
      observation,
      event,
    };
  };
}

/**
 * The chamber's own real state, as a short allowlisted string — the vocabulary
 * `graphics/ADAPTER_CONTRACT.md` requires of any domain that reaches a
 * renderer. The boundaries are the real ones: the 13.606 eV threshold, and the
 * Lotz peak near 55 eV.
 */
export const IONIZATION_STATES = ['BELOW_THRESHOLD', 'RISING', 'NEAR_PEAK', 'PAST_PEAK'] as const;
export type IonizationStatusLabel = (typeof IONIZATION_STATES)[number];

/** Energy of the Lotz cross-section maximum for hydrogen, about 4.05 * the threshold. */
export const IONIZATION_PEAK_ENERGY_EV = 55.1;

export function ionizationStatusLabel(state: IonizationChamberState): IonizationStatusLabel {
  if (state.beamEnergyEV <= HYDROGEN_IONIZATION_ENERGY_EV) return 'BELOW_THRESHOLD';
  if (state.beamEnergyEV < IONIZATION_PEAK_ENERGY_EV * 0.75) return 'RISING';
  if (state.beamEnergyEV <= IONIZATION_PEAK_ENERGY_EV * 1.5) return 'NEAR_PEAK';
  return 'PAST_PEAK';
}

export interface AddIonizationChamberOptions {
  chamberId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<IonizationChamberState>;
}

export function addIonizationChamber(graph: WorldGraph, options: AddIonizationChamberOptions = {}): EntityId {
  const ref = { kind: 'ionization-chamber', id: options.chamberId ?? 'chamber-1' };
  const params = { ...IONIZATION_DEFAULTS, ...options.params };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Ionisation Chamber (electron impact on atomic hydrogen)',
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: { ...params } as unknown as Record<string, number>,
    domainBinding: { solverId: ATOMIC_IONIZATION_SOLVER_ID, domainId: ATOMIC_IONIZATION_DOMAIN_ID },
    statusLabel: ionizationStatusLabel(params),
    grounding: fidelityGrounding(ATOMIC_IONIZATION_FIDELITY),
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}
