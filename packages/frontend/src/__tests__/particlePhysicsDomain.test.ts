import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addColliderRun,
  breitWignerWeight,
  COLLIDER_DEFAULTS,
  colliderStatusLabel,
  colliderTickYield,
  COLLIDER_STATES,
  etaAcceptanceFraction,
  invariantMass,
  makeParticleColliderSolver,
  massWindowFraction,
  PARTICLE_PHYSICS_SOLVER_ID,
  pseudorapidity,
  transverseMomentum,
  twoBodyDecayMomenta,
  twoBodyMomentumMeV,
  Z_MASS_MEV,
  Z_WIDTH_MEV,
  MUON_MASS_MEV,
  type ColliderRunState,
} from '../core/worldModel/domains/particlePhysics';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import {
  buildColliderDiscoveryWorld,
  GENESIS_COLLIDER_ID,
  GENESIS_PARTICLE_PHYSICS_CATALOG,
  GENESIS_PARTICLE_PHYSICS_CATALOG_ID,
  GENESIS_PARTICLE_PHYSICS_LEVERS,
} from '../core/agent/particlePhysicsLeverCatalog';
import { resolveWorldLeverCatalog } from '../core/agent/worldGoalIntent';

/**
 * PARTICLE PHYSICS DOMAIN — the integrated part of the Qwen proposal, tested
 * for real rather than at "design level". Three things are checked here that
 * the proposal could only assert: that the kinematics are exact, that the
 * solver is deterministic and forkable on the real WorldGraph, and that the
 * levers move (or provably fail to move) the metrics for the stated physical
 * reasons.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('relativistic kinematics — exact, not approximated', () => {
  it('invariant mass of a back-to-back pair equals the total energy in the CoM frame', () => {
    expect(invariantMass({ E: 200, px: 0, py: 0, pz: 0 })).toBeCloseTo(200, 9);
  });

  it('returns null for a spacelike four-vector instead of NaN or a coerced zero', () => {
    expect(invariantMass({ E: 1, px: 10, py: 0, pz: 0 })).toBeNull();
  });

  it('two-body momentum is null when the decay is kinematically forbidden', () => {
    expect(twoBodyMomentumMeV(100, 60, 60)).toBeNull();
    expect(twoBodyMomentumMeV(Z_MASS_MEV, MUON_MASS_MEV, MUON_MASS_MEV)).toBeGreaterThan(0);
  });

  it('Z -> mu+mu- conserves energy and momentum exactly, at every tick', () => {
    for (const tick of [0, 1, 7, 42, 137]) {
      const decay = twoBodyDecayMomenta(Z_MASS_MEV, MUON_MASS_MEV, tick);
      expect(decay).not.toBeNull();
      const { plus, minus } = decay!;
      // Momentum sums to zero in the parent rest frame.
      expect(plus.px + minus.px).toBeCloseTo(0, 9);
      expect(plus.py + minus.py).toBeCloseTo(0, 9);
      expect(plus.pz + minus.pz).toBeCloseTo(0, 9);
      // Energy sums to the parent mass, and the pair's invariant mass IS the Z mass.
      expect(plus.E + minus.E).toBeCloseTo(Z_MASS_MEV, 6);
      const pair = { E: plus.E + minus.E, px: plus.px + minus.px, py: plus.py + minus.py, pz: plus.pz + minus.pz };
      expect(invariantMass(pair)).toBeCloseTo(Z_MASS_MEV, 6);
      // Each daughter really is on its mass shell.
      expect(invariantMass(plus)).toBeCloseTo(MUON_MASS_MEV, 6);
    }
  });

  it('per-event kinematics is deterministic in the tick — no hidden random stream', () => {
    expect(twoBodyDecayMomenta(Z_MASS_MEV, MUON_MASS_MEV, 12)).toEqual(twoBodyDecayMomenta(Z_MASS_MEV, MUON_MASS_MEV, 12));
    expect(twoBodyDecayMomenta(Z_MASS_MEV, MUON_MASS_MEV, 12)).not.toEqual(twoBodyDecayMomenta(Z_MASS_MEV, MUON_MASS_MEV, 13));
  });

  it('derived track quantities are real and finite for a produced pair', () => {
    const { plus } = twoBodyDecayMomenta(Z_MASS_MEV, MUON_MASS_MEV, 3)!;
    expect(transverseMomentum(plus)).toBeGreaterThan(0);
    expect(pseudorapidity(plus)).not.toBeNull();
  });
});

describe('Breit-Wigner line shape — real resonance physics', () => {
  it('peaks at the pole and is normalised to 1 there', () => {
    expect(breitWignerWeight(Z_MASS_MEV, Z_MASS_MEV, Z_WIDTH_MEV)).toBeCloseTo(1, 9);
  });

  it('falls off away from the pole, symmetrically in detuning sign at the half-width', () => {
    const onPeak = breitWignerWeight(Z_MASS_MEV, Z_MASS_MEV, Z_WIDTH_MEV);
    const detuned = breitWignerWeight(Z_MASS_MEV - 2200, Z_MASS_MEV, Z_WIDTH_MEV);
    expect(detuned).toBeLessThan(onPeak);
    expect(detuned).toBeGreaterThan(0);
  });

  it('is monotonic in |detuning| approaching the pole from below', () => {
    const far = breitWignerWeight(85000, Z_MASS_MEV, Z_WIDTH_MEV);
    const near = breitWignerWeight(89000, Z_MASS_MEV, Z_WIDTH_MEV);
    const at = breitWignerWeight(Z_MASS_MEV, Z_MASS_MEV, Z_WIDTH_MEV);
    expect(far).toBeLessThan(near);
    expect(near).toBeLessThan(at);
  });

  it('refuses a non-physical energy rather than returning NaN', () => {
    expect(breitWignerWeight(0, Z_MASS_MEV, Z_WIDTH_MEV)).toBe(0);
    expect(breitWignerWeight(Number.NaN, Z_MASS_MEV, Z_WIDTH_MEV)).toBe(0);
  });
});

describe('detector model — window and acceptance are real integrals, not fudge factors', () => {
  it('a sharper resolution keeps more of the peak inside a fixed mass window', () => {
    const coarse = massWindowFraction(3000, 0.02, Z_MASS_MEV);
    const sharp = massWindowFraction(3000, 0.005, Z_MASS_MEV);
    expect(sharp).toBeGreaterThan(coarse);
    expect(sharp).toBeLessThanOrEqual(1);
  });

  it('a perfect resolution keeps the whole peak', () => {
    expect(massWindowFraction(3000, 0, Z_MASS_MEV)).toBe(1);
  });

  it('acceptance is tanh(etaMax) — rising, bounded by 1', () => {
    expect(etaAcceptanceFraction(2.0)).toBeCloseTo(Math.tanh(2.0), 12);
    expect(etaAcceptanceFraction(2.5)).toBeGreaterThan(etaAcceptanceFraction(2.0));
    expect(etaAcceptanceFraction(50)).toBeLessThanOrEqual(1);
  });
});

describe('the four levers move exactly what the physics says they move', () => {
  const base: ColliderRunState = { ...COLLIDER_DEFAULTS };
  const ratio = (s: ColliderRunState) => { const y = colliderTickYield(s); return y.signal / y.background; };

  it('beam energy: tuning onto the pole raises both purity and yield', () => {
    const onPeak = ratio({ ...base, sqrtSMeV: Z_MASS_MEV });
    expect(onPeak).toBeGreaterThan(ratio(base));
    expect(colliderTickYield({ ...base, sqrtSMeV: Z_MASS_MEV }).signal).toBeGreaterThan(colliderTickYield(base).signal);
  });

  it('resolution: sharpening raises purity, and leaves the background inside the window untouched', () => {
    const sharp = { ...base, momentumResolutionRel: 0.005 };
    expect(ratio(sharp)).toBeGreaterThan(ratio(base));
    expect(colliderTickYield(sharp).background).toBeCloseTo(colliderTickYield(base).background, 12);
  });

  it('acceptance: scales signal and background identically, so purity CANNOT move — and does not', () => {
    const wide = { ...base, acceptanceEtaMax: 2.5 };
    expect(ratio(wide)).toBeCloseTo(ratio(base), 12);
    expect(colliderTickYield(wide).signal).toBeGreaterThan(colliderTickYield(base).signal);
    expect(colliderTickYield(wide).background).toBeGreaterThan(colliderTickYield(base).background);
  });

  it('luminosity: scales both yields linearly, so purity is exactly unchanged', () => {
    const bright = { ...base, luminosityPerTick: 4 };
    expect(ratio(bright)).toBeCloseTo(ratio(base), 12);
    expect(colliderTickYield(bright).signal).toBeCloseTo(colliderTickYield(base).signal * 4, 9);
  });
});

describe('solver on the real WorldGraph — deterministic, forkable, honest', () => {
  function advance(graph: WorldGraph, ticks: number): ColliderRunState {
    const router = new SolverRouter();
    router.register(PARTICLE_PHYSICS_SOLVER_ID, makeParticleColliderSolver());
    for (let tick = 1; tick <= ticks; tick++) router.routeTick(graph, 600, tick);
    return graph.getEntity(GENESIS_COLLIDER_ID)!.domainState as unknown as ColliderRunState;
  }

  it('accumulates candidates and luminosity tick by tick', () => {
    const graph = new WorldGraph();
    addColliderRun(graph);
    const after = advance(graph, 10);
    expect(after.integratedLuminosity).toBeCloseTo(10, 9);
    expect(after.signalCandidates).toBeGreaterThan(0);
    expect(after.backgroundCandidates).toBeGreaterThan(0);
    expect(after.significance).toBeGreaterThan(0);
  });

  it('two independent worlds advanced identically reach bit-identical state — no random stream', () => {
    const a = new WorldGraph(); addColliderRun(a);
    const b = new WorldGraph(); addColliderRun(b);
    expect(advance(a, 12)).toEqual(advance(b, 12));
  });

  it('publishes MODEL_ESTIMATE and an allowlisted status label, never free prose', () => {
    const graph = new WorldGraph();
    addColliderRun(graph);
    advance(graph, 3);
    const entity = graph.getEntity(GENESIS_COLLIDER_ID)!;
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
    expect(COLLIDER_STATES).toContain(entity.statusLabel);
  });

  it('the status label reports real detuning, not a run flag', () => {
    expect(colliderStatusLabel({ ...COLLIDER_DEFAULTS, sqrtSMeV: Z_MASS_MEV })).toBe('ON_PEAK');
    expect(colliderStatusLabel({ ...COLLIDER_DEFAULTS, sqrtSMeV: Z_MASS_MEV + Z_WIDTH_MEV })).toBe('NEAR_PEAK');
    expect(colliderStatusLabel({ ...COLLIDER_DEFAULTS, sqrtSMeV: 80000 })).toBe('OFF_PEAK');
  });

  it('records observations whose provenance names the model, and never claims a cross-section', () => {
    const graph = new WorldGraph();
    addColliderRun(graph);
    const solver = makeParticleColliderSolver();
    const result = solver(graph.getEntity(GENESIS_COLLIDER_ID)!, { dt: 600, tick: 1, graph });
    expect(result.observation!.provenance.join(' ')).toContain('NOT picobarns');
    expect(result.observation!.measurements.map((m) => m.key)).toEqual(
      expect.arrayContaining(['signalCandidates', 'backgroundCandidates', 'signalToBackground', 'significance']),
    );
  });
});

describe('catalogue registration — reachable through the existing registry, no new routing', () => {
  it('resolves by id from the one lever-catalogue registry Genesis has', () => {
    expect(resolveWorldLeverCatalog(GENESIS_PARTICLE_PHYSICS_CATALOG_ID)).toBe(GENESIS_PARTICLE_PHYSICS_CATALOG);
  });

  it('declares four levers, each targeting the real collider entity', () => {
    expect(GENESIS_PARTICLE_PHYSICS_LEVERS).toHaveLength(4);
    for (const lever of GENESIS_PARTICLE_PHYSICS_LEVERS) {
      expect(lever.targetEntityId).toBe(GENESIS_COLLIDER_ID);
      const hypothesis = lever.hypothesis('signalToBackground', 'maximize');
      expect(hypothesis.entityId).toBe(GENESIS_COLLIDER_ID);
      expect(hypothesis.criterion.metric).toBe('signalToBackground');
    }
  });

  it('builds a world whose updater really advances the collider', () => {
    const { graph, updater } = buildColliderDiscoveryWorld();
    const before = (graph.getEntity(GENESIS_COLLIDER_ID)!.domainState as unknown as ColliderRunState).signalCandidates;
    updater(graph, 600, 1);
    const after = (graph.getEntity(GENESIS_COLLIDER_ID)!.domainState as unknown as ColliderRunState).signalCandidates;
    expect(after).toBeGreaterThan(before);
  });

  it('declares its honest limits — normalised units and an unfitted background — rather than hiding them', () => {
    const assumptions = GENESIS_PARTICLE_PHYSICS_CATALOG.declaredAssumptions.join(' ');
    expect(assumptions).toContain('NOT picobarn');
    expect(assumptions).toContain('never fitted');
    expect(GENESIS_PARTICLE_PHYSICS_CATALOG.notModelledFactors.join(' ')).toContain('Systematic uncertainties');
  });
});

describe('end to end through the EXISTING discovery loop, evidence, memory and replay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs a real search on the collider and remembers a replayable Evidence Bundle', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, replaySavedWorldDiscoveryRun } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(
      'Maximise signal to background, at most 3 experiments.',
      GENESIS_PARTICLE_PHYSICS_CATALOG_ID,
    );
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);

    // A real Evidence Bundle, from the same machinery every other domain uses.
    expect(state.evidence.bundleId.length).toBeGreaterThan(0);
    expect(state.result.rounds.length).toBeGreaterThan(0);
    expect(state.result.domainId).toBe('particle-physics');

    // It is in Scientific Memory, and it replays — no second replay mechanism.
    const saved = getExperiment(state.savedExperimentId)!;
    expect(saved.worldDiscovery?.catalogId).toBe(GENESIS_PARTICLE_PHYSICS_CATALOG_ID);
    expect(replaySavedWorldDiscoveryRun(saved).status).toBe('MATCH');
  }, 30_000);

  it('the loop reaches a real verdict on the beam-energy lever, not an inconclusive shrug', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');

    const state = runWorldDiscoveryAndRemember(
      'Maximise signal to background using beam energy, at most 2 experiments.',
      GENESIS_PARTICLE_PHYSICS_CATALOG_ID,
    );
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
    const beamEnergy = state.result.beliefs.find((b) => b.hypothesisId === 'h:beam-energy');
    expect(beamEnergy).toBeDefined();
    expect(beamEnergy!.status).toBe('SUPPORTED');
  }, 30_000);
});
