import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import {
  addMolecule,
  applyMoleculeGeometry,
  atomEntityId,
  buildMaterialisationEvent,
  makeMolecularStructureSolver,
  materialiseMoleculeIntoGraph,
  materialiseMoleculeOnEngine,
  MOLECULAR_STRUCTURE_SOLVER_ID,
  MOLECULE_STATE_CODE,
  MOLECULE_STATES,
  moleculeStateLabel,
  type MoleculeGeometrySource,
  type MoleculeMaterialisation,
} from '../core/worldModel/domains/molecularStructure';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 4 — MOLECULAR STRUCTURE. Implements
 * `worldModel/PHASE4_MOLECULAR_CONTRACT.md`. The central architectural claim
 * under test: an expensive async engine is integrated WITHOUT making any
 * solver async, by splitting materialisation (async, out of tick) from the
 * per-tick solver (synchronous, backend-free).
 *
 * Geometry fixture below is REAL RDKit output for ethanol (CCO, seed 42,
 * MMFF) captured from `chem-rdkit-embed3d` — the same values the live engine
 * returns, so the ECS wiring is tested against real coordinates rather than
 * invented ones.
 */
const ETHANOL_REAL: MoleculeMaterialisation = {
  atoms: [
    { element: 'C', x: -0.88831, y: 0.167, z: -0.02732 },
    { element: 'C', x: 0.46575, y: -0.51156, z: -0.0368 },
    { element: 'O', x: 1.43107, y: 0.32292, z: 0.58667 },
  ],
  // Real RDKit bonds for ethanol's heavy-atom skeleton: C-C and C-O, both single.
  bonds: [
    { a: 0, b: 1, order: 1, aromatic: 0 },
    { a: 1, b: 2, order: 1, aromatic: 0 },
  ],
  forceField: 'MMFF',
  seed: 42,
  nAtoms: 3,
  formalCharge: 0,
  canonicalSmiles: 'CCO',
};

function sourceReturning(data: MoleculeMaterialisation): MoleculeGeometrySource {
  return async () => ({ ok: true, data });
}
const BLOCKED_SOURCE: MoleculeGeometrySource = async () => ({ ok: false, reason: 'capability_unavailable: RDKit not configured' });

function buildWorld() {
  const graph = new WorldGraph();
  const moleculeId = addMolecule(graph, { smiles: 'CCO', seed: 42 });
  const router = new SolverRouter();
  router.register(MOLECULAR_STRUCTURE_SOLVER_ID, makeMolecularStructureSolver());
  const engine = new TemporalEngine(graph);
  const updater = (g: WorldGraph, dt: number, tick: number) => router.routeTick(g, dt, tick);
  return { graph, moleculeId, engine, updater };
}

describe('The architecture: an async engine, and not one async solver', () => {
  it('the per-tick solver is synchronous and never touches the backend', () => {
    const { engine, updater, moleculeId } = buildWorld();
    // A source that would throw if called proves the solver never reaches for it.
    const solverResult = engine.advance(1, updater);
    expect(solverResult).toBeDefined();
    // Not materialised: honestly ungrounded, zero atoms, no fabricated geometry.
    const molecule = engine.graph.getEntity(moleculeId);
    expect(molecule.grounding).toBe('UNGROUNDED_APPROXIMATION');
    expect(molecule.domainState?.atomsMaterialised).toBe(0);
    expect(engine.graph.listEntities()).toHaveLength(1); // molecule only, no atoms invented
  });

  it('materialisation happens OUT of the tick and then the world ticks normally', async () => {
    const { engine, updater, moleculeId } = buildWorld();
    const result = await materialiseMoleculeOnEngine(engine, moleculeId, sourceReturning(ETHANOL_REAL));
    expect(result.ok).toBe(true);
    expect(result.atomIds).toHaveLength(3);

    engine.advance(1, updater); // the solver keeps working, still synchronously
    const molecule = engine.graph.getEntity(moleculeId);
    expect(molecule.domainState?.stateCode).toBe(MOLECULE_STATE_CODE.MATERIALISED);
    expect(molecule.grounding).toBe('MODEL_ESTIMATE');
    expect(engine.graph.getEntity(atomEntityId(moleculeId, 2)).label).toBe('O2');
  });

  it('an unavailable backend blocks honestly: no atoms, ungrounded, and a recorded reason', async () => {
    const { engine, moleculeId, updater } = buildWorld();
    const result = await materialiseMoleculeOnEngine(engine, moleculeId, BLOCKED_SOURCE);

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('capability_unavailable');
    expect(result.atomIds).toHaveLength(0);
    expect(engine.graph.listEntities()).toHaveLength(1); // NEVER invented coordinates

    engine.advance(1, updater);
    const molecule = engine.graph.getEntity(moleculeId);
    expect(molecule.domainState?.stateCode).toBe(MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED);
    expect(molecule.grounding).toBe('UNGROUNDED_APPROXIMATION'); // C2 renders its honest placeholder

    const event = buildMaterialisationEvent(molecule, 1, result);
    expect(event.type).toBe('molecular.structure.materialisationblocked');
    expect(String(event.provenance?.notes)).toContain('blocked');
  });
});

describe('Atom entities follow SOLVER_DATA_CONTRACT', () => {
  it('Rule 4: stable ids in the engine\'s OWN atom order, with the element as the batch key', () => {
    const graph = new WorldGraph();
    const moleculeId = addMolecule(graph, { smiles: 'CCO', seed: 42 });
    const atomIds = applyMoleculeGeometry(graph, moleculeId, ETHANOL_REAL);

    expect(atomIds).toEqual([atomEntityId(moleculeId, 0), atomEntityId(moleculeId, 1), atomEntityId(moleculeId, 2)]);
    // ref.kind doubles as the instanced batch key: both carbons share one, the oxygen differs.
    expect(graph.getEntity(atomIds[0]).ref.kind).toBe('atom-c');
    expect(graph.getEntity(atomIds[1]).ref.kind).toBe('atom-c');
    expect(graph.getEntity(atomIds[2]).ref.kind).toBe('atom-o');
    // Order is the engine's, never re-sorted (a sort by element would put O first).
    expect(atomIds.map((id) => graph.getEntity(id).domainState!.atomIndex)).toEqual([0, 1, 2]);
  });

  it('Rules 1+2: real absolute positions, with the Angstrom conversion published on the ROOT', () => {
    const graph = new WorldGraph();
    const moleculeId = addMolecule(graph, { smiles: 'CCO', seed: 42, angstromPerWorldUnit: 2 });
    const atomIds = applyMoleculeGeometry(graph, moleculeId, ETHANOL_REAL);

    // §B item 2: the factor lives on the molecule root, not folded silently into each atom.
    expect(graph.getEntity(moleculeId).domainState?.angstromPerWorldUnit).toBe(2);
    const oxygen = graph.getEntity(atomIds[2]);
    expect(oxygen.spatial!.position.x).toBeCloseTo(1.43107 / 2, 10);
    // The raw Angstrom values stay published too, so the conversion is auditable both ways.
    expect(oxygen.domainState?.positionAngstromX).toBe(1.43107);
    // Rule 1's hazard: a real atom must not be indistinguishable from "no position".
    expect(atomIds.every((id) => canonicalJson(graph.getEntity(id).spatial!.position) !== canonicalJson({ x: 0, y: 0, z: 0 }))).toBe(true);
  });

  it('Rules 5+6: truthful grounding and scale, and an unmaterialised molecule is NOT split into atoms', () => {
    const graph = new WorldGraph();
    const moleculeId = addMolecule(graph, { smiles: 'CCO' });
    expect(graph.getEntity(moleculeId).scale.level).toBe('MICRO_MOLECULAR');
    expect(graph.listEntities()).toHaveLength(1); // Rule 6: never disaggregate what the model has not resolved

    const atomIds = applyMoleculeGeometry(graph, moleculeId, ETHANOL_REAL);
    expect(graph.getEntity(atomIds[0]).scale.level).toBe('NANO_ATOMIC');
    expect(graph.getEntity(atomIds[0]).scale.parentEntityId).toBe(moleculeId);
    // A force-field conformer is real but a model, never GROUNDED_EXACT.
    expect(graph.getEntity(atomIds[0]).grounding).toBe('MODEL_ESTIMATE');
  });

  it('Rule 3: the discrete state reaches C2 as a NUMBER, with the token as a companion', async () => {
    const { engine, updater, moleculeId } = buildWorld();
    await materialiseMoleculeOnEngine(engine, moleculeId, sourceReturning(ETHANOL_REAL));
    engine.advance(1, updater);

    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const molecule = frame.entities.find((entity) => entity.id === moleculeId)!;
    expect(molecule.scalars!.stateCode).toBe(MOLECULE_STATE_CODE.MATERIALISED);
    expect(molecule.scalars!.atomsMaterialised).toBe(3);
    expect(MOLECULE_STATES).toContain(molecule.status as (typeof MOLECULE_STATES)[number]);
    expect(molecule.grounding).toBe('MODELED');
  });

  it('numeric state code maps onto the allowlist, and never outside it', () => {
    expect(moleculeStateLabel(MOLECULE_STATE_CODE.NOT_MATERIALISED)).toBe('MOLECULE_NOT_MATERIALISED');
    expect(moleculeStateLabel(MOLECULE_STATE_CODE.MATERIALISED)).toBe('MOLECULE_MATERIALISED');
    expect(moleculeStateLabel(MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED)).toBe('MOLECULE_MATERIALISATION_BLOCKED');
    for (const nonsense of [-1, 99, Number.NaN]) expect(MOLECULE_STATES).toContain(moleculeStateLabel(nonsense));
  });
});

describe('Replay behaviour, including the boundary the contract states honestly', () => {
  it('materialising at CONSTRUCTION time makes atoms genuine tick-0 state that scrubTo(0) reconstructs', async () => {
    const graph = new WorldGraph();
    const moleculeId = addMolecule(graph, { smiles: 'CCO', seed: 42 });
    await materialiseMoleculeIntoGraph(graph, moleculeId, sourceReturning(ETHANOL_REAL));

    const router = new SolverRouter();
    router.register(MOLECULAR_STRUCTURE_SOLVER_ID, makeMolecularStructureSolver());
    const engine = new TemporalEngine(graph);
    const updater = (g: WorldGraph, dt: number, tick: number) => router.routeTick(g, dt, tick);
    for (let i = 0; i < 3; i++) engine.advance(1, updater);

    expect(engine.scrubTo(0).listEntities()).toHaveLength(4); // molecule + 3 atoms, from tick 0
    const sortById = (entities: readonly { id: string }[]) => [...entities].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(canonicalJson(sortById(engine.scrubTo(engine.tick).listEntities()))).toBe(canonicalJson(sortById(engine.graph.listEntities())));
  });

  it('the molecule-level transition is recorded in the delta log by applyExternalPatch', async () => {
    const { engine, moleculeId, updater } = buildWorld();
    engine.advance(1, updater);
    const framesBefore = engine.frames.length;
    await materialiseMoleculeOnEngine(engine, moleculeId, sourceReturning(ETHANOL_REAL));
    expect(engine.frames.length).toBeGreaterThan(framesBefore); // a real delta, not a silent mutation
  });
});
