/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { KernelProviderRegistry, thermoLabProvider, type ThermoLabAnalysis } from '../mythos/KernelProviderRegistry.js';
import { REACTIONS, SPECIES, ThermodynamicLabEngine } from './ThermodynamicLabEngine.js';

const clock = { t: 1_700_000_000_000, now() { return this.t; } };
const ctx = { kernelId: 'genesis-cyber-kernel', route: '#/lab-fpv', operatorId: 'T' };

describe('ThermodynamicLabEngine — standard-state arithmetic from the tabulated data', () => {
  const lab = new ThermodynamicLabEngine(1);
  it('2 H2 + O2 -> 2 H2O(g): ΔH, ΔS, ΔG from ΔfH° and S° (Hess), exothermic and spontaneous', () => {
    const t = lab.thermo('R-H2-O2');
    expect(t.dH).toBeCloseTo(2 * SPECIES.H2O_g.dHf, 3); // -483.64 kJ
    expect(t.dS).toBeCloseTo((2 * SPECIES.H2O_g.S - 2 * SPECIES.H2.S - SPECIES.O2.S) / 1000, 4);
    expect(t.dG).toBeCloseTo(t.dH - 298.15 * t.dS, 1); // dS is reported rounded to 4 decimals; dG is computed from the unrounded value
    expect(t.exothermic).toBe(true);
    expect(t.spontaneous).toBe(true);
  });
  it('CaCO3 -> CaO + CO2 is endothermic and not spontaneous at 298 K, spontaneous at 1200 K', () => {
    expect(lab.thermo('R-CACO3').exothermic).toBe(false);
    expect(lab.thermo('R-CACO3').spontaneous).toBe(false);
    expect(lab.thermo('R-CACO3', 1200).spontaneous).toBe(true);
  });
  it('unknown reaction throws instead of guessing', () => {
    expect(() => lab.thermo('R-NOPE')).toThrow('UNKNOWN_REACTION:R-NOPE');
    expect(() => lab.solveStoichiometry('R-NOPE', {})).toThrow('UNKNOWN_REACTION');
  });
  it('stoichiometry finds the limiting reagent and conserves the species bookkeeping', () => {
    const st = lab.solveStoichiometry('R-H2-O2', { H2: 1, O2: 3 });
    expect(st.limiting).toBe('H2');
    expect(st.extent).toBe(0.5);
    expect(st.consumed).toEqual({ H2: 1, O2: 0.5 });
    expect(st.produced).toEqual({ H2O_g: 1 });
    expect(st.leftover).toEqual({ H2: 0, O2: 2.5, H2O_g: 1 });
    expect(lab.solveStoichiometry('R-H2-O2', { H2: 0, O2: 3 }).extent).toBe(0);
  });
  it('matchReaction needs every reactant present; extra spectators are fine', () => {
    expect(lab.matchReaction(['H2', 'O2'])?.id).toBe('R-H2-O2');
    expect(lab.matchReaction(['H2'])).toBeNull();
    expect(lab.matchReaction(['NaOH_aq', 'HCl_aq', 'H2O_l'])?.id).toBe('R-HCL-NAOH');
    expect(REACTIONS.every((r) => Object.keys(r.coeffs).every((id) => SPECIES[id] !== undefined))).toBe(true);
  });
});

describe('ThermodynamicLabEngine.mix — outcomes, determinism, ledger', () => {
  it('hydrogen + oxygen with ignition: hot, gas produced, explosion flagged; without ignition no explosion', () => {
    const lab = new ThermodynamicLabEngine(5);
    const lit = lab.mix({ H2: 2, O2: 1 }, true);
    expect(lit.reactionId).toBe('R-H2-O2');
    expect(lit.stoich?.limiting).toBe('H2');
    expect(lit.adiabaticTK).toBeGreaterThan(1200);
    expect(lit.outcome.gasMol).toBe(2);
    expect(lit.outcome.explosion).toBe(true);
    expect(lit.outcome.phaseChanges).toContain('H2O(l)->H2O(g)');
    const cold = lab.mix({ H2: 2, O2: 1 }, false);
    expect(cold.outcome.explosion).toBe(false);
    expect(cold.adiabaticTK).toBe(lit.adiabaticTK);
    expect(cold.eventHash).not.toBe(lit.eventHash); // the explosion flag is part of the hashed outcome
  });
  it('acid + base neutralisation: mildly exothermic, no gas, no explosion, colour unchanged', () => {
    const r = new ThermodynamicLabEngine(5).mix({ HCl_aq: 1, NaOH_aq: 1 }, false);
    expect(r.reactionId).toBe('R-HCL-NAOH');
    expect(r.thermo?.dH).toBeCloseTo(-55.83, 2);
    expect(r.outcome.gasMol).toBe(0);
    expect(r.outcome.explosion).toBe(false);
    expect(r.adiabaticTK).toBeGreaterThan(298.15);
    expect(r.adiabaticTK).toBeLessThan(700);
  });
  it('sodium + chlorine crystallises when a liquid or aqueous phase is present', () => {
    const r = new ThermodynamicLabEngine(5).mix({ Na_s: 2, Cl2: 1, H2O_l: 1 }, false);
    expect(r.reactionId).toBe('R-NA-CL2');
    expect(r.stoich?.produced.NaCl_s).toBe(2);
    expect(r.outcome.crystallization).toBe(true);
  });
  it('no matching reaction: nothing happens, amounts unchanged, still hashed', () => {
    const r = new ThermodynamicLabEngine(5).mix({ H2: 1, CH4: 1 }, true);
    expect(r.reactionId).toBeNull();
    expect(r.finalAmounts).toEqual({ H2: 1, CH4: 1 });
    expect(r.adiabaticTK).toBe(298.15);
    expect(r.eventHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic per seed: same inputs give the same hash, different seed a different one', () => {
    const a = new ThermodynamicLabEngine(11).mix({ CH4: 1, O2: 2 }, true);
    const b = new ThermodynamicLabEngine(11).mix({ CH4: 1, O2: 2 }, true);
    const c = new ThermodynamicLabEngine(12).mix({ CH4: 1, O2: 2 }, true);
    expect(a.eventHash).toBe(b.eventHash);
    expect(a.eventHash).not.toBe(c.eventHash);
    expect(a.adiabaticTK).toBe(c.adiabaticTK); // the physics does not depend on the seed, only the provenance does
  });
  it('commitToLedger anchors the result as a model claim and the chain verifies', () => {
    const ledger = new EvidenceLedger(clock);
    const lab = new ThermodynamicLabEngine(5);
    const r = lab.mix({ C_s: 1, O2: 1 }, true);
    const h = lab.commitToLedger(ledger, r);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(ledger.getEntries()[0].contentHash).toBe(h);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});

describe('thermo-lab provider — resolved through the single kernel', () => {
  it('resolves by capability, returns the engine result with its ledger hash and the model label', () => {
    const ledger = new EvidenceLedger(clock);
    const reg = new KernelProviderRegistry();
    reg.bindKernel('genesis-cyber-kernel');
    reg.register(thermoLabProvider(ledger));
    const p = reg.resolve('thermodynamic-reaction-sim');
    expect(p?.providerId).toBe('thermo-lab');
    const a = p!.analyze(ctx, { seed: 5, reagents: { H2: 2, O2: 1 }, ignition: true }) as ThermoLabAnalysis;
    expect(a.label).toBe('THERMODYNAMIC_MODEL');
    expect(a.result.eventHash).toBe(new ThermodynamicLabEngine(5).mix({ H2: 2, O2: 1 }, true).eventHash);
    expect(ledger.getEntries().some((e) => e.contentHash === a.ledgerContentHash)).toBe(true);
  });
  it('iron rules: no Math.random, no Date.now', () => {
    const s = readFileSync(fileURLToPath(new URL('./ThermodynamicLabEngine.ts', import.meta.url)), 'utf8');
    expect(s).not.toContain('Math.random(');
    expect(s).not.toContain('Date.now(');
  });
});
