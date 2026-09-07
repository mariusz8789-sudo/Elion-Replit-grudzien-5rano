import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { GENESIS_RO_CRATE_CONTEXT } from '../core/experimentFabric/evidencePackRoCrate';
import { compareBranches, projectToWorldState } from '../core/worldModel/bridge/worldFrameState';
import { solverCapabilityFor } from '../core/worldModel/capability/solverCapability';
import {
  buildGenesisScientificCity3,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  POPULATION_ACCESS_IMPAIRED_EVENT_TYPE,
  PUMP_TRIPPED_EVENT_TYPE,
} from '../core/worldModel/domains/genesisScientificCity3';
import {
  buildWorldEvidenceBundle,
  classifyGrounding,
  exportWorldEvidenceBundleRoCrate,
  serializeWorldEvidenceBundleRoCrate,
  worldStateFingerprint,
  WORLD_EVIDENCE_BUNDLE_CONTRACT_VERSION,
  type WorldEvidenceBundle,
} from '../core/worldModel/evidence/worldEvidenceBundle';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * EVIDENCE BUNDLE FOR THE FLAGSHIP FLOOD SCENARIO.
 *
 * The flagship scenario runs on WorldGraph/TemporalEngine, which had no
 * export path at all: `evidencePackRoCrate.ts` only served
 * `hypothesisLoop`'s `ScientificEvidencePack`. These tests prove the new
 * adapter is fed by the REAL scenario — real events, real causal ancestry,
 * a real branch comparison, a real replay check — and emits the SAME
 * RO-Crate format as the existing exporter.
 */

const TICKS = 12;

/** The real flagship city, run to `TICKS`. `rainfallAtTick` present = the storm arm. */
function runCity(options: { rainfallAtTick?: number }) {
  const city = buildGenesisScientificCity3(options);
  const engine = new TemporalEngine(city.graph);
  for (let i = 0; i < TICKS; i++) engine.advance(1, city.updater);
  return { city, engine };
}

function worldStateOf(engine: TemporalEngine, worldId: string) {
  return projectToWorldState(engine.graph, worldId, 'flood-hydrology', engine.tick, engine.journal.upToTick(engine.tick));
}

/** Baseline (no storm) vs intervention (extreme rainfall), compared as two real branches. */
function buildFlagshipBundle(options: { withVerification?: boolean } = {}): WorldEvidenceBundle {
  const baseline = runCity({});
  const storm = runCity({ rainfallAtTick: 2 });

  const registry = new TemporalBranchRegistry();
  registry.register(baseline.engine);
  registry.register(storm.engine);
  const comparison = compareBranches(registry, baseline.engine.branchId, storm.engine.branchId, TICKS);

  // A real causal chain from the flagship cascade: population access impaired <- ... <- the pump trip.
  const impaired = storm.engine.journal.allEvents().find((e) => e.type === POPULATION_ACCESS_IMPAIRED_EVENT_TYPE);

  const verification = options.withVerification ? runCity({}) : undefined;

  return buildWorldEvidenceBundle({
    bundleId: 'genesis-urban-resilience-flood-001',
    question: 'If an extreme rainfall event overloads the drainage pump, what happens to hospital water service and population access?',
    worldId: 'genesis-scientific-city-3',
    domainId: 'flood-hydrology',
    baseline: { engine: baseline.engine, worldState: worldStateOf(baseline.engine, 'genesis-scientific-city-3') },
    intervention: {
      engine: storm.engine,
      worldState: worldStateOf(storm.engine, 'genesis-scientific-city-3'),
      description: 'Extreme rainfall (80 mm/h) scheduled at tick 2',
    },
    comparison,
    causalChainEventIds: impaired ? [impaired.id] : [],
    verifyEngine: verification?.engine,
    limitations: [solverCapabilityFor('FLOOD').caveat ?? ''],
    seed: null,
  });
}

describe('The bundle is fed by the real flagship scenario, not a fixture', () => {
  const bundle = buildFlagshipBundle();

  it('carries the user question, the world identity and the real solvers that ran', () => {
    expect(bundle.contractVersion).toBe(WORLD_EVIDENCE_BUNDLE_CONTRACT_VERSION);
    expect(bundle.question).toMatch(/extreme rainfall/);
    expect(bundle.worldId).toBe('genesis-scientific-city-3');
    // These are the solvers the flagship city really binds, read off the graph rather than listed by hand.
    const solverIds = bundle.solvers.map((s) => s.solverId);
    expect(solverIds).toContain('hydraulics-pump-pipe-engineering-model');
    expect(solverIds).toContain('flood-inundation-planar-fill');
    expect(bundle.solvers.length).toBeGreaterThan(2);
  });

  it('classifies every element as REAL / APPROXIMATION / NOT_MODELLED, projected from the real grounding', () => {
    expect(bundle.classification.length).toBeGreaterThan(5);
    for (const element of bundle.classification) {
      expect(['REAL', 'APPROXIMATION', 'NOT_MODELLED']).toContain(element.classification);
      // The projection never loses the underlying level it came from.
      expect(classifyGrounding(element.grounding)).toBe(element.classification);
    }
    // The flagship really contains all three kinds: solver-backed entities, the synthetic-terrain
    // floodplain, and pure container entities nothing advances.
    const kinds = new Set(bundle.classification.map((e) => e.classification));
    expect(kinds.has('REAL')).toBe(true);
    expect(kinds.has('NOT_MODELLED')).toBe(true);
    const floodplain = bundle.classification.find((e) => e.entityId === GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    expect(floodplain.classification).toBe('APPROXIMATION'); // synthetic terrain holds it there
    expect(floodplain.grounding).toBe('PROCEDURAL_APPROXIMATION');
  });

  it('carries a chronological event log containing the real cascade', () => {
    expect(bundle.eventLog.length).toBeGreaterThan(0);
    for (let i = 1; i < bundle.eventLog.length; i++) {
      expect(bundle.eventLog[i].timestamp).toBeGreaterThanOrEqual(bundle.eventLog[i - 1].timestamp);
    }
    expect(bundle.eventLog.some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE)).toBe(true);
  });

  it('carries a real causal chain that ends at a root cause, not a flat list', () => {
    expect(bundle.causalChains.length).toBe(1);
    const chain = bundle.causalChains[0].chain;
    expect(chain.length).toBeGreaterThan(1); // a genuine multi-hop cascade
    expect(chain[0].type).toBe(POPULATION_ACCESS_IMPAIRED_EVENT_TYPE);
    // The chain runs child -> parent and terminates at an event with no parent: the root cause.
    for (let i = 1; i < chain.length; i++) expect(chain[i - 1].parentEventId).toBe(chain[i].id);
    expect(chain[chain.length - 1].parentEventId).toBeUndefined();
  });

  it('reports baseline vs intervention as two real branches, and names what actually differed', () => {
    expect(bundle.intervention).not.toBeNull();
    expect(bundle.baseline.branchId).not.toBe(bundle.intervention!.branchId);
    expect(bundle.comparedAtTick).toBe(TICKS);
    expect(bundle.changedEntityIds.length).toBeGreaterThan(0);
    expect(bundle.changedEntityIds).toContain(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID);
    // The two arms really did diverge — different worlds, different fingerprints.
    expect(bundle.baseline.worldStateFingerprint).not.toBe(bundle.intervention!.worldStateFingerprint);
  });

  it('passes through the scenario\'s own limitations and unmodelled declarations', () => {
    expect(bundle.limitations.join(' ')).toMatch(/Still NOT modelled/);
    expect(bundle.notModelled.length).toBeGreaterThan(0); // container entities no solver advances
  });
});

describe('Replay is verified, or honestly reported as unverified — never assumed', () => {
  it('MATCH only when an independent re-execution was actually run and agreed', () => {
    const bundle = buildFlagshipBundle({ withVerification: true });
    expect(bundle.replay.verdict).toBe('MATCH');
    expect(bundle.replay.recomputedFingerprint).toBe(bundle.replay.recordedFingerprint);
    expect(bundle.replay.message).toMatch(/Independently rebuilt/);
  });

  it('NOT_REPRODUCIBLE when nobody ran a verification — an absence of evidence, not a pass', () => {
    const bundle = buildFlagshipBundle(); // no verifyEngine
    expect(bundle.replay.verdict).toBe('NOT_REPRODUCIBLE');
    expect(bundle.replay.recomputedFingerprint).toBeNull();
    expect(bundle.replay.message).toMatch(/NOT verified/);
  });

  it('uses matrixFoundation\'s existing vocabulary rather than a fourth synonym', () => {
    const bundle = buildFlagshipBundle({ withVerification: true });
    expect(['MATCH', 'DRIFT', 'BLOCKED', 'NOT_REPRODUCIBLE']).toContain(bundle.replay.verdict);
  });

  it('the fingerprint is over real solver-produced scalars: two identical runs agree, a stormy one does not', () => {
    const a = runCity({});
    const b = runCity({});
    const stormy = runCity({ rainfallAtTick: 2 });
    expect(worldStateFingerprint(a.engine)).toBe(worldStateFingerprint(b.engine));
    expect(worldStateFingerprint(stormy.engine)).not.toBe(worldStateFingerprint(a.engine));
  });
});

describe('The RO-Crate projection is the SAME format the existing exporter emits', () => {
  const bundle = buildFlagshipBundle({ withVerification: true });
  const crate = exportWorldEvidenceBundleRoCrate(bundle);

  it('uses the shared @context, imported rather than restated', () => {
    expect(crate['@context']).toEqual(GENESIS_RO_CRATE_CONTEXT);
  });

  it('emits the same protocol / input / activity / result node vocabulary', () => {
    const ids = crate['@graph'].map((n) => n['@id']);
    expect(ids).toContain('./');
    expect(ids.some((id) => id.startsWith('#protocol/'))).toBe(true);
    expect(ids.some((id) => id.startsWith('#input/'))).toBe(true);
    expect(ids.some((id) => id.startsWith('#run/'))).toBe(true);
    expect(ids.some((id) => id.startsWith('#result/'))).toBe(true);

    const activity = crate['@graph'].find((n) => n['@id'].startsWith('#run/'))!;
    expect(activity['@type']).toBe('prov:Activity');
    expect(activity['prov:used']).toBeDefined();
    const result = crate['@graph'].find((n) => n['@id'].startsWith('#result/'))!;
    expect(result['prov:wasGeneratedBy']).toBeDefined();
  });

  it('the root Dataset lists every part, so nothing in the bundle is orphaned', () => {
    const root = crate['@graph'].find((n) => n['@id'] === './')!;
    const parts = (root.hasPart as { '@id': string }[]).map((p) => p['@id']);
    const nonRootIds = crate['@graph'].filter((n) => n['@id'] !== './').map((n) => n['@id']);
    for (const id of nonRootIds) expect(parts).toContain(id);
  });

  it('carries every element the brief requires, addressable in the graph', () => {
    const bundleNode = crate['@graph'].find((n) => n['@id'].startsWith('#evidence-bundle/'))!;
    expect(bundleNode['genesis:replayVerdict']).toBe('MATCH');
    expect(bundleNode['genesis:classification']).toBeDefined();
    expect(bundleNode['genesis:limitations']).toBeDefined();

    const protocolNode = crate['@graph'].find((n) => n['@id'].startsWith('#protocol/'))!;
    expect(protocolNode['genesis:question']).toMatch(/extreme rainfall/);
    expect(protocolNode['genesis:solvers']).toBeDefined();

    const eventLogNode = crate['@graph'].find((n) => n['@id'].startsWith('#event-log/'))!;
    expect((eventLogNode['genesis:events'] as unknown[]).length).toBe(bundle.eventLog.length);

    const causalNode = crate['@graph'].find((n) => n['@id'].startsWith('#causal-chain/'))!;
    expect(causalNode['genesis:causalChains']).toBeDefined();

    const comparisonNode = crate['@graph'].find((n) => n['@id'].startsWith('#comparison/'))!;
    expect(comparisonNode['genesis:changedEntityCount']).toBe(bundle.changedEntityIds.length);
    expect(comparisonNode['prov:wasDerivedFrom']).toHaveLength(2);
  });

  it('is deterministic in its SCIENCE, and honest that event ids are not', () => {
    // Discovered by testing this exporter: Genesis solvers mint event ids from a module-global
    // step counter, so a second build inside the same process produces different event ids. The
    // science is identical. Rather than renaming ids at export or pretending the bytes match,
    // the bundle exposes a fingerprint over everything except those volatile identifiers, and
    // declares the limitation itself.
    const first = buildFlagshipBundle({ withVerification: true });
    const second = buildFlagshipBundle({ withVerification: true });

    expect(first.scientificContentFingerprint).toBe(second.scientificContentFingerprint);
    expect(first.baseline.worldStateFingerprint).toBe(second.baseline.worldStateFingerprint);
    expect(first.intervention!.worldStateFingerprint).toBe(second.intervention!.worldStateFingerprint);
    expect(first.changedEntityIds).toEqual(second.changedEntityIds);
    expect(first.replay.verdict).toBe(second.replay.verdict);
    expect(first.eventLog.map((e) => `${e.type}@${e.timestamp}`)).toEqual(second.eventLog.map((e) => `${e.type}@${e.timestamp}`));

    // The limitation is declared in the bundle rather than left for a consumer to discover.
    expect(first.exportLimitations.join(' ')).toMatch(/process-global step counter/);
    expect(JSON.parse(serializeWorldEvidenceBundleRoCrate(first))['@graph'].length).toBeGreaterThan(5);
  });

  it('node ids are content-derived, so identical science exports identical @ids despite different branch ids', () => {
    const first = buildFlagshipBundle({ withVerification: true });
    const second = buildFlagshipBundle({ withVerification: true });
    // The engines really were different branches of a process-global counter...
    expect(first.baseline.branchId).not.toBe(second.baseline.branchId);
    // ...yet the exported node ids, being derived from content, agree exactly.
    const idsOf = (b: WorldEvidenceBundle) => exportWorldEvidenceBundleRoCrate(b)['@graph'].map((n) => n['@id']).sort();
    expect(idsOf(first)).toEqual(idsOf(second));
  });

  it('is machine-readable JSON, parsing back to the same document', () => {
    const json = serializeWorldEvidenceBundleRoCrate(bundle);
    expect(canonicalJson(JSON.parse(json))).toBe(json);
  });
});

describe('A bundle with no intervention arm is still valid and says so', () => {
  it('reports a baseline-only bundle without inventing a comparison', () => {
    const baseline = runCity({});
    const bundle = buildWorldEvidenceBundle({
      bundleId: 'baseline-only',
      question: 'What does the city do with no storm?',
      worldId: 'genesis-scientific-city-3',
      domainId: 'flood-hydrology',
      baseline: { engine: baseline.engine, worldState: worldStateOf(baseline.engine, 'genesis-scientific-city-3') },
    });
    expect(bundle.intervention).toBeNull();
    expect(bundle.changedEntityIds).toEqual([]);
    expect(bundle.comparedAtTick).toBeNull();
    expect(bundle.replay.verdict).toBe('NOT_REPRODUCIBLE');
    const crate = exportWorldEvidenceBundleRoCrate(bundle);
    expect(crate['@graph'].some((n) => n['@id'].startsWith('#comparison/'))).toBe(false);
  });
});
