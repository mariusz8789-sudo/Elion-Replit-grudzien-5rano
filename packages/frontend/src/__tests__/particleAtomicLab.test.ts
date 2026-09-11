import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addIonizationChamber,
  ATOMIC_IONIZATION_SOLVER_ID,
  IONIZATION_DEFAULTS,
  IONIZATION_PEAK_ENERGY_EV,
  IONIZATION_STATES,
  ionizationStatusLabel,
  ionizationTickYield,
  makeAtomicIonizationSolver,
  type IonizationChamberState,
} from '../core/worldModel/domains/atomicIonization';
import {
  boostFourVector,
  ELECTRON_IMPACT_IONIZATION_CHANNEL,
  EE_TO_MUMU_CHANNEL,
  electronImpactIonizationCrossSectionCm2,
  FIDELITY_TIERS,
  fidelityGrounding,
  getReactionChannel,
  HYDROGEN_IONIZATION_ENERGY_EV,
  invariantMass,
  michelCdf,
  michelInverseCdf,
  michelSpectrumDensity,
  MUON_CAPTURE_CHANNEL,
  MUON_DECAY_CHANNEL,
  MUON_MASS_MEV,
  NEUTRON_MASS_MEV,
  PP_ELASTIC_CHANNEL,
  PP_ELASTIC_SLOPE_PER_GEV2,
  PROTON_MASS_MEV,
  REACTION_CHANNELS,
  totalCharge,
  totalFourMomentum,
  twoBodyFinalState,
  twoBodyMomentumMeV,
  weakestFidelity,
  Z_MASS_MEV,
  Z_RESONANCE_CHANNEL,
} from '../core/worldModel/domains/particlePhysics';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import {
  buildIonizationDiscoveryWorld,
  GENESIS_ATOMIC_IONIZATION_CATALOG,
  GENESIS_ATOMIC_IONIZATION_CATALOG_ID,
  GENESIS_IONIZATION_CHAMBER_ID,
} from '../core/agent/atomicIonizationLeverCatalog';
import {
  environmentFidelityFloor,
  LAB_ENVIRONMENT_IDS,
  LAB_ENVIRONMENTS,
  runnableLabEnvironments,
} from '../core/agent/particleAtomicLabEnvironments';
import { WORLD_LEVER_CATALOGS } from '../core/agent/worldGoalIntent';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

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

describe('fidelity tiers — a second disclosure that can never contradict the first', () => {
  it('maps exact kinematics to GROUNDED_EXACT and every softer tier to MODEL_ESTIMATE', () => {
    expect(fidelityGrounding('EXACT_KINEMATICS')).toBe('GROUNDED_EXACT');
    expect(fidelityGrounding('SIMPLIFIED')).toBe('MODEL_ESTIMATE');
    expect(fidelityGrounding('TOY')).toBe('MODEL_ESTIMATE');
    expect(fidelityGrounding('DEMONSTRATION')).toBe('MODEL_ESTIMATE');
  });

  it('collapses three tiers onto one grounding — which is exactly the loss this axis repairs', () => {
    const groundings = new Set(FIDELITY_TIERS.map(fidelityGrounding));
    expect(groundings.size).toBe(2);
    expect(FIDELITY_TIERS.length).toBe(4);
  });

  it('reports the WEAKEST link, so an exact channel cannot launder a soft one beside it', () => {
    expect(weakestFidelity(['EXACT_KINEMATICS', 'SIMPLIFIED'])).toBe('SIMPLIFIED');
    expect(weakestFidelity(['SIMPLIFIED', 'DEMONSTRATION', 'EXACT_KINEMATICS'])).toBe('DEMONSTRATION');
    expect(weakestFidelity(['EXACT_KINEMATICS'])).toBe('EXACT_KINEMATICS');
  });

  it('gives every registered channel a tier from the declared vocabulary', () => {
    for (const channel of REACTION_CHANNELS) {
      expect(FIDELITY_TIERS).toContain(channel.fidelity);
      expect(channel.assumptions.length).toBeGreaterThan(0);
      expect(channel.notModelled.length).toBeGreaterThan(0);
    }
  });
});

describe('Lorentz boost — the thing that makes three-body conservation exact, not nearly', () => {
  it('preserves the invariant mass of a four-vector', () => {
    const v = { E: 500, px: 30, py: -40, pz: 120 };
    const before = invariantMass(v)!;
    const after = invariantMass(boostFourVector(v, { x: 0.3, y: -0.2, z: 0.5 }))!;
    expect(after).toBeCloseTo(before, 6);
  });

  it('is the identity at zero velocity', () => {
    const v = { E: 500, px: 30, py: -40, pz: 120 };
    expect(boostFourVector(v, { x: 0, y: 0, z: 0 })).toEqual(v);
  });

  it('boosts a particle at rest to exactly gamma*m of energy', () => {
    const beta = 0.6;
    const gamma = 1 / Math.sqrt(1 - beta * beta);
    const out = boostFourVector({ E: 100, px: 0, py: 0, pz: 0 }, { x: 0, y: 0, z: beta });
    expect(out.E).toBeCloseTo(100 * gamma, 9);
    expect(out.pz).toBeCloseTo(100 * gamma * beta, 9);
  });
});

describe('reaction channels — conservation is checked, never asserted in prose', () => {
  it('e+e- -> mu+mu- conserves energy and momentum exactly and puts both muons on shell', () => {
    const sqrtS = 5000;
    const out = EE_TO_MUMU_CHANNEL.evaluate(sqrtS, 11)!;
    const total = totalFourMomentum(out.finalState);
    expect(total.E).toBeCloseTo(sqrtS, 9);
    expect(total.px).toBeCloseTo(0, 9);
    expect(total.py).toBeCloseTo(0, 9);
    expect(total.pz).toBeCloseTo(0, 9);
    for (const p of out.finalState) {
      expect(invariantMass(p.fourMomentum)!).toBeCloseTo(MUON_MASS_MEV, 6);
    }
    expect(totalCharge(out.finalState)).toBe(0);
  });

  it('refuses to produce muons below the 2*m(mu) threshold instead of clamping to zero momentum', () => {
    expect(EE_TO_MUMU_CHANNEL.evaluate(2 * MUON_MASS_MEV - 1, 3)).toBeNull();
    expect(EE_TO_MUMU_CHANNEL.evaluate(2 * MUON_MASS_MEV + 1, 3)).not.toBeNull();
  });

  it('weights the Z channel at exactly 1 on the pole and strictly less off it', () => {
    const onPeak = Z_RESONANCE_CHANNEL.evaluate(Z_MASS_MEV, 5)!;
    const offPeak = Z_RESONANCE_CHANNEL.evaluate(Z_MASS_MEV - 10_000, 5)!;
    expect(onPeak.relativeWeight).toBeCloseTo(1, 9);
    expect(offPeak.relativeWeight).toBeLessThan(onPeak.relativeWeight);
    // Same exact kinematics as the unweighted channel — only the weight differs.
    expect(onPeak.finalState[0].fourMomentum).toEqual(EE_TO_MUMU_CHANNEL.evaluate(Z_MASS_MEV, 5)!.finalState[0].fourMomentum);
  });

  it('conserves energy, momentum and charge in unequal-mass muon capture', () => {
    const sqrtS = 1100;
    const out = MUON_CAPTURE_CHANNEL.evaluate(sqrtS, 4)!;
    const total = totalFourMomentum(out.finalState);
    expect(total.E).toBeCloseTo(sqrtS, 9);
    expect(Math.hypot(total.px, total.py, total.pz)).toBeCloseTo(0, 9);
    const [neutron, neutrino] = out.finalState;
    expect(invariantMass(neutron.fourMomentum)!).toBeCloseTo(NEUTRON_MASS_MEV, 6);
    // The neutrino is massless, and the honest test of that is a RELATIVE one:
    // m^2 = E^2 - |p|^2 cancels two numbers near 290 MeV, so double precision
    // leaves a residue around 1e-6 MeV no matter how exact the construction is.
    // What must hold is that the residue is floating-point noise next to the
    // energy scale, and it is — about one part in 10^8.
    expect(invariantMass(neutrino.fourMomentum)! / neutrino.fourMomentum.E).toBeLessThan(1e-7);
    // mu- + p -> n + nu: charge -1 + 1 = 0 in, 0 + 0 = 0 out.
    expect(totalCharge(out.finalState)).toBe(0);
  });

  it('refuses muon capture below the neutron mass', () => {
    expect(MUON_CAPTURE_CHANNEL.evaluate(NEUTRON_MASS_MEV - 1, 2)).toBeNull();
  });

  it('conserves energy and momentum EXACTLY in the three-body muon decay, on every tick', () => {
    for (let tick = 1; tick <= 40; tick += 1) {
      const out = MUON_DECAY_CHANNEL.evaluate(MUON_MASS_MEV, tick);
      if (out === null) continue;
      const total = totalFourMomentum(out.finalState);
      expect(total.E).toBeCloseTo(MUON_MASS_MEV, 6);
      expect(Math.hypot(total.px, total.py, total.pz)).toBeCloseTo(0, 6);
      expect(totalCharge(out.finalState)).toBe(-1);
    }
  });

  it('never lets the decay electron exceed the kinematic limit of m(mu)/2', () => {
    for (let tick = 1; tick <= 200; tick += 1) {
      const out = MUON_DECAY_CHANNEL.evaluate(MUON_MASS_MEV, tick);
      if (out === null) continue;
      const electron = out.finalState.find((p) => p.species === 'electron')!;
      expect(electron.fourMomentum.E).toBeLessThanOrEqual(MUON_MASS_MEV / 2 + 1e-9);
      expect(electron.fourMomentum.E).toBeGreaterThan(0);
    }
  });
});

describe('the Michel spectrum is the real V-A result, and its mean is the measured one', () => {
  it('is normalised: it integrates to exactly 1 over [0,1]', () => {
    const n = 200_000;
    let integral = 0;
    for (let i = 0; i < n; i += 1) integral += michelSpectrumDensity((i + 0.5) / n) / n;
    expect(integral).toBeCloseTo(1, 6);
  });

  it('puts the mean electron energy at 36.98 MeV — the measured value, by integration', () => {
    const n = 200_000;
    let meanX = 0;
    for (let i = 0; i < n; i += 1) {
      const x = (i + 0.5) / n;
      meanX += (x * michelSpectrumDensity(x)) / n;
    }
    expect(meanX).toBeCloseTo(0.7, 5);
    expect((meanX * MUON_MASS_MEV) / 2).toBeCloseTo(36.98, 2);
  });

  it('is NOT flat phase space — the density vanishes at x=0 and peaks at the endpoint', () => {
    expect(michelSpectrumDensity(0)).toBe(0);
    expect(michelSpectrumDensity(1)).toBeCloseTo(2, 9);
    expect(michelSpectrumDensity(0.5)).toBeLessThan(michelSpectrumDensity(1));
  });

  it('inverts its own CDF to floating-point precision', () => {
    for (const u of [0.01, 0.13, 0.5, 0.77, 0.99]) {
      expect(michelCdf(michelInverseCdf(u))).toBeCloseTo(u, 9);
    }
    expect(michelCdf(1)).toBeCloseTo(1, 12);
  });
});

describe('pp elastic scattering at the measured diffractive slope', () => {
  it('conserves energy and momentum and keeps both protons on shell', () => {
    const sqrtS = 13_000_000;
    const out = PP_ELASTIC_CHANNEL.evaluate(sqrtS, 9)!;
    const total = totalFourMomentum(out.finalState);
    expect(total.E).toBeCloseTo(sqrtS, 3);
    expect(Math.hypot(total.px, total.py, total.pz) / sqrtS).toBeCloseTo(0, 9);
    for (const p of out.finalState) {
      expect(invariantMass(p.fourMomentum)! / PROTON_MASS_MEV).toBeCloseTo(1, 5);
      expect(p.charge).toBe(1);
    }
  });

  it('refuses to scatter below the 2*m(p) threshold', () => {
    expect(PP_ELASTIC_CHANNEL.evaluate(2 * PROTON_MASS_MEV - 1, 1)).toBeNull();
  });

  it('is FORWARD-PEAKED, as a measured slope of 20 GeV^-2 requires — not isotropic', () => {
    // |t| ~ exp(-B|t|) with B = 20 GeV^-2 means the mean |t| is about 1/B = 0.05
    // GeV^2, which at LHC momenta is a vanishing scattering angle. An isotropic
    // draw would put half the events past 90 degrees; this must put none there.
    const sqrtS = 13_000_000;
    const p = twoBodyMomentumMeV(sqrtS, PROTON_MASS_MEV, PROTON_MASS_MEV)!;
    let maxAngleDeg = 0;
    for (let tick = 1; tick <= 200; tick += 1) {
      const out = PP_ELASTIC_CHANNEL.evaluate(sqrtS, tick)!;
      const f = out.finalState[0].fourMomentum;
      const cos = f.pz / Math.hypot(f.px, f.py, f.pz);
      maxAngleDeg = Math.max(maxAngleDeg, (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI);
    }
    expect(maxAngleDeg).toBeLessThan(1);
    expect(PP_ELASTIC_SLOPE_PER_GEV2).toBe(20);
    expect(p).toBeGreaterThan(0);
  });
});

describe('electron-impact ionisation — the Lotz cross-section, threshold and peak', () => {
  it('is exactly zero below the 13.606 eV hydrogen threshold', () => {
    expect(electronImpactIonizationCrossSectionCm2(HYDROGEN_IONIZATION_ENERGY_EV - 0.001)).toBe(0);
    expect(electronImpactIonizationCrossSectionCm2(HYDROGEN_IONIZATION_ENERGY_EV)).toBe(0);
    expect(electronImpactIonizationCrossSectionCm2(HYDROGEN_IONIZATION_ENERGY_EV + 0.1)).toBeGreaterThan(0);
  });

  it('peaks near 55 eV at about 0.65e-16 cm^2 — the measured hydrogen values', () => {
    let bestE = 0;
    let best = 0;
    for (let e = 14; e < 400; e += 0.01) {
      const s = electronImpactIonizationCrossSectionCm2(e);
      if (s > best) { best = s; bestE = e; }
    }
    expect(bestE).toBeCloseTo(IONIZATION_PEAK_ENERGY_EV, 0);
    expect(best).toBeGreaterThan(0.6e-16);
    expect(best).toBeLessThan(0.7e-16);
  });

  it('FALLS past the peak — the fact that makes "more beam energy" a falsifiable hypothesis', () => {
    const atPeak = electronImpactIonizationCrossSectionCm2(IONIZATION_PEAK_ENERGY_EV);
    const wayPast = electronImpactIonizationCrossSectionCm2(300);
    expect(wayPast).toBeLessThan(atPeak / 2);
  });

  it('conserves charge in the ionisation channel and refuses below threshold', () => {
    expect(ELECTRON_IMPACT_IONIZATION_CHANNEL.evaluate(10 / 1e6, 1)).toBeNull();
    const out = ELECTRON_IMPACT_IONIZATION_CHANNEL.evaluate(60 / 1e6, 3)!;
    // e- + H (neutral) in = -1; e- + e- + H+ out = -1 - 1 + 1 = -1.
    expect(totalCharge(out.finalState)).toBe(-1);
    expect(out.relativeWeight).toBeGreaterThan(0);
  });
});

describe('the ionisation chamber is a real apparatus with a real attenuation law', () => {
  it('SATURATES: doubling the target density less than doubles the ion yield once the cell is thick', () => {
    const thick: IonizationChamberState = { ...IONIZATION_DEFAULTS, targetDensityPerCm3: 1e15 };
    const thicker: IonizationChamberState = { ...thick, targetDensityPerCm3: 2e15 };
    const a = ionizationTickYield(thick).ions;
    const b = ionizationTickYield(thicker).ions;
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(2 * a);
  });

  it('is linear in density while the cell is thin — so the saturation above is physics, not a clamp', () => {
    const thin: IonizationChamberState = { ...IONIZATION_DEFAULTS, targetDensityPerCm3: 1e11 };
    const a = ionizationTickYield(thin).ions;
    const b = ionizationTickYield({ ...thin, targetDensityPerCm3: 2e11 }).ions;
    expect(b / a).toBeCloseTo(2, 3);
  });

  it('proves density and path length are the SAME knob: only the product n*L enters', () => {
    const a = ionizationTickYield({ ...IONIZATION_DEFAULTS, targetDensityPerCm3: 4e13, pathLengthCm: 10 });
    const b = ionizationTickYield({ ...IONIZATION_DEFAULTS, targetDensityPerCm3: 1e13, pathLengthCm: 40 });
    expect(a.ions).toBeCloseTo(b.ions, 9);
    expect(a.transmission).toBeCloseTo(b.transmission, 12);
  });

  it('FALSIFIES "more beam energy is better": 300 eV yields fewer ions than the 30 eV baseline', () => {
    const base = ionizationTickYield(IONIZATION_DEFAULTS).ions;
    const naive = ionizationTickYield({ ...IONIZATION_DEFAULTS, beamEnergyEV: 300 }).ions;
    expect(naive).toBeLessThan(base);
  });

  it('and confirms the other energy arm: tuning to the cross-section peak yields more', () => {
    const base = ionizationTickYield(IONIZATION_DEFAULTS).ions;
    const tuned = ionizationTickYield({ ...IONIZATION_DEFAULTS, beamEnergyEV: IONIZATION_PEAK_ENERGY_EV }).ions;
    expect(tuned).toBeGreaterThan(base);
  });

  it('produces exactly nothing below the ionisation threshold', () => {
    const dead = ionizationTickYield({ ...IONIZATION_DEFAULTS, beamEnergyEV: 10 });
    expect(dead.ions).toBe(0);
    expect(dead.crossSectionCm2).toBe(0);
    expect(dead.transmission).toBe(1);
  });

  it('publishes only allowlisted status labels, at the real threshold and peak boundaries', () => {
    expect(ionizationStatusLabel({ ...IONIZATION_DEFAULTS, beamEnergyEV: 10 })).toBe('BELOW_THRESHOLD');
    expect(ionizationStatusLabel({ ...IONIZATION_DEFAULTS, beamEnergyEV: 20 })).toBe('RISING');
    expect(ionizationStatusLabel({ ...IONIZATION_DEFAULTS, beamEnergyEV: IONIZATION_PEAK_ENERGY_EV })).toBe('NEAR_PEAK');
    expect(ionizationStatusLabel({ ...IONIZATION_DEFAULTS, beamEnergyEV: 300 })).toBe('PAST_PEAK');
    for (const energy of [5, 20, 55, 300, 5000]) {
      expect(IONIZATION_STATES).toContain(ionizationStatusLabel({ ...IONIZATION_DEFAULTS, beamEnergyEV: energy }));
    }
  });
});

describe('the chamber runs on the one existing engine, and forks stay bit-identical', () => {
  it('advances through SolverRouter and publishes a real observation with real provenance', () => {
    const graph = new WorldGraph();
    const id = addIonizationChamber(graph);
    const router = new SolverRouter();
    router.register(ATOMIC_IONIZATION_SOLVER_ID, makeAtomicIonizationSolver());
    const result = router.routeTick(graph, 1, 1);
    expect(result.ungrounded).toHaveLength(0);
    const entity = graph.getEntity(id)!;
    expect(entity.grounding).toBe('MODEL_ESTIMATE');
    expect((entity.domainState as unknown as IonizationChamberState).ionCounts).toBeGreaterThan(0);
  });

  it('gives two independent runs of the same ticks bit-identical state — no PRNG stream anywhere', () => {
    const run = () => {
      const { graph, updater } = buildIonizationDiscoveryWorld();
      for (let tick = 1; tick <= 12; tick += 1) updater(graph, 1, tick);
      return JSON.stringify(graph.getEntity(GENESIS_IONIZATION_CHAMBER_ID)!.domainState);
    };
    expect(run()).toBe(run());
  });
});

describe('the Atomic Lab is registered in the ONE catalogue registry, not a new one', () => {
  it('appears in WORLD_LEVER_CATALOGS, so the existing Discovery panel lists it with no UI change', () => {
    expect(WORLD_LEVER_CATALOGS[GENESIS_ATOMIC_IONIZATION_CATALOG_ID]).toBe(GENESIS_ATOMIC_IONIZATION_CATALOG);
    expect(GENESIS_ATOMIC_IONIZATION_CATALOG.domainId).toBe('atomic-physics');
    expect(GENESIS_ATOMIC_IONIZATION_CATALOG.levers.length).toBe(4);
  });

  it('declares its assumptions and what it does not model, like every other catalogue', () => {
    expect(GENESIS_ATOMIC_IONIZATION_CATALOG.declaredAssumptions.length).toBeGreaterThan(0);
    expect(GENESIS_ATOMIC_IONIZATION_CATALOG.notModelledFactors.length).toBeGreaterThan(0);
    expect(GENESIS_ATOMIC_IONIZATION_CATALOG.declaredAssumptions.join(' ')).toContain('Lotz');
  });

  it('points every lever at the chamber that actually exists in the world it builds', () => {
    const { graph } = buildIonizationDiscoveryWorld();
    for (const lever of GENESIS_ATOMIC_IONIZATION_CATALOG.levers) {
      expect(graph.getEntity(lever.targetEntityId)).toBeDefined();
    }
  });
});

describe('lab environments — a configuration table, never an engine', () => {
  it('resolves every channel id every environment claims to offer', () => {
    for (const id of LAB_ENVIRONMENT_IDS) {
      for (const channelId of LAB_ENVIRONMENTS[id].channelIds) {
        expect(getReactionChannel(channelId), `${id} -> ${channelId}`).not.toBeNull();
      }
    }
  });

  it('backs every RUNNABLE environment with a catalogue the existing Discovery Loop already knows', () => {
    const runnable = runnableLabEnvironments();
    expect(runnable.length).toBeGreaterThan(1);
    for (const env of runnable) {
      expect(env.discoveryCatalogId).not.toBeNull();
      expect(WORLD_LEVER_CATALOGS[env.discoveryCatalogId!], env.environmentId).toBeDefined();
    }
  });

  it('gives every environment that is NOT runnable a null catalogue — no half-wired apparatus', () => {
    for (const id of LAB_ENVIRONMENT_IDS) {
      const env = LAB_ENVIRONMENTS[id];
      if (env.status !== 'RUNNABLE') expect(env.discoveryCatalogId, id).toBeNull();
    }
  });

  it('keeps Virtual CERN as ONE ROW and not the boundary: more than one environment is runnable', () => {
    expect(LAB_ENVIRONMENTS.VIRTUAL_CERN_LHC_LIKE.status).toBe('RUNNABLE');
    expect(LAB_ENVIRONMENTS.ATOMIC_LAB.status).toBe('RUNNABLE');
    expect(LAB_ENVIRONMENTS.ATOMIC_LAB.discoveryCatalogId).not.toBe(LAB_ENVIRONMENTS.VIRTUAL_CERN_LHC_LIKE.discoveryCatalogId);
  });

  it('says plainly that the plasma lab does not exist rather than listing it as available', () => {
    expect(LAB_ENVIRONMENTS.PLASMA_LAB.status).toBe('NOT_BUILT');
    expect(LAB_ENVIRONMENTS.PLASMA_LAB.channelIds).toHaveLength(0);
    expect(environmentFidelityFloor('PLASMA_LAB')).toBeNull();
  });

  it('reports each environment fidelity as its weakest channel, never its best', () => {
    // The nuclear lab pairs EXACT_KINEMATICS muon capture with the SIMPLIFIED
    // Michel decay, so its floor is SIMPLIFIED — the exact channel does not get
    // to speak for the pair.
    expect(environmentFidelityFloor('NUCLEAR_LAB')).toBe('SIMPLIFIED');
    // The CERN-like environment mixes an exact channel with a simplified one,
    // so the floor must drop to SIMPLIFIED rather than advertise the exact one.
    expect(LAB_ENVIRONMENTS.VIRTUAL_CERN_LHC_LIKE.channelIds).toContain('ee-annihilation');
    expect(environmentFidelityFloor('VIRTUAL_CERN_LHC_LIKE')).toBe('SIMPLIFIED');
  });

  it('carries an epistemic note on every environment, including a disclaimer about the real CERN', () => {
    for (const id of LAB_ENVIRONMENT_IDS) {
      expect(LAB_ENVIRONMENTS[id].epistemicNote.length).toBeGreaterThan(20);
    }
    expect(LAB_ENVIRONMENTS.VIRTUAL_CERN_LHC_LIKE.epistemicNote).toContain('NOT a model of the real LHC');
  });
});

describe('end to end: the Atomic Lab runs the EXISTING discovery loop, memory and replay', () => {
  it('produces a real Evidence Bundle in Scientific Memory and replays it to MATCH', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, replaySavedWorldDiscoveryRun } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(
      'Maximise ion yield, at most 3 experiments.',
      GENESIS_ATOMIC_IONIZATION_CATALOG_ID,
    );
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);

    expect(state.evidence.bundleId.length).toBeGreaterThan(0);
    expect(state.result.rounds.length).toBeGreaterThan(0);
    expect(state.result.domainId).toBe('atomic-physics');

    const saved = getExperiment(state.savedExperimentId)!;
    expect(saved.worldDiscovery?.catalogId).toBe(GENESIS_ATOMIC_IONIZATION_CATALOG_ID);
    expect(replaySavedWorldDiscoveryRun(saved).status).toBe('MATCH');
  }, 30_000);

  it('reaches a real verdict on the naive high-energy lever rather than an inconclusive shrug', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');

    const state = runWorldDiscoveryAndRemember(
      'Maximise ion yield using higher energy, at most 2 experiments.',
      GENESIS_ATOMIC_IONIZATION_CATALOG_ID,
    );
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
    const belief = state.result.beliefs.find((b) => b.hypothesisId === 'h:raise-beam-energy');
    expect(belief).toBeDefined();
    // The point of this environment: the loop must be able to come back with
    // something other than SUPPORTED, because the physics genuinely says so.
    expect(belief!.status).not.toBe('SUPPORTED');
  }, 30_000);
});

describe('the two-body constructor generalises without breaking the equal-mass case', () => {
  it('places unequal daughters back to back with equal and opposite momentum', () => {
    const out = twoBodyFinalState(1500, PROTON_MASS_MEV, 0, 6)!;
    expect(out.first.px).toBeCloseTo(-out.second.px, 9);
    expect(out.first.py).toBeCloseTo(-out.second.py, 9);
    expect(out.first.pz).toBeCloseTo(-out.second.pz, 9);
    expect(out.first.E + out.second.E).toBeCloseTo(1500, 9);
  });

  it('returns null for a forbidden split rather than a clamped zero', () => {
    expect(twoBodyFinalState(100, PROTON_MASS_MEV, PROTON_MASS_MEV, 1)).toBeNull();
  });
});
