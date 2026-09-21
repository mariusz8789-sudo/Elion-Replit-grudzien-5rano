/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { KernelProviderRegistry, colliderProvider, type ColliderAnalysis } from '../mythos/KernelProviderRegistry.js';
import { PHYS, PARTICLES, QuantumColliderEngine, alphaS, jetCrossSectionPb, massOf, add4, dot4, type ColliderEvent } from './QuantumColliderEngine.js';

const clock = { t: 1_700_000_000_000, now() { return this.t; } };
const ctx = { kernelId: 'genesis-cyber-kernel', route: '#/collider', operatorId: 'T' };

describe('QuantumColliderEngine — determinism and hash consistency', () => {
  it('same seed and index give the same event, hash and id; a different index or seed does not', () => {
    const a = new QuantumColliderEngine(42).generateEvent(7);
    const b = new QuantumColliderEngine(42).generateEvent(7);
    expect(a.eventHash).toBe(b.eventHash);
    expect(a.eventId).toBe(b.eventId);
    expect(a.finals).toEqual(b.finals);
    expect(new QuantumColliderEngine(42).generateEvent(8).eventHash).not.toBe(a.eventHash);
    expect(new QuantumColliderEngine(43).generateEvent(7).eventHash).not.toBe(a.eventHash);
    expect(a.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.eventId).toBe('EVT-' + a.eventHash.slice(0, 12).toUpperCase());
  });
  it('hard pT respects the generator cut and |y| the acceptance; final state is non-empty for every process', () => {
    const engine = new QuantumColliderEngine(7);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const ev = engine.generateEvent(i);
      seen.add(ev.process);
      expect(ev.hardPT).toBeGreaterThanOrEqual(PHYS.PT_MIN);
      expect(Math.abs(ev.y)).toBeLessThanOrEqual(PHYS.Y_MAX);
      expect(ev.finals.length).toBeGreaterThan(0);
      expect(ev.crossSectionPb).toBeGreaterThan(0);
      for (const f of ev.finals) { expect(PARTICLES[f.pdg]).toBeDefined(); expect(f.p4.e).toBeGreaterThanOrEqual(0); }
    }
    expect(seen.has('qcd')).toBe(true);
    expect(seen.has('z') || seen.has('w')).toBe(true);
  });
  it('a leptonic Z decay reconstructs the resonance mass within the generator width', () => {
    const engine = new QuantumColliderEngine(2024);
    let found: ColliderEvent | null = null;
    for (let i = 0; i < 3000 && !found; i++) {
      const ev = engine.generateEvent(i);
      if (ev.process === 'z' && ev.finals.length === 2 && Math.abs(ev.finals[0].pdg) === 13) found = ev;
    }
    expect(found).not.toBeNull();
    const m = massOf(add4(found!.finals[0].p4, found!.finals[1].p4));
    expect(Math.abs(m - PHYS.Z_MASS)).toBeLessThan(1.6); // m0 = M_Z ± 1.5 by construction
    for (const f of found!.finals) expect(Math.abs(massOf(f.p4) - PHYS.MUON)).toBeLessThan(1e-6);
  });
  it('running coupling falls with scale and the toy jet spectrum falls steeply with pT', () => {
    expect(alphaS(10)).toBeGreaterThan(alphaS(100));
    expect(alphaS(100)).toBeGreaterThan(alphaS(1000));
    expect(jetCrossSectionPb(40)).toBeLessThan(jetCrossSectionPb(20));
    expect(jetCrossSectionPb(20) / jetCrossSectionPb(40)).toBeGreaterThan(10);
    expect(dot4({ e: 5, px: 3, py: 0, pz: 4 }, { e: 5, px: 3, py: 0, pz: 4 })).toBe(0);
  });
  it('commitToLedger anchors the event as a model claim; the same event dedupes to the same record', () => {
    const ledger = new EvidenceLedger(clock);
    const engine = new QuantumColliderEngine(9);
    const ev = engine.generateEvent(1);
    const h1 = engine.commitToLedger(ledger, ev);
    const h2 = engine.commitToLedger(ledger, ev);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(ledger.getEntries().length).toBe(1);
    expect(ledger.getEntries()[0].contentHash).toBe(h1);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});

describe('collider provider — resolved through the single kernel, committed to the ledger', () => {
  it('resolves by capability, returns the engine event with its ledger hash and the model label', () => {
    const ledger = new EvidenceLedger(clock);
    const reg = new KernelProviderRegistry();
    reg.bindKernel('genesis-cyber-kernel');
    reg.register(colliderProvider(ledger));
    const p = reg.resolve('particle-collision-sim');
    expect(p?.providerId).toBe('quantum-collider');
    const a = p!.analyze(ctx, { seed: 42, index: 7 }) as ColliderAnalysis;
    expect(a.label).toBe('TOY_MC_MODEL');
    expect(a.event.eventHash).toBe(new QuantumColliderEngine(42).generateEvent(7).eventHash);
    expect(ledger.getEntries().some((e) => e.contentHash === a.ledgerContentHash)).toBe(true);
    expect(() => reg.bindKernel('collider-kernel')).toThrow('KERNEL_ALREADY_BOUND');
  });
  it('iron rules: no Math.random, no Date.now', () => {
    const s = readFileSync(fileURLToPath(new URL('./QuantumColliderEngine.ts', import.meta.url)), 'utf8');
    expect(s).not.toContain('Math.random(');
    expect(s).not.toContain('Date.now(');
  });
});
