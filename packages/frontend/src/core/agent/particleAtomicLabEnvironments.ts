import {
  getReactionChannel,
  REACTION_CHANNELS,
  weakestFidelity,
  type FidelityTier,
} from '../worldModel/domains/particlePhysics';
import { GENESIS_ATOMIC_IONIZATION_CATALOG_ID } from './atomicIonizationLeverCatalog';
import { GENESIS_PARTICLE_PHYSICS_CATALOG_ID } from './particlePhysicsLeverCatalog';

/**
 * GENESIS PARTICLE & ATOMIC PHYSICS LABORATORY — the environments.
 *
 * This is the file that answers the one question the Qwen "Particle & Atomic
 * Physics Laboratory" proposal was really about: how does a user move from a
 * CERN/LHC-like setting to a Collider, Nuclear, Atomic, Plasma or Custom lab
 * without Genesis growing a second engine to do it?
 *
 * The answer is that an environment is NOT an engine, an orchestrator, a state
 * machine or a screen. It is a NAME FOR A CONFIGURATION: which reaction
 * channels are available, and which existing lever catalogue — if any — the
 * existing Discovery Loop can run there. Virtual CERN is one row in this table,
 * not the boundary of what Genesis can do. Qwen's `orchestrator.ts`,
 * `stateMachine.ts`, `beamAccelerator.ts`, `eventPlayback.ts` and the whole
 * adapter stack were rejected precisely because they would have made an
 * environment into an engine.
 *
 * ## Why `status` exists and is not decoration
 *
 * Qwen's table declared all six environments equally real. Two of them are: the
 * collider and the ionisation chamber have apparatus, levers, solvers and
 * tests. The others do not, and saying so is the point. `status` is the field
 * that stops this registry from being a brochure:
 *
 *  - `RUNNABLE` — a real lever catalogue is registered, so the existing
 *    Discovery Loop can run a real search here today and produce a real
 *    Evidence Bundle.
 *  - `CHANNELS_ONLY` — the reaction channels listed are real, executable and
 *    tested, but no apparatus is wired, so there is nothing to run a search on
 *    yet. A user can compute a final state; they cannot run an experiment.
 *  - `NOT_BUILT` — the name is reserved and nothing behind it exists. Declaring
 *    it is how the roadmap stays visible without anything pretending to work.
 *
 * Qwen's `PLASMA_LAB` shipped with a single toy ion-ion channel behind it. That
 * channel was rejected for having no physics in it, so the environment is
 * `NOT_BUILT` here rather than quietly listed as available.
 */
export const LAB_ENVIRONMENT_IDS = [
  'VIRTUAL_CERN_LHC_LIKE',
  'COLLIDER_LAB',
  'NUCLEAR_LAB',
  'ATOMIC_LAB',
  'PLASMA_LAB',
  'CUSTOM_EXPERIMENT_LAB',
] as const;
export type LabEnvironmentId = (typeof LAB_ENVIRONMENT_IDS)[number];

export const LAB_ENVIRONMENT_STATUSES = ['RUNNABLE', 'CHANNELS_ONLY', 'NOT_BUILT'] as const;
export type LabEnvironmentStatus = (typeof LAB_ENVIRONMENT_STATUSES)[number];

export interface LabEnvironment {
  readonly environmentId: LabEnvironmentId;
  readonly label: string;
  readonly status: LabEnvironmentStatus;
  /** Reaction channels available here. Every id must resolve in `REACTION_CHANNELS`. */
  readonly channelIds: readonly string[];
  /**
   * The existing lever catalogue the Discovery Loop runs in this environment,
   * or null when no apparatus is wired. Never a new loop — always a catalogue
   * id already registered in `WORLD_LEVER_CATALOGS`.
   */
  readonly discoveryCatalogId: string | null;
  /** What a reader must know before trusting anything produced here. */
  readonly epistemicNote: string;
}

export const LAB_ENVIRONMENTS: Record<LabEnvironmentId, LabEnvironment> = {
  VIRTUAL_CERN_LHC_LIKE: {
    environmentId: 'VIRTUAL_CERN_LHC_LIKE',
    label: 'Virtual CERN / LHC-like',
    status: 'RUNNABLE',
    channelIds: ['ee-annihilation', 'ee-z-resonance', 'pp-elastic'],
    discoveryCatalogId: GENESIS_PARTICLE_PHYSICS_CATALOG_ID,
    epistemicNote: 'A di-muon resonance search at an idealised e+e- machine. NOT a model of the real LHC: no geometry, beam optics or detector of any existing experiment is reproduced, and yields are arbitrary normalised units, never picobarns.',
  },
  COLLIDER_LAB: {
    environmentId: 'COLLIDER_LAB',
    label: 'Generic Collider Lab',
    status: 'RUNNABLE',
    channelIds: ['ee-annihilation', 'ee-z-resonance', 'pp-elastic', 'muon-capture'],
    discoveryCatalogId: GENESIS_PARTICLE_PHYSICS_CATALOG_ID,
    epistemicNote: 'The same apparatus as the CERN-like environment without the LHC framing — which is the honest description, since nothing in the model was CERN-specific to begin with.',
  },
  NUCLEAR_LAB: {
    environmentId: 'NUCLEAR_LAB',
    label: 'Nuclear Lab',
    status: 'CHANNELS_ONLY',
    channelIds: ['muon-capture', 'muon-decay'],
    discoveryCatalogId: null,
    epistemicNote: 'Both channels are real and exact in their kinematics — muon capture on a FREE proton, and the V-A Michel decay spectrum. But no apparatus, rate model or nuclear structure is wired, so a final state can be computed here and an experiment cannot yet be run.',
  },
  ATOMIC_LAB: {
    environmentId: 'ATOMIC_LAB',
    label: 'Atomic Lab',
    status: 'RUNNABLE',
    channelIds: ['electron-impact-ionization'],
    discoveryCatalogId: GENESIS_ATOMIC_IONIZATION_CATALOG_ID,
    epistemicNote: 'Electron-impact ionisation of ground-state atomic hydrogen at the Lotz (1967) measured cross-section. The threshold and the non-monotonic energy response are real; the beam current, residual gas and dark rate are declared apparatus parameters.',
  },
  PLASMA_LAB: {
    environmentId: 'PLASMA_LAB',
    label: 'Plasma Lab',
    status: 'NOT_BUILT',
    channelIds: [],
    discoveryCatalogId: null,
    epistemicNote: 'Reserved, and empty. A plasma environment needs collective behaviour — Debye screening, collision frequencies, an ionisation balance — and none of that exists here. The proposal that named this environment backed it with one unfitted toy channel, which was rejected rather than listed.',
  },
  CUSTOM_EXPERIMENT_LAB: {
    environmentId: 'CUSTOM_EXPERIMENT_LAB',
    label: 'Custom Experiment Lab',
    status: 'CHANNELS_ONLY',
    channelIds: REACTION_CHANNELS.map((c) => c.channelId),
    discoveryCatalogId: null,
    epistemicNote: 'Every executable channel in the laboratory, with no fixed apparatus. Intended for composing a final state by hand; a search still has to be run in one of the RUNNABLE environments.',
  },
};

export function getLabEnvironment(environmentId: LabEnvironmentId): LabEnvironment {
  return LAB_ENVIRONMENTS[environmentId];
}

/** Every environment a user can actually run a discovery search in, today. */
export function runnableLabEnvironments(): readonly LabEnvironment[] {
  return LAB_ENVIRONMENT_IDS.map((id) => LAB_ENVIRONMENTS[id]).filter((e) => e.status === 'RUNNABLE');
}

/**
 * The WEAKEST fidelity among an environment's channels — the tier a run in it
 * may honestly claim. Reporting the best tier available would let one exact
 * channel launder a simplified one sitting next to it.
 *
 * Null for an environment with no channels at all.
 */
export function environmentFidelityFloor(environmentId: LabEnvironmentId): FidelityTier | null {
  const tiers = LAB_ENVIRONMENTS[environmentId].channelIds
    .map((id) => getReactionChannel(id))
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => c.fidelity);
  return tiers.length === 0 ? null : weakestFidelity(tiers);
}
