/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import * as core from './chemistryCore.js';
import { balanceCheck, FormulaParseError, parseFormulaV2 } from './chemistryCore.js';
import { chemistryAdapter } from './chemistryKnowledgeAdapter.js';
import { ELEMENTS } from './data/elements.js';

describe('v0.2.1 parser hardening', () => {
  it('parses plain positive/negative charges', () => {
    expect(parseFormulaV2('NH4+')).toEqual({ composition: { N: 1, H: 4 }, charge: 1 });
    expect(parseFormulaV2('H3O+')).toEqual({ composition: { H: 3, O: 1 }, charge: 1 });
    expect(parseFormulaV2('Fe3+')).toEqual({ composition: { Fe: 1 }, charge: 3 });
    expect(parseFormulaV2('Cl-')).toEqual({ composition: { Cl: 1 }, charge: -1 });
  });

  it('parses explicit and grouped charges', () => {
    expect(parseFormulaV2('SO4^2-')).toEqual({ composition: { S: 1, O: 4 }, charge: -2 });
    expect(parseFormulaV2('Fe(CN)6^3-')).toEqual({ composition: { Fe: 1, C: 6, N: 6 }, charge: -3 });
    expect(parseFormulaV2('[Fe(CN)6]4-')).toEqual({ composition: { Fe: 1, C: 6, N: 6 }, charge: -4 });
    expect(parseFormulaV2('[Cu(NH3)4]2+')).toEqual({ composition: { Cu: 1, N: 4, H: 12 }, charge: 2 });
  });

  it('parses nested groups and hydrates', () => {
    expect(parseFormulaV2('Al2(SO4)3')).toEqual({ composition: { Al: 2, S: 3, O: 12 }, charge: 0 });
    expect(parseFormulaV2('CuSO4.5H2O')).toEqual({ composition: { Cu: 1, S: 1, O: 9, H: 10 }, charge: 0 });
    expect(parseFormulaV2('Na2CO3·10H2O')).toEqual({ composition: { Na: 2, C: 1, O: 13, H: 20 }, charge: 0 });
  });

  it('rejects malformed formulas and unknown elements', () => {
    expect(() => parseFormulaV2('H2O!')).toThrow(FormulaParseError);
    expect(() => parseFormulaV2('Xx2')).toThrow(FormulaParseError);
    expect(() => parseFormulaV2('Ca(OH2')).toThrow(FormulaParseError);
  });
});

describe('v0.2.1 reaction balance hardening', () => {
  it('has one authoritative balance implementation', () => {
    expect('checkReactionBalance' in core).toBe(false);
  });

  it('derives charge from formula when participant charge is omitted', () => {
    expect(balanceCheck(
      [{ f: 'H+', c: 1 }, { f: 'OH-', c: 1 }],
      [{ f: 'H2O', c: 1 }],
    )).toEqual({ atomsOk: true, chargeOk: true, atomDiff: { H: 0, O: 0 }, chargeDiff: 0 });
  });

  it('detects unbalanced reactions', () => {
    const result = balanceCheck([{ f: 'H2', c: 1 }, { f: 'O2', c: 1 }], [{ f: 'H2O', c: 1 }]);
    expect(result.atomsOk).toBe(false);
  });

  it('all normalized reactions are atom- and charge-balanced', () => {
    for (const reaction of chemistryAdapter.reactions) {
      const result = balanceCheck(reaction.reactants, reaction.products);
      expect(result.atomsOk, `${reaction.id}: ${JSON.stringify(result.atomDiff)}`).toBe(true);
      expect(result.chargeOk, `${reaction.id}: ${result.chargeDiff}`).toBe(true);
    }
    expect(chemistryAdapter.reactions.length).toBeGreaterThanOrEqual(70);
  });
});

describe('v0.2.1 normalization', () => {
  it('keeps the 118-element table', () => {
    expect(ELEMENTS.length).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.atomicNumber)).size).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
  });

  it('normalizes special isotopes', () => {
    const tc99 = chemistryAdapter.getIsotopes('Tc').filter((i) => i.massNumber === 99);
    expect(tc99).toHaveLength(2);
    expect(tc99.find((i) => i.metastable)?.halfLife).toBe('6.01 h');
    expect(tc99.find((i) => !i.metastable)?.halfLife).toBe('2.11e5 y');
  });

  it('normalizes network solids and acid media', () => {
    expect(chemistryAdapter.getCompound('w-sio2')?.structureKind).toBe('NETWORK_SOLID');
    expect(chemistryAdapter.getCompound('w-sio2')?.smiles).toBeNull();
    expect(chemistryAdapter.getCompound('w-h2so4')?.medium).toBe('pure');
    expect(chemistryAdapter.getCompound('w-so3')?.phase).toBe('liquid');
    expect(chemistryAdapter.getCompound('w-fe2o3')?.aliases).not.toContain('rust');
  });

  it('emits complete hashes and conservative verification status', () => {
    const manifest = chemistryAdapter.manifest();
    expect(manifest.verificationStatus).toBe('SOURCE_DECLARED_NOT_LIVE_VERIFIED');
    expect(Object.keys(manifest.sha256).length).toBeGreaterThanOrEqual(10);
    expect(Object.values(manifest.sha256).every((sha) => /^[0-9a-f]{64}$/u.test(sha))).toBe(true);
  });
});
