import { describe, expect, it } from 'vitest';
import { describeLigand, parseSmiles, SmilesParseError } from './chemistrySMILES.js';

describe('chemistrySMILES — parser', () => {
  it('parses a linear chain with an explicit double bond (ethene-style)', () => {
    const mol = parseSmiles('C=C');
    expect(mol.atoms.map((a) => a.symbol)).toEqual(['C', 'C']);
    expect(mol.bonds).toEqual([{ a: 0, b: 1, order: 'DOUBLE', ringClosure: false }]);
  });

  it('branch-stack: sequential branches off the SAME parent atom each restore the correct parent (the class of bug a single-variable "last branch" tracker gets wrong)', () => {
    // O=S(=O)(O)O — sulfuric acid's real SMILES from the installed compound data (w-h2so4).
    // Two branches in a row hang off atom 1 (S); after each ')' the parent must be S again, not the branch's own last atom.
    const mol = parseSmiles('O=S(=O)(O)O');
    expect(mol.atoms.map((a) => a.symbol)).toEqual(['O', 'S', 'O', 'O', 'O']);
    expect(mol.bonds).toEqual([
      { a: 0, b: 1, order: 'DOUBLE', ringClosure: false }, // O=S
      { a: 1, b: 2, order: 'DOUBLE', ringClosure: false }, // S(=O)
      { a: 1, b: 3, order: 'SINGLE', ringClosure: false }, // S(O)
      { a: 1, b: 4, order: 'SINGLE', ringClosure: false }, // S-O (trailing, outside any branch)
    ]);
  });

  it('branch-stack: nested branches at depth 2 restore through both levels', () => {
    // C C(C C(C) C) C — a branch containing its own branch; after the inner ')' the parent is the branch's own chain atom, after the outer ')' it is the original backbone atom.
    const mol = parseSmiles('CC(CC(C)C)C');
    // indices: 0=C 1=C 2=C(in branch) 3=C(in branch, has its own branch) 4=C(inner branch) 5=C(after inner branch, back on atom3's chain) 6=C(after outer branch, back on atom1)
    expect(mol.atoms).toHaveLength(7);
    expect(mol.bonds.map((b) => [b.a, b.b])).toEqual([
      [0, 1], // C-C
      [1, 2], // C(C...
      [2, 3], // C-C
      [3, 4], // C(C)  inner branch
      [3, 5], // C...C  back on atom3 after inner branch closes
      [1, 6], // back on atom1 after outer branch closes
    ]);
  });

  it('ring closures: a single digit pairs the two atoms that share it, and the digit is reusable once closed', () => {
    const ring = parseSmiles('C1CC1');
    expect(ring.ringBondCount).toBe(1);
    expect(ring.bonds).toContainEqual({ a: 0, b: 2, order: 'SINGLE', ringClosure: true });

    const twoRings = parseSmiles('C1CC1C1CC1');
    expect(twoRings.ringBondCount).toBe(2);
    expect(twoRings.atoms).toHaveLength(6);
  });

  it('ring closures: %nn two-digit ring numbers work the same as a single digit', () => {
    const mol = parseSmiles('C%10CCCCC%10');
    expect(mol.atoms).toHaveLength(6);
    expect(mol.ringBondCount).toBe(1);
    expect(mol.bonds).toContainEqual({ a: 0, b: 5, order: 'SINGLE', ringClosure: true });
  });

  it('aromatic lowercase atoms form an aromatic ring (benzene)', () => {
    const mol = parseSmiles('c1ccccc1');
    expect(mol.atoms).toHaveLength(6);
    expect(mol.atoms.every((a) => a.aromatic && a.symbol === 'C')).toBe(true);
    expect(mol.bonds.every((b) => b.order === 'AROMATIC')).toBe(true);
    expect(mol.ringBondCount).toBe(1);
  });

  it('disconnected components (".") do not bond across the separator', () => {
    // [Na+].[OH-] — the real SMILES from the installed w-naoh compound.
    const mol = parseSmiles('[Na+].[OH-]');
    expect(mol.componentCount).toBe(2);
    expect(mol.bonds).toEqual([]);
    expect(mol.atoms.map((a) => a.component)).toEqual([0, 1]);
  });

  it('bracket atoms: charge and explicit hydrogen count parse correctly (real installed-compound SMILES)', () => {
    const mgcl2 = parseSmiles('[Mg+2].[Cl-].[Cl-]');
    expect(mgcl2.atoms.map((a) => [a.symbol, a.charge])).toEqual([['Mg', 2], ['Cl', -1], ['Cl', -1]]);

    const co = parseSmiles('[C-]#[O+]');
    expect(co.atoms.map((a) => [a.symbol, a.charge])).toEqual([['C', -1], ['O', 1]]);
    expect(co.bonds).toEqual([{ a: 0, b: 1, order: 'TRIPLE', ringClosure: false }]);
  });

  it('bracket atoms: explicit hydrogen count via H<digit>', () => {
    const mol = parseSmiles('[OH2]');
    expect(mol.atoms[0]).toMatchObject({ symbol: 'O', explicitHydrogens: 2, charge: 0 });
  });

  it('rejects an unbalanced branch close', () => {
    expect(() => parseSmiles('CC)C')).toThrow(SmilesParseError);
    expect(() => parseSmiles('CC)C')).toThrow(/UNBALANCED_BRANCH_CLOSE/);
  });

  it('rejects an unclosed branch', () => {
    expect(() => parseSmiles('CC(CC')).toThrow(/UNCLOSED_BRANCH/);
  });

  it('rejects an unclosed ring', () => {
    expect(() => parseSmiles('C1CC')).toThrow(/UNCLOSED_RING/);
  });

  it('rejects an unrecognized token and an unknown bracket element', () => {
    expect(() => parseSmiles('C$C')).toThrow(/UNRECOGNIZED_TOKEN/);
    expect(() => parseSmiles('[Zz]')).toThrow(/UNKNOWN_BRACKET_ELEMENT/);
  });

  it('rejects an empty string', () => {
    expect(() => parseSmiles('')).toThrow(/EMPTY_SMILES/);
    expect(() => parseSmiles('   ')).toThrow(/EMPTY_SMILES/);
  });

  it('parses two-letter organic-subset elements (Cl, Br) without splitting them', () => {
    const mol = parseSmiles('ClBr');
    expect(mol.atoms.map((a) => a.symbol)).toEqual(['Cl', 'Br']);
  });
});

describe('chemistrySMILES — describeLigand (coarse deterministic descriptors)', () => {
  it('sulfuric acid (O=S(=O)(O)O, the real w-h2so4 SMILES): 2 OH donors, 4 O acceptors, no ring, net neutral', () => {
    const d = describeLigand(parseSmiles('O=S(=O)(O)O'));
    expect(d.heavyAtomCount).toBe(5);
    expect(d.hDonorCount).toBe(2);
    expect(d.hAcceptorCount).toBe(4);
    expect(d.netCharge).toBe(0);
    expect(d.ringBondCount).toBe(0);
    expect(d.hydrophobicityProxy).toBeCloseTo(-0.8, 5);
  });

  it('benzene (c1ccccc1): fully lipophilic, one ring, no donors/acceptors', () => {
    const d = describeLigand(parseSmiles('c1ccccc1'));
    expect(d.heavyAtomCount).toBe(6);
    expect(d.aromaticAtomCount).toBe(6);
    expect(d.ringBondCount).toBe(1);
    expect(d.hDonorCount).toBe(0);
    expect(d.hAcceptorCount).toBe(0);
    expect(d.hydrophobicityProxy).toBe(1);
  });

  it('is a pure function of the parsed graph: identical input always yields an identical descriptor object', () => {
    const a = describeLigand(parseSmiles('CC(=O)Oc1ccccc1C(=O)O'));
    const b = describeLigand(parseSmiles('CC(=O)Oc1ccccc1C(=O)O'));
    expect(a).toEqual(b);
  });
});
