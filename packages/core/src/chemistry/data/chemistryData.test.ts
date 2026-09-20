import { describe, expect, it } from 'vitest';
import { balanceCheck, parseFormulaV2 } from '../chemistryCore.js';
import { ELEMENTS } from './elements.js';
import { ISOTOPES, IONS, BOND_TYPES, VSEPR } from './species.js';
import { INORGANIC, ORGANIC, FUNCTIONAL_GROUPS, BIOCHEMISTRY } from './compounds.js';
import { REACTIONS, PHYS_CHEM_EQUATIONS, STOICHIOMETRY_RULES } from './reactions.js';
import { EXTRA_REACTIONS } from './reactionsExtra.js';
import { GLOSSARY } from './terminology.js';

describe('Genesis Chemistry v0.1-compatible base', () => {
  it('contains 118 unique elements with conservative provenance', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(new Set(ELEMENTS.map((e) => e.atomicNumber)).size).toBe(118);
    expect(new Set(ELEMENTS.map((e) => e.symbol)).size).toBe(118);
    expect(ELEMENTS.every((e) => e.provenance.verificationStatus === 'SOURCE_DECLARED_NOT_LIVE_VERIFIED')).toBe(true);
  });

  it('contains deterministic registries without duplicate ids', () => {
    for (const rows of [IONS, BOND_TYPES, VSEPR, INORGANIC, ORGANIC, FUNCTIONAL_GROUPS, BIOCHEMISTRY, REACTIONS, EXTRA_REACTIONS, GLOSSARY, PHYS_CHEM_EQUATIONS, STOICHIOMETRY_RULES]) {
      const ids = rows.map((row: { id: string }) => row.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('contains deterministic isotope records without duplicate nuclide keys', () => {
    // Isotope has no `id` field (see genesisChemistryTypes.ts); a nuclide is uniquely
    // identified by its element + mass number + metastable flag.
    const keys = ISOTOPES.map((iso) => `${iso.element}-${iso.massNumber}${iso.metastable ? 'm' : ''}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('contains all v0.2.1 parser charge cases in the source registries', () => {
    const formulas = IONS.map((ion) => ion.formula);
    expect(formulas).toEqual(expect.arrayContaining([
      'NH4+',
      'Fe3+',
      'SO4^2-',
      'Fe(CN)6^3-',
      '[Fe(CN)6]4-',
      '[Cu(NH3)4]2+',
    ]));
  });

  it('executes the real v0.2.1 parser contract', () => {
    expect(parseFormulaV2('NH4+')).toEqual({ composition: { N: 1, H: 4 }, charge: 1 });
    expect(parseFormulaV2('Fe3+')).toEqual({ composition: { Fe: 1 }, charge: 3 });
    expect(parseFormulaV2('SO4^2-')).toEqual({ composition: { S: 1, O: 4 }, charge: -2 });
    expect(parseFormulaV2('Fe(CN)6^3-')).toEqual({ composition: { Fe: 1, C: 6, N: 6 }, charge: -3 });
    expect(parseFormulaV2('[Fe(CN)6]4-')).toEqual({ composition: { Fe: 1, C: 6, N: 6 }, charge: -4 });
    expect(parseFormulaV2('[Cu(NH3)4]2+')).toEqual({ composition: { Cu: 1, N: 4, H: 12 }, charge: 2 });
  });

  it('contains atom- and charge-balanced base and supplemental reactions', () => {
    const reactions = [...REACTIONS, ...EXTRA_REACTIONS];
    expect(reactions.length).toBeGreaterThanOrEqual(70);
    for (const reaction of reactions) {
      const result = balanceCheck(reaction.reactants, reaction.products);
      expect(result.atomsOk, `${reaction.id}: ${JSON.stringify(result.atomDiff)}`).toBe(true);
      expect(result.chargeOk, `${reaction.id}: ${result.chargeDiff}`).toBe(true);
    }
  });

  it('contains the v0.2.1-required isotope correction seed and ATP reaction', () => {
    expect(ISOTOPES.some((iso) => iso.element === 'Tc' && iso.massNumber === 99)).toBe(true);
    expect(REACTIONS.some((reaction) => reaction.id === 'R27')).toBe(true);
  });
});
