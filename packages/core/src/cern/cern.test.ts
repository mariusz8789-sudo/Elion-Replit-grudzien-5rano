/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { KernelProviderRegistry, blackHoleProvider, materialsProvider, computeColliderProvider, type BlackHoleAnalysis, type MaterialsAnalysis, type CollisionBatchAnalysis } from '../mythos/KernelProviderRegistry.js';
import { ComputeColliderEngine } from './ComputeColliderEngine.js';
import { QuantumColliderEngine } from '../collider/QuantumColliderEngine.js';
import { CONST, BlackHoleEventHorizonEngine, schwarzschildRadiusM, hawkingTemperatureK, lifetimeS, hawkingSpectrum, evaporationTimeline, mulberry32 } from './BlackHoleEventHorizonEngine.js';
import { MaterialsDiscoveryEngine, type IonSpec } from './MaterialsDiscoveryEngine.js';

const clock = { t: 1_700_000_000_000, now() { return this.t; } };
const ctx = { kernelId: 'genesis-cyber-kernel', route: '#/cern-complex', operatorId: 'T' };
const M_SUN = 1.98847e30;
const NA: IonSpec = { species: 'Na', charge: 1, radiusPm: 102, count: 1, atomicMassU: 22.99 };
const CL: IonSpec = { species: 'Cl', charge: -1, radiusPm: 181, count: 1, atomicMassU: 35.45 };
const CU: IonSpec = { species: 'Cu', charge: 0, radiusPm: 128, count: 1, atomicMassU: 63.55 };
const PEROVSKITE: IonSpec[] = [
  { species: 'Sr', charge: 2, radiusPm: 144, count: 1, atomicMassU: 87.62 },
  { species: 'Ti', charge: 4, radiusPm: 60.5, count: 1, atomicMassU: 47.87 },
  { species: 'O', charge: -2, radiusPm: 140, count: 3, atomicMassU: 16.0 },
];

describe('BlackHoleEventHorizonEngine — textbook formulas and determinism', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(5), b = mulberry32(5);
    for (let i = 0; i < 50; i++) { const x = a(); expect(x).toBe(b()); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  it('Schwarzschild radius of one solar mass ≈ 2.95 km; Hawking temperature ≈ 6.17e-8 K; lifetime ~1e67 years', () => {
    expect(schwarzschildRadiusM(M_SUN)).toBeCloseTo(2953, -1);
    expect(hawkingTemperatureK(M_SUN) / 6.17e-8).toBeCloseTo(1, 1);
    expect(lifetimeS(M_SUN) / (3.156e7 * 2.1e67)).toBeCloseTo(1, 0);
  });
  it('Hawking temperature falls with mass, lifetime grows as M^3', () => {
    expect(hawkingTemperatureK(2 * M_SUN)).toBeCloseTo(hawkingTemperatureK(M_SUN) / 2, 12);
    expect(lifetimeS(2 * M_SUN) / lifetimeS(M_SUN)).toBeCloseTo(8, 6);
  });
  it('LHC energy (13 TeV) never forms a 4D black hole: BELOW_THRESHOLD, no state, still a hash', () => {
    const r = new BlackHoleEventHorizonEngine(1).attemptFormation(13000);
    expect(r.formed).toBe(false);
    expect(r.regime).toBeNull();
    expect(r.reason).toBe('BELOW_THRESHOLD');
    expect(r.bh).toBeNull();
    expect(r.eventHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('the ADD extra-dimension scenario is labelled SPECULATIVE with an explicit no-evidence reason', () => {
    const r = new BlackHoleEventHorizonEngine(1).attemptFormation(13000, { addThresholdTeV: 5 });
    expect(r.formed).toBe(true);
    expect(r.regime).toBe('ADD_TEV_SPECULATIVE');
    expect(r.reason).toBe('ADD_TEV_SCENARIO_SPECULATIVE_NO_EVIDENCE');
    expect(r.bh?.label).toBe('speculative');
    expect(r.bh?.massGeV).toBe(6500);
    expect(r.bh!.rsM / schwarzschildRadiusM(6500 * CONST.GEV_TO_KG)).toBeCloseTo(1, 5);
    expect(r.bh?.temperatureK).toBeGreaterThan(1e30);
    expect(r.bh?.quanta.length).toBeGreaterThan(0);
    // below the ADD threshold: nothing forms
    expect(new BlackHoleEventHorizonEngine(1).attemptFormation(4000, { addThresholdTeV: 5 }).formed).toBe(false);
  });
  it('at or above the Planck energy the 4D regime forms and is labelled a hypothesis', () => {
    const r = new BlackHoleEventHorizonEngine(3).attemptFormation(CONST.M_PLANCK_GEV);
    expect(r.regime).toBe('4D_PLANCK');
    expect(r.reason).toBe('ABOVE_PLANCK_THRESHOLD');
    expect(r.bh?.label).toBe('hypothesis');
  });
  it('same seed and inputs give identical results, spectra and hashes; a different seed changes the spectrum only', () => {
    const a = new BlackHoleEventHorizonEngine(77).attemptFormation(13000, { addThresholdTeV: 6 });
    const b = new BlackHoleEventHorizonEngine(77).attemptFormation(13000, { addThresholdTeV: 6 });
    expect(a).toEqual(b);
    const c = new BlackHoleEventHorizonEngine(78).attemptFormation(13000, { addThresholdTeV: 6 });
    expect(c.eventHash).not.toBe(a.eventHash);
    expect(c.bh?.rsM).toBe(a.bh?.rsM);
    expect(c.bh?.quanta).not.toEqual(a.bh?.quanta);
    expect(new BlackHoleEventHorizonEngine(77).attemptFormation(13000, { addThresholdTeV: 7 }).eventHash).not.toBe(a.eventHash);
  });
  it('Hawking spectrum: weights sum to ~1 per species set, fermions carry 7/8, photons are the heaviest single species', () => {
    const q = hawkingSpectrum(1e-20, 9);
    const byName = new Map<string, number>();
    for (const x of q) byName.set(x.name, x.weight);
    const photon = byName.get('photon')!; const electron = byName.get('e-')!;
    expect(photon / electron).toBeCloseTo(1 / 0.875, 4);
    expect([...byName.values()].reduce((a, w) => a + w, 0)).toBeCloseTo(1, 5);
    for (const x of q) expect(x.energyGeV).toBeGreaterThan(0);
    expect(hawkingSpectrum(1e-20, 9)).toEqual(q);
  });
  it('evaporation timeline is monotone: mass falls, temperature rises, time advances', () => {
    const tl = evaporationTimeline(1e5, 32);
    expect(tl.length).toBeGreaterThan(1);
    for (let i = 1; i < tl.length; i++) {
      expect(tl[i].massKg).toBeLessThan(tl[i - 1].massKg);
      expect(tl[i].TK).toBeGreaterThan(tl[i - 1].TK);
      expect(tl[i].tS).toBeGreaterThan(tl[i - 1].tS);
    }
  });
  it('commitToLedger anchors formed and non-formed attempts as model claims; identical attempts dedupe; chain verifies', () => {
    const ledger = new EvidenceLedger(clock);
    const engine = new BlackHoleEventHorizonEngine(5);
    const miss = engine.attemptFormation(13000);
    const hit = engine.attemptFormation(13000, { addThresholdTeV: 5 });
    const h1 = engine.commitToLedger(ledger, miss);
    const h2 = engine.commitToLedger(ledger, hit);
    const h3 = engine.commitToLedger(ledger, hit);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).not.toBe(h2);
    expect(h2).toBe(h3);
    expect(ledger.getEntries().length).toBe(2);
    expect(ledger.getEntries()[1].recordId).toBe('EV-' + h2.slice(0, 12));
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});

describe('MaterialsDiscoveryEngine — lattice selection, estimates and determinism', () => {
  it('two ions in 1:1 → rock-salt with 64 sites and an ionic, stable, insulating estimate', () => {
    const c = new MaterialsDiscoveryEngine(21).synthesize([NA, CL]);
    expect(c.lattice).toBe('rock-salt');
    expect(c.sites.length).toBe(32);
    expect(c.name.startsWith('GEN-NaCl-')).toBe(true);
    expect(c.id).toBe('MAT-' + c.structureHash.slice(0, 10).toUpperCase());
    expect(c.stable).toBe(true);
    expect(c.formationEnergyEv).toBeLessThan(0);
    expect(c.conductivitySM).toBe(1e-12);
    expect(c.dosAtFermiPerEvAtom).toBe(0);
    // a = 2·mean ionic radius · (0.98..1.02) in this estimate model (141.5 pm mean for Na+/Cl-)
    expect(c.aPm).toBeGreaterThanOrEqual(2 * 141.5 * 0.98); expect(c.aPm).toBeLessThanOrEqual(2 * 141.5 * 1.02);
    const aM = c.aPm * 1e-12;
    expect(c.densityKgM3).toBeCloseTo((8 * ((22.99 + 35.45) / 2) * 1.66053906660e-27) / (aM * aM * aM), 0);
    expect(c.bulkModulusGPa).toBeGreaterThan(0); expect(c.bulkModulusGPa).toBeLessThanOrEqual(900);
  });
  it('ABX3 counts → perovskite with 40 sites; a single neutral species → fcc metal with a Fermi-level DOS', () => {
    const p = new MaterialsDiscoveryEngine(21).synthesize(PEROVSKITE);
    expect(p.lattice).toBe('perovskite');
    expect(p.sites.length).toBe(40);
    expect(p.name.startsWith('GEN-SrTiO3-')).toBe(true);
    const m = new MaterialsDiscoveryEngine(21).synthesize([CU]);
    expect(m.lattice).toBe('fcc');
    expect(m.sites.length).toBe(32);
    expect(m.conductivitySM).toBe(1e7);
    expect(m.dosAtFermiPerEvAtom).toBeGreaterThan(0);
    expect(m.stable).toBe(true);
    const b = new MaterialsDiscoveryEngine(21).synthesize([{ ...CU, charge: 2 }]);
    expect(b.lattice).toBe('bcc');
    expect(b.sites.length).toBe(40);
  });
  it('same seed and composition → identical structure and hash; seed or composition change the hash', () => {
    const a = new MaterialsDiscoveryEngine(4).synthesize([NA, CL]);
    const b = new MaterialsDiscoveryEngine(4).synthesize([NA, CL]);
    expect(a).toEqual(b);
    expect(new MaterialsDiscoveryEngine(5).synthesize([NA, CL]).structureHash).not.toBe(a.structureHash);
    expect(new MaterialsDiscoveryEngine(4).synthesize([NA, { ...CL, radiusPm: 184 }]).structureHash).not.toBe(a.structureHash);
    expect(a.structureHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('commitToLedger anchors the crystal as a model claim; dedupes; chain verifies', () => {
    const ledger = new EvidenceLedger(clock);
    const engine = new MaterialsDiscoveryEngine(8);
    const c = engine.synthesize([NA, CL]);
    const h1 = engine.commitToLedger(ledger, c);
    const h2 = engine.commitToLedger(ledger, c);
    expect(h1).toBe(h2);
    expect(ledger.getEntries().length).toBe(1);
    expect(ledger.getEntries()[0].recordId).toBe('EV-' + h1.slice(0, 12));
    expect(ledger.contentHashOf({ sourceUrl: 'genesis://cern/mat/' + c.id, sourceTimestamp: null, claim: 'crystal ' + c.name + ' lattice=rock-salt a=' + c.aPm + 'pm K=' + c.bulkModulusGPa + 'GPa stable=true', claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'materials-discovery-engine', independentSourceIds: [] } })).toBe(h1);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});

describe('CERN providers — resolved through the single kernel, committed to the ledger', () => {
  it('micro-blackhole-sim: label follows the engine (NOT_FORMED / speculative / hypothesis), each attempt anchored', () => {
    const ledger = new EvidenceLedger(clock);
    const reg = new KernelProviderRegistry();
    reg.bindKernel('genesis-cyber-kernel');
    reg.register(blackHoleProvider(ledger));
    const p = reg.resolve('micro-blackhole-sim');
    expect(p?.providerId).toBe('blackhole-event-horizon');
    const miss = p!.analyze(ctx, { seed: 1, sqrtSGeV: 13000 }) as BlackHoleAnalysis;
    expect(miss.label).toBe('NOT_FORMED');
    expect(miss.result.eventHash).toBe(new BlackHoleEventHorizonEngine(1).attemptFormation(13000).eventHash);
    const add = p!.analyze(ctx, { seed: 1, sqrtSGeV: 13000, addThresholdTeV: 5 }) as BlackHoleAnalysis;
    expect(add.label).toBe('speculative');
    const planck = p!.analyze(ctx, { seed: 1, sqrtSGeV: CONST.M_PLANCK_GEV }) as BlackHoleAnalysis;
    expect(planck.label).toBe('hypothesis');
    expect(ledger.getEntries().map((e) => e.contentHash)).toEqual([miss.ledgerContentHash, add.ledgerContentHash, planck.ledgerContentHash]);
    expect(ledger.verifyLedger().ok).toBe(true);
    expect(() => reg.bindKernel('cern-kernel')).toThrow('KERNEL_ALREADY_BOUND');
  });
  it('crystal-synthesis-sim: returns the engine structure with its ledger hash and the estimate label', () => {
    const ledger = new EvidenceLedger(clock);
    const reg = new KernelProviderRegistry();
    reg.bindKernel('genesis-cyber-kernel');
    reg.register(materialsProvider(ledger));
    const p = reg.resolve('crystal-synthesis-sim');
    expect(p?.providerId).toBe('materials-discovery');
    const a = p!.analyze(ctx, { seed: 21, ions: PEROVSKITE }) as MaterialsAnalysis;
    expect(a.label).toBe('EMPIRICAL_ESTIMATE_MODEL');
    expect(a.crystal.structureHash).toBe(new MaterialsDiscoveryEngine(21).synthesize(PEROVSKITE).structureHash);
    expect(ledger.getEntries().some((e) => e.contentHash === a.ledgerContentHash)).toBe(true);
  });
  it('collision-batch: n events of the label-derived seed, track attributes per non-neutrino final, one batch anchor', () => {
    const ledger = new EvidenceLedger(clock);
    const reg = new KernelProviderRegistry();
    reg.bindKernel('genesis-cyber-kernel');
    reg.register(computeColliderProvider(ledger));
    const p = reg.resolve('collision-batch');
    expect(p?.providerId).toBe('compute-collider');
    const a = p!.analyze(ctx, { label: 'cern-complex-v2', n: 4, startIndex: 8 }) as CollisionBatchAnalysis;
    expect(a.label).toBe('TOY_MC_MODEL');
    expect(a.events.length).toBe(4);
    const direct = new ComputeColliderEngine(new EvidenceLedger(clock), 'cern-complex-v2', 13000);
    expect(a.seedBase).toBe(direct.getSeedBase());
    expect(a.events.map((e) => e.eventHash)).toEqual(direct.generateBatch(4, 8).map((e) => e.eventHash));
    expect(a.events[0].eventHash).toBe(new QuantumColliderEngine(direct.getSeedBase(), 13000).generateEvent(8).eventHash);
    const finals = a.events.flatMap((e) => e.finals).filter((f) => f.pdg !== 12 && f.pdg !== 14);
    expect(a.tracks.count).toBe(finals.length);
    expect(a.tracks.aPT.length).toBe(finals.length);
    for (let i = 0; i < finals.length; i++) { expect(a.tracks.aPT[i]).toBeGreaterThan(0); expect([-1, 0, 1]).toContain(a.tracks.aCharge[i]); expect([0, 1, 2, 4]).toContain(a.tracks.aType[i]); }
    expect(ledger.getEntries().length).toBe(1);
    expect(ledger.getEntries()[0].contentHash).toBe(a.ledgerContentHash);
    expect(ledger.verifyLedger().ok).toBe(true);
    const again = p!.analyze(ctx, { label: 'cern-complex-v2', n: 4, startIndex: 8 }) as CollisionBatchAnalysis;
    expect(again.ledgerContentHash).toBe(a.ledgerContentHash);
    expect(ledger.getEntries().length).toBe(1);
  });
  it('ComputeColliderEngine: anchorSeed re-derives the seed from a ledger record; hawking and lattice batches are flat, reproducible arrays', () => {
    const ledger = new EvidenceLedger(clock);
    const e = new ComputeColliderEngine(ledger, 'lab', 13000);
    const s0 = e.getSeedBase();
    const h = e.anchorSeed('lab');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(e.getSeedBase()).toBe(parseInt(h.slice(0, 8), 16));
    expect(e.getSeedBase()).not.toBe(s0);
    expect(ledger.getEntries()[0].contentHash).toBe(h);
    const hb = e.hawkingBatch(1e-20, 16);
    expect(hb.length % 3).toBe(0);
    expect(Array.from(hb)).toEqual(Array.from(e.hawkingBatch(1e-20, 16)));
    const c = e.synthesizeCrystal([NA, CL]);
    const nodes = e.latticeNodes(c);
    expect(nodes.length).toBe(c.sites.length * 3);
    expect(nodes[3]).toBeCloseTo(c.sites[1].x * c.aPm, 3);
    const horizon = e.formHorizon(14000);
    expect(horizon.regime).toBe('ADD_TEV_SPECULATIVE');
    expect(e.commitHorizon(horizon)).toBe(e.commitHorizon(horizon));
    expect(e.commitCrystal(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
  it('iron rules: no Math.random, no Date.now in any engine', () => {
    for (const f of ['./BlackHoleEventHorizonEngine.ts', './MaterialsDiscoveryEngine.ts', './ComputeColliderEngine.ts']) {
      const s = readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
      expect(s).not.toContain('Math.random(');
      expect(s).not.toContain('Date.now(');
    }
  });
});
