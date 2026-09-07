import { describe, expect, it } from 'vitest';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisScientificCity3 } from '../core/worldModel/domains/genesisScientificCity3';
import {
  addMolecule,
  atomEntityId,
  bondKindOf,
  bondOrderOf,
  materialiseMoleculeIntoGraph,
  makeMolecularStructureSolver,
  MOLECULAR_BOND_KIND,
  MOLECULAR_BOND_KINDS,
  MOLECULAR_STRUCTURE_SOLVER_ID,
  type MoleculeGeometrySource,
  type MoleculeMaterialisation,
} from '../core/worldModel/domains/molecularStructure';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 8.1 — THE BOND / EDGE CHANNEL.
 *
 * `SOLVER_DATA_CONTRACT.md` §C: "Relationships therefore cannot reach C2
 * through the frame contract at all today." These tests exist to make that
 * sentence false, and to keep it false.
 *
 * The benzene fixture below is REAL `chem-rdkit-embed3d` output shape captured
 * from the live engine (12 atoms, 12 bonds: 6 aromatic ring bonds at order 1.5
 * plus 6 single C-H). Coordinates are truncated to what the assertions need;
 * the bond topology is exactly what RDKit returned.
 */
const BENZENE_BONDS = [
  { a: 0, b: 1, order: 1.5, aromatic: 1 },
  { a: 1, b: 2, order: 1.5, aromatic: 1 },
  { a: 2, b: 3, order: 1.5, aromatic: 1 },
  { a: 3, b: 4, order: 1.5, aromatic: 1 },
  { a: 4, b: 5, order: 1.5, aromatic: 1 },
  { a: 5, b: 0, order: 1.5, aromatic: 1 },
  { a: 0, b: 6, order: 1, aromatic: 0 },
  { a: 1, b: 7, order: 1, aromatic: 0 },
];

function benzene(): MoleculeMaterialisation {
  return {
    atoms: Array.from({ length: 8 }, (_, i) => ({ element: i < 6 ? 'C' : 'H', x: i * 1.4, y: 0.3, z: -0.2 })),
    bonds: BENZENE_BONDS,
    forceField: 'MMFF',
    seed: 42,
    nAtoms: 8,
    formalCharge: 0,
    canonicalSmiles: 'c1ccccc1',
  };
}
const sourceOf = (data: MoleculeMaterialisation): MoleculeGeometrySource => async () => ({ ok: true, data });

async function materialisedWorld(data: MoleculeMaterialisation) {
  const graph = new WorldGraph();
  const moleculeId = addMolecule(graph, { smiles: data.canonicalSmiles, seed: 42 });
  await materialiseMoleculeIntoGraph(graph, moleculeId, sourceOf(data));
  const router = new SolverRouter();
  router.register(MOLECULAR_STRUCTURE_SOLVER_ID, makeMolecularStructureSolver());
  const engine = new TemporalEngine(graph);
  engine.advance(1, (g, dt, tick) => router.routeTick(g, dt, tick));
  return { graph, moleculeId, engine };
}

describe('Bonds are real RDKit topology, never inferred from distance', () => {
  it('bond order maps onto the closed allowlist, with aromatic winning over the raw 1.5', () => {
    expect(bondKindOf({ a: 0, b: 1, order: 1.5, aromatic: 1 })).toBe(MOLECULAR_BOND_KIND.AROMATIC);
    expect(bondKindOf({ a: 0, b: 1, order: 1, aromatic: 0 })).toBe(MOLECULAR_BOND_KIND.SINGLE);
    expect(bondKindOf({ a: 0, b: 1, order: 2, aromatic: 0 })).toBe(MOLECULAR_BOND_KIND.DOUBLE);
    expect(bondKindOf({ a: 0, b: 1, order: 3, aromatic: 0 })).toBe(MOLECULAR_BOND_KIND.TRIPLE);
    // An order nobody recognises falls back rather than inventing a token.
    expect(MOLECULAR_BOND_KINDS).toContain(bondKindOf({ a: 0, b: 1, order: 7, aromatic: 0 }));
  });

  it('bondOrderOf is a total inverse, and a non-bond edge decodes to 0 rather than a guess', () => {
    expect(bondOrderOf(MOLECULAR_BOND_KIND.AROMATIC)).toBe(1.5);
    expect(bondOrderOf(MOLECULAR_BOND_KIND.TRIPLE)).toBe(3);
    for (const notABond of ['feedsInto', 'cools', 'shakes', '']) expect(bondOrderOf(notABond)).toBe(0);
  });

  it('materialisation turns the engine\'s bond list into real graph edges between atom ids', async () => {
    const { graph, moleculeId } = await materialisedWorld(benzene());
    const bonds = graph.listRelationships();
    expect(bonds).toHaveLength(BENZENE_BONDS.length);
    // Six aromatic ring bonds — the chemistry, not a count of anything drawn.
    expect(bonds.filter((b) => b.kind === MOLECULAR_BOND_KIND.AROMATIC)).toHaveLength(6);
    expect(bonds.filter((b) => b.kind === MOLECULAR_BOND_KIND.SINGLE)).toHaveLength(2);
    // Endpoints are atom ENTITY IDS, per Rule 4 and §C — never indices.
    expect(bonds[0].from).toBe(atomEntityId(moleculeId, 0));
    expect(bonds[0].to).toBe(atomEntityId(moleculeId, 1));
    expect(graph.getEntity(moleculeId).domainState?.bondsMaterialised).toBe(BENZENE_BONDS.length);
  });

  it('an out-of-range bond index is dropped, never clamped onto the wrong atom', async () => {
    const broken = { ...benzene(), bonds: [{ a: 0, b: 1, order: 1, aromatic: 0 }, { a: 0, b: 99, order: 1, aromatic: 0 }, { a: -1, b: 2, order: 1, aromatic: 0 }] };
    const { graph, moleculeId } = await materialisedWorld(broken);
    expect(graph.listRelationships()).toHaveLength(1);
    expect(graph.getEntity(moleculeId).domainState?.bondsMaterialised).toBe(1);
  });

  it('a molecule the engine gave no bonds for gets atoms and no edges — honest, not guessed', async () => {
    const { graph, moleculeId } = await materialisedWorld({ ...benzene(), bonds: [] });
    expect(graph.listEntities().length).toBeGreaterThan(1); // atoms are there
    expect(graph.listRelationships()).toHaveLength(0);      // sticks are not invented
    expect(graph.getEntity(moleculeId).domainState?.bondsMaterialised).toBe(0);
  });
});

describe('The channel reaches C2', () => {
  it('C3 frame carries the edges as {fromEntityId, toEntityId, kind}', async () => {
    const { engine, moleculeId } = await materialisedWorld(benzene());
    const frame = getFrameState(engine);
    expect(frame.relationships).toHaveLength(BENZENE_BONDS.length);
    const first = frame.relationships[0];
    expect(first.fromEntityId).toBe(atomEntityId(moleculeId, 0));
    expect(first.toEntityId).toBe(atomEntityId(moleculeId, 1));
    expect(first.kind).toBe(MOLECULAR_BOND_KIND.AROMATIC);
    // Every endpoint must be an entity actually present in the same frame.
    const ids = new Set(frame.entities.map((e) => e.id));
    for (const r of frame.relationships) {
      expect(ids.has(r.fromEntityId)).toBe(true);
      expect(ids.has(r.toEntityId)).toBe(true);
    }
  });

  it('the graphics adapter forwards them field-for-field as {from, to, kind}', async () => {
    const { engine, moleculeId } = await materialisedWorld(benzene());
    const graphics = toGraphicsWorldFrame(getFrameState(engine));
    expect(graphics.relationships).toHaveLength(BENZENE_BONDS.length);
    expect(graphics.relationships![0]).toEqual({
      from: atomEntityId(moleculeId, 0),
      to: atomEntityId(moleculeId, 1),
      kind: MOLECULAR_BOND_KIND.AROMATIC,
    });
    // A consumer that wants the number gets it without parsing the token.
    expect(graphics.relationships!.map((r) => bondOrderOf(r.kind)).filter((o) => o === 1.5)).toHaveLength(6);
  });

  it('containment is NOT duplicated into the edge channel — parentId stays the single source', async () => {
    const { engine, moleculeId } = await materialisedWorld(benzene());
    const frame = getFrameState(engine);
    expect(frame.relationships.every((r) => r.kind !== 'contains')).toBe(true);
    expect(frame.entities.filter((e) => e.parentId === moleculeId).length).toBe(8);
  });

  it('non-molecular worlds carry their existing edges through the same channel, unchanged', () => {
    const city = buildGenesisScientificCity3({});
    const engine = new TemporalEngine(city.graph);
    engine.advance(1, city.updater);
    const kinds = getFrameState(engine).relationships.map((r) => r.kind);
    // The city's own declared edges — the channel is generic, not a chemistry special case.
    expect(kinds).toContain('feedsInto');
    expect(kinds).toContain('loads');
    expect(kinds).toContain('cools');
  });

  it('replay reconstructs the edges: scrubTo gives the same frame relationships', async () => {
    const { engine } = await materialisedWorld(benzene());
    engine.advance(1, () => ({ updated: [], ungrounded: [], observations: [], events: [] }));
    const live = getFrameState(engine).relationships;
    const replayed = getFrameState(engine, engine.tick).relationships;
    expect(replayed).toEqual(live);
  });
});
