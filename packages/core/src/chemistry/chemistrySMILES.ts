/* Proprietary / All Rights Reserved - Genesis OS */
import { ELEMENT_BY_SYMBOL } from './data/elements.js';

/**
 * GENESIS CHEMISTRY — SMILES PARSER (D-137).
 *
 * A real, self-contained SMILES tokenizer/parser (no RDKit, no native binding, no
 * network fetch). It covers the organic subset (B,C,N,O,P,S,F,Cl,Br,I and their
 * lowercase aromatic forms), bracket atoms `[...]` (any real element from the
 * canonical `ELEMENT_BY_SYMBOL` table, explicit charge, explicit hydrogen count),
 * bond symbols (`-=#:`), branches `( )`, ring-closure digits and `%nn` two-digit
 * ring numbers, and disconnected components (`.`).
 *
 * Branch handling uses an explicit parent-index stack: `(` pushes the CURRENT
 * atom, `)` pops it back as the current atom. This is deliberately explicit
 * (rather than recursive-descent over substrings) so nested branches at any
 * depth, and a branch immediately followed by another branch on the same atom
 * ("C(C)(C)C"), restore the correct parent every time — the class of bug a
 * naive single-variable "last branch point" tracker gets wrong.
 *
 * This is a graph-topology parser only: it produces atoms, bonds and a small
 * set of coarse descriptors used by `moleculeDockingEngine.ts`'s heuristic. It
 * does NOT compute 3D coordinates, perceive real H-bond donors/acceptors with
 * RDKit-grade accuracy, or run a force field — every descriptor below is
 * explicitly a coarse proxy, documented as such.
 */

export type BondOrder = 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'AROMATIC';

export interface SmilesAtom {
  readonly index: number;
  /** Canonical element symbol (e.g. 'C', 'Cl', 'Na') — case-normalized regardless of aromatic lowercase input. */
  readonly symbol: string;
  readonly aromatic: boolean;
  readonly charge: number;
  /** Explicit hydrogen count from a bracket atom; null when implicit (organic-subset atom outside brackets). */
  readonly explicitHydrogens: number | null;
  /** Which disconnected fragment (split by '.') this atom belongs to, 0-based. */
  readonly component: number;
}

export interface SmilesBond {
  readonly a: number;
  readonly b: number;
  readonly order: BondOrder;
  readonly ringClosure: boolean;
}

export interface SmilesMolecule {
  readonly atoms: readonly SmilesAtom[];
  readonly bonds: readonly SmilesBond[];
  readonly componentCount: number;
  readonly ringBondCount: number;
}

export class SmilesParseError extends Error {
  constructor(message: string, readonly position: number) {
    super(`SMILES_PARSE_ERROR:${message}@${position}`);
    this.name = 'SmilesParseError';
  }
}

const BOND_SYMBOL: Readonly<Record<string, BondOrder>> = { '-': 'SINGLE', '=': 'DOUBLE', '#': 'TRIPLE', ':': 'AROMATIC' };
const ORGANIC_TWO_LETTER: readonly string[] = ['Cl', 'Br'];
const ORGANIC_ONE_LETTER_UPPER: readonly string[] = ['B', 'C', 'N', 'O', 'P', 'S', 'F', 'I'];
const ORGANIC_ONE_LETTER_AROMATIC: readonly string[] = ['b', 'c', 'n', 'o', 'p', 's'];

function defaultBondOrder(aAromatic: boolean, bAromatic: boolean): BondOrder {
  return aAromatic && bAromatic ? 'AROMATIC' : 'SINGLE';
}

interface BracketAtomResult {
  readonly symbol: string;
  readonly aromatic: boolean;
  readonly charge: number;
  readonly explicitHydrogens: number;
  readonly length: number;
}

/** Parses the content between `[` and `]` (exclusive), starting at `content[0]`. `at` is the position of `[` in the full string, for error reporting. */
function parseBracketContent(content: string, at: number): BracketAtomResult {
  let i = 0;
  // Isotope: leading digits, not semantically used by this graph-topology parser but must be consumed.
  while (i < content.length && /\d/.test(content[i])) i += 1;

  let symbol: string | null = null;
  let aromatic = false;
  const twoLetter = content.slice(i, i + 2);
  const twoLetterCanonical = twoLetter.length === 2 ? twoLetter[0].toUpperCase() + twoLetter[1].toLowerCase() : '';
  if (twoLetterCanonical && twoLetterCanonical !== 'H' && ELEMENT_BY_SYMBOL.has(twoLetterCanonical) && /^[A-Za-z][a-z]$/.test(twoLetter)) {
    symbol = twoLetterCanonical;
    i += 2;
  } else {
    const one = content[i];
    if (!one) throw new SmilesParseError('EMPTY_BRACKET_ATOM', at);
    const upper = one.toUpperCase();
    if (ELEMENT_BY_SYMBOL.has(upper)) {
      symbol = upper;
      aromatic = one === one.toLowerCase() && one !== upper;
      i += 1;
    }
  }
  if (!symbol) throw new SmilesParseError(`UNKNOWN_BRACKET_ELEMENT:${content.slice(i)}`, at);

  // Chirality markers: skip.
  while (content[i] === '@') i += 1;

  // Explicit hydrogen count: 'H' optionally followed by digits (bare 'H' means exactly one).
  let explicitHydrogens = 0;
  if (content[i] === 'H') {
    i += 1;
    const digits = /^\d+/.exec(content.slice(i));
    if (digits) { explicitHydrogens = Number.parseInt(digits[0], 10); i += digits[0].length; }
    else explicitHydrogens = 1;
  }

  // Charge: repeated signs ("++", "--") or a single sign with digits ("+2", "-3").
  let charge = 0;
  if (content[i] === '+' || content[i] === '-') {
    const sign = content[i] === '-' ? -1 : 1;
    const signChar = content[i];
    let j = i;
    let repeats = 0;
    while (content[j] === signChar) { repeats += 1; j += 1; }
    const digits = /^\d+/.exec(content.slice(j));
    if (digits && repeats === 1) { charge = sign * Number.parseInt(digits[0], 10); i = j + digits[0].length; }
    else { charge = sign * repeats; i = j; }
  }

  // Atom class ":n": skip.
  if (content[i] === ':') {
    i += 1;
    while (i < content.length && /\d/.test(content[i])) i += 1;
  }

  return { symbol, aromatic, charge, explicitHydrogens, length: i };
}

/** Full deterministic SMILES parser: organic subset + bracket atoms + branches (explicit parent stack) + ring closures + disconnected components. */
export function parseSmiles(input: string): SmilesMolecule {
  const text = input.trim();
  if (!text) throw new SmilesParseError('EMPTY_SMILES', 0);

  const atoms: SmilesAtom[] = [];
  const bonds: SmilesBond[] = [];
  const stack: number[] = [];
  let current: number | null = null;
  let pendingBond: BondOrder | null = null;
  let component = 0;
  let ringBondCount = 0;
  const ringOpenings = new Map<string, { readonly atomIndex: number; readonly bond: BondOrder | null }>();

  const addAtom = (symbol: string, aromatic: boolean, charge: number, explicitHydrogens: number | null): number => {
    const index = atoms.length;
    atoms.push({ index, symbol, aromatic, charge, explicitHydrogens, component });
    if (current !== null) {
      const order = pendingBond ?? defaultBondOrder(atoms[current].aromatic, aromatic);
      bonds.push({ a: current, b: index, order, ringClosure: false });
    }
    pendingBond = null;
    current = index;
    return index;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '.') { current = null; pendingBond = null; component += 1; i += 1; continue; }

    if (ch in BOND_SYMBOL) { pendingBond = BOND_SYMBOL[ch]; i += 1; continue; }
    if (ch === '/' || ch === '\\') { pendingBond = pendingBond ?? 'SINGLE'; i += 1; continue; }

    if (ch === '(') {
      if (current === null) throw new SmilesParseError('BRANCH_WITHOUT_ATOM', i);
      stack.push(current);
      i += 1;
      continue;
    }
    if (ch === ')') {
      if (stack.length === 0) throw new SmilesParseError('UNBALANCED_BRANCH_CLOSE', i);
      current = stack.pop()!;
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = text.indexOf(']', i + 1);
      if (close === -1) throw new SmilesParseError('MISSING_BRACKET_CLOSE', i);
      const content = text.slice(i + 1, close);
      const parsed = parseBracketContent(content, i);
      addAtom(parsed.symbol, parsed.aromatic, parsed.charge, parsed.explicitHydrogens);
      i = close + 1;
      continue;
    }

    if (ch === '%' || /\d/.test(ch)) {
      let key: string;
      let len: number;
      if (ch === '%') {
        const digits = text.slice(i + 1, i + 3);
        if (!/^\d{2}$/.test(digits)) throw new SmilesParseError('BAD_RING_PERCENT', i);
        key = digits;
        len = 3;
      } else {
        key = ch;
        len = 1;
      }
      if (current === null) throw new SmilesParseError('RING_CLOSURE_WITHOUT_ATOM', i);
      const opening = ringOpenings.get(key);
      if (!opening) {
        ringOpenings.set(key, { atomIndex: current, bond: pendingBond });
        pendingBond = null;
      } else {
        const order = opening.bond ?? pendingBond ?? defaultBondOrder(atoms[opening.atomIndex].aromatic, atoms[current].aromatic);
        bonds.push({ a: opening.atomIndex, b: current, order, ringClosure: true });
        ringBondCount += 1;
        ringOpenings.delete(key);
        pendingBond = null;
      }
      i += len;
      continue;
    }

    const twoLetter = text.slice(i, i + 2);
    if ((ORGANIC_TWO_LETTER as readonly string[]).includes(twoLetter)) { addAtom(twoLetter, false, 0, null); i += 2; continue; }

    if ((ORGANIC_ONE_LETTER_UPPER as readonly string[]).includes(ch)) { addAtom(ch, false, 0, null); i += 1; continue; }
    if ((ORGANIC_ONE_LETTER_AROMATIC as readonly string[]).includes(ch)) { addAtom(ch.toUpperCase(), true, 0, null); i += 1; continue; }

    throw new SmilesParseError(`UNRECOGNIZED_TOKEN:${ch}`, i);
  }

  if (stack.length > 0) throw new SmilesParseError('UNCLOSED_BRANCH', text.length);
  if (ringOpenings.size > 0) throw new SmilesParseError(`UNCLOSED_RING:${[...ringOpenings.keys()].join(',')}`, text.length);
  if (atoms.length === 0) throw new SmilesParseError('NO_ATOMS', 0);

  return { atoms, bonds, componentCount: component + 1, ringBondCount };
}

export interface LigandDescriptors {
  readonly heavyAtomCount: number;
  readonly ringBondCount: number;
  readonly aromaticAtomCount: number;
  readonly netCharge: number;
  /** Coarse heuristic proxy: a terminal (degree <= 1), non-aromatic N/O reached by a SINGLE bond (an -OH/-NH2-style group). Not a validated H-bond perception algorithm. */
  readonly hDonorCount: number;
  /** Coarse heuristic proxy: every N/O atom (lone-pair bearing) counts as an acceptor candidate. */
  readonly hAcceptorCount: number;
  /** -1 (polar) .. 1 (lipophilic): (#C/halogen - #N/O) / heavyAtomCount. A composition-only proxy, not a computed logP. */
  readonly hydrophobicityProxy: number;
  /** heavyAtomCount + 2*ringBondCount — a coarse "how much space this ligand occupies" proxy used against the receptor pocket volume. */
  readonly molecularExtentProxy: number;
}

const LIPOPHILIC = new Set(['C', 'F', 'Cl', 'Br', 'I']);
const POLAR = new Set(['N', 'O']);

/** Coarse, deterministic descriptors of a parsed SMILES graph. No 3D geometry, no external cheminformatics library — every field is documented as a heuristic proxy. */
export function describeLigand(mol: SmilesMolecule): LigandDescriptors {
  const bondOrdersOf = new Map<number, BondOrder[]>();
  for (const bond of mol.bonds) {
    (bondOrdersOf.get(bond.a) ?? bondOrdersOf.set(bond.a, []).get(bond.a)!).push(bond.order);
    (bondOrdersOf.get(bond.b) ?? bondOrdersOf.set(bond.b, []).get(bond.b)!).push(bond.order);
  }

  let netCharge = 0;
  let hDonorCount = 0;
  let hAcceptorCount = 0;
  let lipoScore = 0;
  let aromaticAtomCount = 0;
  for (const atom of mol.atoms) {
    netCharge += atom.charge;
    if (atom.aromatic) aromaticAtomCount += 1;
    if (LIPOPHILIC.has(atom.symbol)) lipoScore += 1;
    else if (POLAR.has(atom.symbol)) lipoScore -= 1;
    if (POLAR.has(atom.symbol)) {
      hAcceptorCount += 1;
      const isBracketDonor = atom.explicitHydrogens !== null && atom.explicitHydrogens > 0;
      // Terminal (0 or 1 connection) and, if it has one, that connection is a single bond — a plausible -OH/-NH2-style group carrying implicit hydrogens.
      const orders = bondOrdersOf.get(atom.index) ?? [];
      const isTerminalSingleBonded = !atom.aromatic && orders.length <= 1 && (orders.length === 0 || orders[0] === 'SINGLE');
      if (isBracketDonor || (atom.explicitHydrogens === null && isTerminalSingleBonded)) hDonorCount += 1;
    }
  }

  const heavyAtomCount = mol.atoms.length;
  const hydrophobicityProxy = heavyAtomCount > 0 ? Math.max(-1, Math.min(1, lipoScore / heavyAtomCount)) : 0;
  const molecularExtentProxy = heavyAtomCount + mol.ringBondCount * 2;

  return { heavyAtomCount, ringBondCount: mol.ringBondCount, aromaticAtomCount, netCharge, hDonorCount, hAcceptorCount, hydrophobicityProxy, molecularExtentProxy };
}
