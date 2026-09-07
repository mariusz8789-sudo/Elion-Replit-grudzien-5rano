import { describe, expect, it } from 'vitest';
import { classifyRelationshipKind } from '../core/worldModel/ecs/worldGraph';
import { spawnEntity } from '../core/worldModel/ecs/entityFactory';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { validateWorldInvariants } from '../core/worldModel/specification/worldInvariants';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';
import { proposeWorldDeterministically, realizeProposal, validateProposal } from '../core/worldModel/generation/worldModelProposal';
import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../core/events/genesisEvent';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import {
  getCausalAncestry,
  getCausalDescendants,
  getDownstream,
  getEventHistoryFor,
  getRelatedByCategory,
  getUpstream,
} from '../core/worldModel/queries/worldQueries';

/**
 * GENERATIVE SCIENTIFIC WORLD MODEL 2.0 — remaining coverage (mission
 * section 22): world consistency invariants (F), the learned-model
 * proposal architecture (section 15), relationship-category
 * classification and the causal/dependency query additions (M).
 */
describe('World consistency invariants (22.F)', () => {
  it('a well-formed generated graph has exactly one root and passes invariants', () => {
    const graph = new WorldGraph();
    const rootId = spawnEntity(graph, { ref: { kind: 'city', id: 'c1' }, label: 'City', scaleLevel: 'MACRO_CITY' });
    spawnEntity(graph, { ref: { kind: 'building', id: 'b1' }, label: 'Building', scaleLevel: 'BUILDING', parentEntityId: rootId });
    expect(validateWorldInvariants(graph).ok).toBe(true);
  });

  it('flags more than one root as a violation (composed templates must form ONE coherent world)', () => {
    const graph = new WorldGraph();
    spawnEntity(graph, { ref: { kind: 'city', id: 'c1' }, label: 'City', scaleLevel: 'MACRO_CITY' });
    spawnEntity(graph, { ref: { kind: 'city', id: 'c2' }, label: 'Second City', scaleLevel: 'MACRO_CITY' }); // a second, disconnected root
    const result = validateWorldInvariants(graph);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('exactly one root'))).toBe(true);
  });

  it('flags a self-referential relationship', () => {
    const graph = new WorldGraph();
    const id = spawnEntity(graph, { ref: { kind: 'pump', id: 'p1' }, label: 'Pump', scaleLevel: 'MESO_LAB' });
    graph.addRelationship(id, id, 'monitors');
    const result = validateWorldInvariants(graph);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes('Self-referential'))).toBe(true);
  });

  it('generateSpecifiedWorld runs the invariant check automatically and would fail fast on a broken world (verified via the checker directly, since every current template composes validly)', () => {
    const spec: WorldSpecification = { worldId: 'invariant-check', seed: 1, worldType: ['CITY'] };
    const world = generateSpecifiedWorld(spec);
    expect(validateWorldInvariants(world.graph).ok).toBe(true);
  });
});

describe('Relationship categories (causal graph foundation)', () => {
  it('classifies well-known relationship kinds correctly and defaults unknown kinds to functional', () => {
    expect(classifyRelationshipKind('contains')).toBe('hierarchy');
    expect(classifyRelationshipKind('nearBy')).toBe('spatial');
    expect(classifyRelationshipKind('feedsInto')).toBe('functional');
    expect(classifyRelationshipKind('dependsOn')).toBe('dependency');
    expect(classifyRelationshipKind('causes')).toBe('causal');
    expect(classifyRelationshipKind('some-invented-kind')).toBe('functional');
  });

  it('getRelatedByCategory filters relationships by their classified category', () => {
    const graph = new WorldGraph();
    const a = spawnEntity(graph, { ref: { kind: 'a', id: '1' }, label: 'A', scaleLevel: 'MESO_LAB' });
    const b = spawnEntity(graph, { ref: { kind: 'b', id: '1' }, label: 'B', scaleLevel: 'MESO_LAB' });
    const c = spawnEntity(graph, { ref: { kind: 'c', id: '1' }, label: 'C', scaleLevel: 'MESO_LAB' });
    graph.addRelationship(a, b, 'feedsInto'); // functional
    graph.addRelationship(a, c, 'dependsOn'); // dependency
    const engine = new TemporalEngine(graph);

    const functional = getRelatedByCategory(engine, a, 'functional');
    expect(functional.map((r) => r.entity.id)).toEqual([b]);
    const dependency = getRelatedByCategory(engine, a, 'dependency');
    expect(dependency.map((r) => r.entity.id)).toEqual([c]);
  });
});

describe('Downstream/upstream transitive queries', () => {
  it('getDownstream/getUpstream follow a multi-hop relationship chain, with a cycle guard', () => {
    const graph = new WorldGraph();
    const a = spawnEntity(graph, { ref: { kind: 'a', id: '1' }, label: 'A', scaleLevel: 'MESO_LAB' });
    const b = spawnEntity(graph, { ref: { kind: 'b', id: '1' }, label: 'B', scaleLevel: 'MESO_LAB' });
    const c = spawnEntity(graph, { ref: { kind: 'c', id: '1' }, label: 'C', scaleLevel: 'MESO_LAB' });
    graph.addRelationship(a, b, 'feedsInto');
    graph.addRelationship(b, c, 'feedsInto');
    graph.addRelationship(c, a, 'feedsInto'); // cycle back to a
    const engine = new TemporalEngine(graph);

    expect(getDownstream(engine, a).map((e) => e.id).sort()).toEqual([b, c].sort());
    expect(getUpstream(engine, c).map((e) => e.id).sort()).toEqual([a, b].sort());
  });
});

describe('Event history and causal chain queries (22.M)', () => {
  function makeEvent(id: string, timestamp: number, affects: { kind: string; id: string }, parentEventId?: string): GenesisEvent {
    return {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id,
      type: 'test.event.happened',
      timestamp,
      source: affects,
      affectedEntities: [affects],
      cause: 'test',
      parameters: {},
      parentEventId,
    };
  }

  it('getEventHistoryFor returns every event affecting an entity across all recorded time', () => {
    const graph = new WorldGraph();
    const id = spawnEntity(graph, { ref: { kind: 'x', id: '1' }, label: 'X', scaleLevel: 'MESO_LAB' });
    const engine = new TemporalEngine(graph);
    engine.journal.recordEvent(makeEvent('e1', 0, { kind: 'x', id: '1' }));
    engine.journal.recordEvent(makeEvent('e2', 5, { kind: 'x', id: '1' }));
    engine.journal.recordEvent(makeEvent('e3', 5, { kind: 'other', id: '2' }));

    const history = getEventHistoryFor(engine, id);
    expect(history.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('getCausalAncestry and getCausalDescendants walk parentEventId in opposite directions', () => {
    const graph = new WorldGraph();
    const engine = new TemporalEngine(graph);
    const ref = { kind: 'x', id: '1' };
    engine.journal.recordEvent(makeEvent('root', 0, ref));
    engine.journal.recordEvent(makeEvent('mid', 1, ref, 'root'));
    engine.journal.recordEvent(makeEvent('leaf', 2, ref, 'mid'));

    expect(getCausalAncestry(engine, 'leaf').map((e) => e.id)).toEqual(['leaf', 'mid', 'root']);
    expect(getCausalDescendants(engine, 'root').map((e) => e.id).sort()).toEqual(['leaf', 'mid'].sort());
  });

  it('getCausalAncestry guards against a malformed cycle rather than looping forever', () => {
    const graph = new WorldGraph();
    const engine = new TemporalEngine(graph);
    const ref = { kind: 'x', id: '1' };
    engine.journal.recordEvent(makeEvent('a', 0, ref, 'b'));
    engine.journal.recordEvent(makeEvent('b', 1, ref, 'a')); // malformed: a<->b cycle
    expect(getCausalAncestry(engine, 'a').map((e) => e.id)).toEqual(['a', 'b']); // stops, does not loop forever
  });
});

describe('Learned/generative model interface (section 15)', () => {
  it("today's deterministic proposer composes requested templates into a valid, real specification", () => {
    const proposal = proposeWorldDeterministically({ worldId: 'proposed-1', seed: 1, wantsCity: true, wantsWaterSystem: true, populationCount: 10_000 });
    expect(proposal.source).toBe('SCRIPT');
    expect(proposal.schemaVersion).toBe('2.0.0');
    expect(proposal.provenance.createdAt).toBeTruthy();
    expect(proposal.specification.worldType).toEqual(['CITY', 'WATER_SYSTEM']);

    const { validation } = validateProposal(proposal);
    expect(validation.ok).toBe(true);

    const world = realizeProposal(proposal);
    expect(world.graph.getEntity(world.compiled.templateIds.WATER_SYSTEM!.pumpPipeId as string)).toBeTruthy();
  });

  it('a proposal never bypasses validation, regardless of its declared source', () => {
    const invalidProposal = {
      schemaVersion: '2.0.0',
      proposalId: 'bad-1',
      source: 'LLM' as const,
      specification: { worldId: 'bad', seed: 1, worldType: [] } as WorldSpecification,
      provenance: { createdAt: new Date().toISOString() },
    };
    expect(validateProposal(invalidProposal).validation.ok).toBe(false);
    expect(() => realizeProposal(invalidProposal)).toThrow(/failed validation/);
  });
});
