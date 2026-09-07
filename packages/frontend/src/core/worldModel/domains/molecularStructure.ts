import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';
import type { TemporalEngine } from '../temporal/temporalEngine';

/**
 * SEVENTH REAL SCIENTIFIC WORLD: molecular structure (Phase 4).
 *
 * Implements the contract in `worldModel/PHASE4_MOLECULAR_CONTRACT.md`.
 * Read that first — in particular §1, which is why nothing here is async.
 *
 * THE CENTRAL RULE OF THIS FILE: **an engine is a DATA SOURCE, not a solver.**
 * RDKit lives behind an HTTP call costing tens to hundreds of milliseconds;
 * `SolverRouter.routeTick` is called by `TemporalEngine.advance`, which is
 * called by `scrubTo`'s replay and by `forkBranch`. Making a solver async
 * would make the entire temporal core async and would mean a world could not
 * be ticked without a live backend. So this module is split in two:
 *
 *  - `materialiseMolecule(...)` — ASYNC, runs OUTSIDE the tick, calls the real
 *    backend once, and writes the result into the graph through the paths that
 *    already exist and are already replay-safe.
 *  - `makeMolecularStructureSolver()` — SYNCHRONOUS, per-tick, reads only what
 *    is already in `domainState`, and NEVER calls the backend.
 *
 * WHAT IS REAL HERE: the coordinates come from RDKit's ETKDGv3 embedding
 * followed by MMFF94 (or UFF) optimisation, at an explicit seed, executed
 * server-side by `compute/rdkit_worker.py`. This module computes no
 * chemistry whatsoever; it adapts a real engine's output into the ECS.
 *
 * HONEST LIMITS:
 *  - A force-field-optimised conformer is ONE low-energy structure from a
 *    stochastic embedding — not a measured (crystallographic/NMR) geometry and
 *    not a conformer ensemble. Hence `MODEL_ESTIMATE`, never `GROUNDED_EXACT`.
 *  - BONDS ARE NOT SHIPPED. `graphics/SOLVER_DATA_CONTRACT.md` §C states that
 *    no channel exists to carry edges to C2 at all. Atoms will render; the
 *    sticks between them cannot, on either side, today. This is a known
 *    contract gap, recorded rather than worked around.
 *  - If the backend is unavailable, the molecule is marked
 *    `UNGROUNDED_APPROXIMATION` with `atomsMaterialised: 0` and NO atom
 *    entities are created. Never invented coordinates — same discipline as
 *    the CMS worker's `DATA_REQUIRED`.
 */
export const MOLECULAR_STRUCTURE_SOLVER_ID = 'molecular-structure-rdkit-conformer';
export const MOLECULAR_DOMAIN_ID = 'molecular-structure';
export const MOLECULE_MATERIALISED_EVENT_TYPE = 'molecular.structure.materialised';
export const MOLECULE_MATERIALISATION_BLOCKED_EVENT_TYPE = 'molecular.structure.materialisationblocked';

/** The backend model this domain consumes. Registered in `packages/backend/src/compute/registry.mjs`. */
export const RDKIT_EMBED3D_MODEL_ID = 'chem-rdkit-embed3d';

/**
 * Discrete state as a NUMBER — `SOLVER_DATA_CONTRACT.md` Rule 3's preferred
 * machine-readable channel. `statusLabel` carries the matching token as a
 * companion for panels, never as the gate.
 */
export const MOLECULE_STATE_CODE = { NOT_MATERIALISED: 0, MATERIALISED: 1, MATERIALISATION_BLOCKED: 2 } as const;
export const MOLECULE_STATES = ['MOLECULE_NOT_MATERIALISED', 'MOLECULE_MATERIALISED', 'MOLECULE_MATERIALISATION_BLOCKED'] as const;
export type MoleculeState = (typeof MOLECULE_STATES)[number];

const STATE_BY_CODE: Readonly<Record<number, MoleculeState>> = {
  [MOLECULE_STATE_CODE.NOT_MATERIALISED]: 'MOLECULE_NOT_MATERIALISED',
  [MOLECULE_STATE_CODE.MATERIALISED]: 'MOLECULE_MATERIALISED',
  [MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED]: 'MOLECULE_MATERIALISATION_BLOCKED',
};

/** Numeric code -> finite token. Pure and exported so the mapping is checkable without a backend. */
export function moleculeStateLabel(stateCode: number): MoleculeState {
  return STATE_BY_CODE[stateCode] ?? 'MOLECULE_NOT_MATERIALISED';
}

/**
 * Ångström per scene world unit. §B item 2 requires the conversion factor to
 * be published as a named scalar ON THE MOLECULE ROOT rather than folded
 * silently into every atom's coordinates, so the scaling stays auditable and
 * adjustable. 1 Å = 1 world unit keeps a small molecule at a few world units
 * across, inside the scene's typical 0.2–20 range.
 */
export const DEFAULT_ANGSTROM_PER_WORLD_UNIT = 1;

export interface MoleculeAtom {
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface MoleculeMaterialisation {
  atoms: readonly MoleculeAtom[];
  forceField: string;
  seed: number;
  nAtoms: number;
  formalCharge: number;
  canonicalSmiles: string;
}

/** What a caller must supply to reach the real engine. Injected so a test can drive the whole path without a live server. */
export type MoleculeGeometrySource = (smiles: string, seed: number) => Promise<
  { ok: true; data: MoleculeMaterialisation } | { ok: false; reason: string }
>;

/**
 * The default source: the real backend HTTP endpoint. Kept separate from the
 * materialiser so tests inject a source rather than mocking global fetch, and
 * so nothing in this module needs a browser environment.
 */
export function createBackendGeometrySource(baseUrl = ''): MoleculeGeometrySource {
  return async (smiles, seed) => {
    try {
      const response = await fetch(`${baseUrl}/api/compute/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelId: RDKIT_EMBED3D_MODEL_ID, inputs: { smiles, seed } }),
      });
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
      const payload = (await response.json()) as { run?: { status?: string; error?: string; message?: string; outputs?: Record<string, unknown> } };
      const run = payload.run;
      if (!run || run.status !== 'ok') return { ok: false, reason: `${run?.error ?? 'no_run'}${run?.message ? `: ${run.message}` : ''}` };
      const outputs = run.outputs ?? {};
      const atoms = outputs.atoms as MoleculeAtom[] | undefined;
      if (!Array.isArray(atoms) || atoms.length === 0) return { ok: false, reason: 'engine_returned_no_atoms' };
      return {
        ok: true,
        data: {
          atoms,
          forceField: String(outputs.forceField ?? 'UNKNOWN'),
          seed: Number(outputs.seed ?? seed),
          nAtoms: Number(outputs.nAtoms ?? atoms.length),
          formalCharge: Number(outputs.formalCharge ?? 0),
          canonicalSmiles: String(outputs.canonicalSmiles ?? smiles),
        },
      };
    } catch (error) {
      return { ok: false, reason: `transport_failed: ${String((error as Error)?.message ?? error).slice(0, 120)}` };
    }
  };
}

export interface AddMoleculeOptions {
  moleculeId?: string;
  label?: string;
  parentEntityId?: EntityId;
  smiles: string;
  seed?: number;
  angstromPerWorldUnit?: number;
}

/**
 * Adds the molecule ROOT entity — with NO atoms yet. A molecule that has not
 * been materialised is a legitimate, shippable state (Rule 6: one entity in,
 * one visual out; never split an aggregate the model does not resolve), so it
 * is `UNGROUNDED_APPROXIMATION` until real coordinates arrive.
 */
export function addMolecule(graph: WorldGraph, options: AddMoleculeOptions): EntityId {
  const ref = { kind: 'molecule', id: options.moleculeId ?? 'molecule-1' };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? `Molecule ${options.smiles}`,
    scale: { level: 'MICRO_MOLECULAR', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    chemical: { formula: options.smiles },
    domainState: {
      stateCode: MOLECULE_STATE_CODE.NOT_MATERIALISED,
      seed: options.seed ?? 42,
      angstromPerWorldUnit: options.angstromPerWorldUnit ?? DEFAULT_ANGSTROM_PER_WORLD_UNIT,
      atomsMaterialised: 0,
    },
    domainBinding: { solverId: MOLECULAR_STRUCTURE_SOLVER_ID, domainId: MOLECULAR_DOMAIN_ID },
    // No real geometry yet — honestly ungrounded rather than a plausible-looking placeholder.
    grounding: 'UNGROUNDED_APPROXIMATION',
    statusLabel: moleculeStateLabel(MOLECULE_STATE_CODE.NOT_MATERIALISED),
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

/** Stable per-atom id: molecule id + the atom's index in RDKit's OWN order (Rule 4 — never re-sorted). */
export function atomEntityId(moleculeId: EntityId, index: number): EntityId {
  return entityId({ kind: 'atom', id: `${moleculeId}:${index}` });
}

/**
 * Writes real atom entities into `graph`, under `moleculeId`.
 *
 * Separated from the async fetch so it can be called from BOTH replay-safe
 * paths: `createScientificWorld`'s `augmentGraph` (construction time) and a
 * live engine via `materialiseMoleculeOnEngine` below.
 */
export function applyMoleculeGeometry(graph: WorldGraph, moleculeId: EntityId, data: MoleculeMaterialisation): readonly EntityId[] {
  const molecule = graph.getEntity(moleculeId);
  const angstromPerWorldUnit = molecule.domainState?.angstromPerWorldUnit ?? DEFAULT_ANGSTROM_PER_WORLD_UNIT;

  const atomIds = data.atoms.map((atom, index) => {
    const id = atomEntityId(moleculeId, index);
    graph.addEntity({
      id,
      // `ref.kind` doubles as the instanced batch key (Rule 4): all carbons batch together.
      ref: { kind: `atom-${atom.element.toLowerCase()}`, id: `${moleculeId}:${index}` },
      label: `${atom.element}${index}`,
      scale: { level: 'NANO_ATOMIC', parentEntityId: moleculeId },
      // Ångström -> scene world units. Absolute within the parent's space (Rule 1).
      spatial: { position: { x: atom.x / angstromPerWorldUnit, y: atom.y / angstromPerWorldUnit, z: atom.z / angstromPerWorldUnit } },
      domainState: { atomIndex: index, positionAngstromX: atom.x, positionAngstromY: atom.y, positionAngstromZ: atom.z },
      // A real, force-field-optimised conformer coordinate — real, but a model, not a measurement.
      grounding: 'MODEL_ESTIMATE',
      updatedAtTick: molecule.updatedAtTick,
    });
    return id;
  });

  graph.updateEntity(moleculeId, {
    domainState: {
      ...molecule.domainState,
      stateCode: MOLECULE_STATE_CODE.MATERIALISED,
      atomsMaterialised: data.nAtoms,
      seed: data.seed,
      formalCharge: data.formalCharge,
      angstromPerWorldUnit,
    },
    chemical: { ...molecule.chemical, formula: data.canonicalSmiles },
    grounding: 'MODEL_ESTIMATE',
    statusLabel: moleculeStateLabel(MOLECULE_STATE_CODE.MATERIALISED),
  });

  return atomIds;
}

export interface MaterialiseResult {
  ok: boolean;
  atomIds: readonly EntityId[];
  reason?: string;
}

/**
 * ASYNC, OUT-OF-TICK materialisation against a LIVE engine.
 *
 * Every state change goes through `TemporalEngine.applyExternalPatch`, which
 * records a real delta, so the molecule's transition to "has geometry" is
 * replayable exactly like a human intervention. The atom entities themselves
 * are added to the live graph; note the documented consequence below.
 *
 * REPLAY SCOPE, stated honestly: `applyExternalPatch` records component
 * patches for EXISTING entities. Adding an entity mid-run is outside what the
 * delta log replays (the same boundary `createScientificWorld`'s `augmentGraph`
 * doc already describes). So a molecule materialised MID-RUN has its atoms in
 * the live graph and its molecule-level state in the delta log, but a
 * `scrubTo` before the materialisation tick will not reconstruct the atoms.
 * For a world that must replay atoms from tick 0, materialise at CONSTRUCTION
 * time via `augmentGraph` instead — `materialiseMoleculeIntoGraph` below is
 * that path, and it is the recommended one.
 */
export async function materialiseMoleculeOnEngine(
  engine: TemporalEngine,
  moleculeId: EntityId,
  source: MoleculeGeometrySource,
): Promise<MaterialiseResult> {
  const molecule = engine.graph.getEntity(moleculeId);
  const smiles = molecule.chemical?.formula ?? '';
  const seed = molecule.domainState?.seed ?? 42;

  const result = await source(smiles, seed);
  if (!result.ok) {
    engine.applyExternalPatch(moleculeId, {
      domainState: { ...molecule.domainState, stateCode: MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED, atomsMaterialised: 0 },
      // Still no real geometry: stays honestly ungrounded so C2 renders its placeholder.
      grounding: 'UNGROUNDED_APPROXIMATION',
      statusLabel: moleculeStateLabel(MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED),
    });
    return { ok: false, atomIds: [], reason: result.reason };
  }

  const atomIds = applyMoleculeGeometry(engine.graph, moleculeId, result.data);
  // Re-apply the molecule-level state through the engine so the transition is in the delta log.
  const materialised = engine.graph.getEntity(moleculeId);
  engine.applyExternalPatch(moleculeId, {
    domainState: { ...materialised.domainState },
    grounding: 'MODEL_ESTIMATE',
    statusLabel: moleculeStateLabel(MOLECULE_STATE_CODE.MATERIALISED),
  });
  return { ok: true, atomIds };
}

/**
 * ASYNC materialisation into a BARE GRAPH, for use inside
 * `createScientificWorld`'s `augmentGraph` (fetch first, then build the world
 * with the geometry already in hand). This is the replay-clean path: the atoms
 * are genuine tick-0 state, so `scrubTo(0)` reconstructs them.
 */
export async function materialiseMoleculeIntoGraph(
  graph: WorldGraph,
  moleculeId: EntityId,
  source: MoleculeGeometrySource,
): Promise<MaterialiseResult> {
  const molecule = graph.getEntity(moleculeId);
  const result = await source(molecule.chemical?.formula ?? '', molecule.domainState?.seed ?? 42);
  if (!result.ok) {
    graph.updateEntity(moleculeId, {
      domainState: { ...molecule.domainState, stateCode: MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED, atomsMaterialised: 0 },
      grounding: 'UNGROUNDED_APPROXIMATION',
      statusLabel: moleculeStateLabel(MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED),
    });
    return { ok: false, atomIds: [], reason: result.reason };
  }
  return { ok: true, atomIds: applyMoleculeGeometry(graph, moleculeId, result.data) };
}

let stepCounter = 0;

/**
 * The SYNCHRONOUS per-tick solver. It publishes what is already known and
 * never reaches for the backend — that is the whole point of the split.
 *
 * A conformer does not evolve: this solver deliberately advances nothing. Its
 * job is to keep the molecule's published scalars and status honest every
 * tick (Rule 1 requires state to be republished, not remembered), which is
 * exactly what a static-geometry domain should do rather than inventing
 * motion it does not model.
 */
export function makeMolecularStructureSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState ?? {};
    const stateCode = state.stateCode ?? MOLECULE_STATE_CODE.NOT_MATERIALISED;
    const materialised = stateCode === MOLECULE_STATE_CODE.MATERIALISED;

    stepCounter += 1;
    const observation: Observation = {
      observationId: `mol-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: ${moleculeStateLabel(stateCode)}, ${state.atomsMaterialised ?? 0} atoms (seed ${state.seed ?? 0})`,
      measurements: [
        { key: 'atomsMaterialised', value: state.atomsMaterialised ?? 0, tick: ctx.tick, entity: entity.ref, provenance: ['compute/rdkit_worker.py#embed3d', 'etkdgv3+mmff'] },
      ],
      provenance: ['compute/rdkit_worker.py', 'rdkit-etkdgv3-mmff', `seed:${state.seed ?? 0}`],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `mol-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'molecular.structure.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'static-conformer-republish',
      parameters: { ...state },
      provenance: { origin: 'model', modelId: MOLECULAR_STRUCTURE_SOLVER_ID, paramsHash: fnv1a(canonicalJson({ id: entity.id, seed: state.seed })) },
    };

    return {
      patch: { domainState: { ...state }, statusLabel: moleculeStateLabel(stateCode) },
      // Grounding tracks reality: real coordinates -> MODEL_ESTIMATE; nothing materialised -> honestly
      // ungrounded, which is what makes C2 render its placeholder instead of an empty molecule.
      grounding: materialised ? 'MODEL_ESTIMATE' : 'UNGROUNDED_APPROXIMATION',
      observation,
      event,
    };
  };
}

/** Builds the materialisation event a caller can record for provenance ("when did this molecule acquire geometry, and from what"). */
export function buildMaterialisationEvent(entity: WorldModelEntity, tick: number, result: MaterialiseResult): GenesisEvent {
  return {
    contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
    id: `mol-mat:${entity.id}:${tick}`,
    type: result.ok ? MOLECULE_MATERIALISED_EVENT_TYPE : MOLECULE_MATERIALISATION_BLOCKED_EVENT_TYPE,
    timestamp: tick,
    source: entity.ref,
    affectedEntities: [entity.ref],
    cause: result.ok ? 'rdkit-embed3d' : 'engine-unavailable',
    parameters: { atomCount: result.atomIds.length, seed: entity.domainState?.seed ?? 0 },
    provenance: {
      origin: 'model',
      modelId: RDKIT_EMBED3D_MODEL_ID,
      notes: result.ok ? 'ETKDGv3 embedding + MMFF/UFF optimisation, deterministic seed' : `blocked: ${result.reason ?? 'unknown'}`,
    },
  };
}
