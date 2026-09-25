import { ELEMENTS, type ElementInfo } from '../../data/elements';
import { PAULING_ELECTRONEGATIVITY } from '../../data/electronegativity';
import { PERIODIC_TRENDS, PERIODIC_TRENDS_MAX_Z } from '../../data/periodicTrends';

/**
 * A read-only view over the canonical element data. No property is added
 * unless an existing dataset backs it: electronegativity and trends are
 * `null` where data/electronegativity.ts or data/periodicTrends.ts has no
 * value, never an estimate.
 */
export type PeriodicBlock = 'MAIN_TABLE' | 'LANTHANIDE' | 'ACTINIDE';

export interface ChemistryElementView {
  readonly atomicNumber: number;
  readonly symbol: string;
  /** Polish name, as in data/elements.ts. */
  readonly name: string;
  /** Standard atomic weight, rounded as in data/elements.ts. */
  readonly atomicMass: number;
  /** Aufbau shell occupancy (a simplification: real configurations have exceptions, e.g. Cr, Cu). */
  readonly shells: readonly number[];
  readonly period: number;
  /** IUPAC group 1–18 for the main table; null for the separated f-block rows. */
  readonly group: number | null;
  readonly block: PeriodicBlock;
  /** 18-column display grid position, unchanged from data/elements.ts. */
  readonly gridColumn: number;
  readonly gridRow: number;
  readonly paulingElectronegativity: number | null;
  readonly atomicRadiusPm: number | null;
  readonly firstIonizationKJ: number | null;
}

function viewOf(element: ElementInfo): ChemistryElementView {
  const fBlockRow = element.row === 8 || element.row === 9;
  const trend = element.z <= PERIODIC_TRENDS_MAX_Z ? PERIODIC_TRENDS[element.z] : undefined;
  return {
    atomicNumber: element.z,
    symbol: element.symbol,
    name: element.name,
    atomicMass: element.mass,
    shells: element.shells,
    period: element.row === 8 ? 6 : element.row === 9 ? 7 : element.row,
    group: fBlockRow ? null : element.col,
    block: element.row === 8 ? 'LANTHANIDE' : element.row === 9 ? 'ACTINIDE' : 'MAIN_TABLE',
    gridColumn: element.col,
    gridRow: element.row,
    paulingElectronegativity: PAULING_ELECTRONEGATIVITY[element.symbol] ?? null,
    atomicRadiusPm: trend?.radiusPm ?? null,
    firstIonizationKJ: trend?.ionizationKJ ?? null,
  };
}

export const CHEMISTRY_PERIODIC_TABLE: readonly ChemistryElementView[] = ELEMENTS.map(viewOf);

export function chemistryElementBySymbol(symbol: string): ChemistryElementView | null {
  const normalized = symbol.trim().toLowerCase();
  return CHEMISTRY_PERIODIC_TABLE.find((element) => element.symbol.toLowerCase() === normalized) ?? null;
}

export function periodicTableCoverage(): { readonly count: number; readonly first: string; readonly last: string } {
  return { count: CHEMISTRY_PERIODIC_TABLE.length, first: CHEMISTRY_PERIODIC_TABLE[0]?.symbol ?? '', last: CHEMISTRY_PERIODIC_TABLE.at(-1)?.symbol ?? '' };
}

/**
 * Finds an element named in free Polish text by its name (nominative/accusative)
 * or by a two-letter symbol. One-letter symbols are only accepted when they are
 * the whole text: "W", "O", "U", "I" are also Polish words.
 */
export function findElementInText(text: string): ChemistryElementView | null {
  const trimmed = text.trim();
  if (trimmed.length <= 2) {
    const exact = chemistryElementBySymbol(trimmed);
    if (exact && exact.symbol === trimmed) return exact;
  }
  const lower = text.toLocaleLowerCase('pl-PL');
  const byName = [...CHEMISTRY_PERIODIC_TABLE]
    .sort((a, b) => b.name.length - a.name.length)
    .find((element) => new RegExp(`(^|[^\\p{L}])${element.name.toLocaleLowerCase('pl-PL')}([^\\p{L}]|$)`, 'u').test(lower));
  if (byName) return byName;
  for (const token of text.split(/[^A-Za-z]+/)) {
    if (token.length !== 2 || token[0] !== token[0].toUpperCase() || token[1] !== token[1].toLowerCase()) continue;
    const match = chemistryElementBySymbol(token);
    if (match) return match;
  }
  return null;
}

/** A bond written as two symbols joined by a dash, e.g. "Na-Cl", "H–F". */
export function bondPairInText(text: string): readonly [ChemistryElementView, ChemistryElementView] | null {
  const match = /(?:^|[^A-Za-z])([A-Z][a-z]?)\s*[-–—]\s*([A-Z][a-z]?)(?![A-Za-z])/.exec(text);
  if (!match) return null;
  const a = chemistryElementBySymbol(match[1]);
  const b = chemistryElementBySymbol(match[2]);
  return a && b && a.symbol === match[1] && b.symbol === match[2] ? [a, b] : null;
}
