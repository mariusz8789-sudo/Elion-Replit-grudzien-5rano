/* Proprietary / All Rights Reserved - Genesis OS */
import { ELEMENT_BY_SYMBOL } from './data/elements.js';
import type { ReactionParticipant, ChemistryManifest, VerificationStatus } from './genesisChemistryTypes.js';

export const AVOGADRO = 6.02214076e23;

export class FormulaParseError extends Error {
  constructor(message: string, readonly position: number) {
    super(`FORMULA_PARSE_ERROR:${message}@${position}`);
    this.name = 'FormulaParseError';
  }
}

export interface ParsedFormula {
  readonly composition: Readonly<Record<string, number>>;
  readonly charge: number;
}

function mergeInto(target: Record<string, number>, source: Readonly<Record<string, number>>, multiplier = 1): void {
  for (const [symbol, count] of Object.entries(source)) {
    target[symbol] = (target[symbol] ?? 0) + count * multiplier;
  }
}

/**
 * Extract a terminal charge without confusing NH4+ with a hypothetical +4 charge.
 * Supported forms: +, -, ^2+, ^3-, 2+ (Fe3+ / [Fe(CN)6]4- style).
 */
function stripChargeSuffix(input: string): { body: string; charge: number } {
  const caret = /\^(\d+)?([+-])$/.exec(input);
  if (caret) {
    const magnitude = caret[1] ? Number.parseInt(caret[1], 10) : 1;
    return { body: input.slice(0, caret.index), charge: caret[2] === '-' ? -magnitude : magnitude };
  }

  const signOnly = /([+-])$/.exec(input);
  if (!signOnly) return { body: input, charge: 0 };
  const sign = signOnly[1] === '-' ? -1 : 1;
  const before = input.slice(0, -1);
  if (!before) throw new FormulaParseError('EMPTY_FORMULA', 0);

  // Fe3+, Al3+, Mg2+: the whole body before the sign is one element + digit charge.
  const monatomicCharge = /^([A-Z][a-z]?)(\d+)$/.exec(before);
  if (monatomicCharge && ELEMENT_BY_SYMBOL.has(monatomicCharge[1])) {
    return { body: monatomicCharge[1], charge: sign * Number.parseInt(monatomicCharge[2], 10) };
  }

  // [Fe(CN)6]4+, [Cu(NH3)4]2+: a closing group followed by a number is a charge.
  const groupedCharge = /([)\]])(\d+)$/.exec(before);
  if (groupedCharge) {
    return { body: before.slice(0, groupedCharge.index + 1), charge: sign * Number.parseInt(groupedCharge[2], 10) };
  }

  // NH4+, H3O+, etc. retain the digit as an atom count; only the sign is a charge.
  return { body: before, charge: sign };
}

/** Full deterministic chemistry-formula parser. */
export function parseFormulaV2(input: string): ParsedFormula {
  const trimmed = input.trim();
  if (!trimmed) throw new FormulaParseError('EMPTY_FORMULA', 0);
  if (trimmed === 'e-' || trimmed === 'e+') {
    return { composition: {}, charge: trimmed === 'e-' ? -1 : 1 };
  }

  const { body, charge } = stripChargeSuffix(trimmed);
  const segments = body.split(/[.·]/u);
  const composition: Record<string, number> = {};

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    if (!segment) throw new FormulaParseError('EMPTY_HYDRATE_SEGMENT', segmentIndex);

    let i = 0;
    let segmentMultiplier = 1;
    const leading = /^(\d+)/.exec(segment);
    if (leading) {
      segmentMultiplier = Number.parseInt(leading[1], 10);
      i = leading[1].length;
      if (segmentMultiplier <= 0) throw new FormulaParseError('NON_POSITIVE_MULTIPLIER', 0);
    }

    const parseSequence = (stop: string | null): { map: Record<string, number>; index: number } => {
      const map: Record<string, number> = {};
      while (i < segment.length) {
        const ch = segment[i];
        if (stop !== null && ch === stop) return { map, index: i };
        if (ch === ')' || ch === ']') {
          throw new FormulaParseError(`UNEXPECTED_CLOSE:${ch}`, i);
        }

        if (ch === '(' || ch === '[') {
          const open = ch;
          const close = open === '(' ? ')' : ']';
          i += 1;
          const inner = parseSequence(close);
          if (i >= segment.length || segment[i] !== close) {
            throw new FormulaParseError(`MISSING_CLOSE:${close}`, i);
          }
          i += 1;
          let digits = '';
          while (i < segment.length && /\d/u.test(segment[i])) {
            digits += segment[i];
            i += 1;
          }
          const multiplier = digits ? Number.parseInt(digits, 10) : 1;
          if (multiplier <= 0) throw new FormulaParseError('NON_POSITIVE_MULTIPLIER', i);
          mergeInto(map, inner.map, multiplier);
          continue;
        }

        const elementMatch = /^([A-Z][a-z]?)/.exec(segment.slice(i));
        if (!elementMatch) throw new FormulaParseError(`BAD_TOKEN:${ch}`, i);
        const symbol = elementMatch[1];
        if (!ELEMENT_BY_SYMBOL.has(symbol)) throw new FormulaParseError(`UNKNOWN_ELEMENT:${symbol}`, i);
        i += symbol.length;
        let digits = '';
        while (i < segment.length && /\d/u.test(segment[i])) {
          digits += segment[i];
          i += 1;
        }
        const count = digits ? Number.parseInt(digits, 10) : 1;
        if (count <= 0) throw new FormulaParseError('NON_POSITIVE_COUNT', i);
        map[symbol] = (map[symbol] ?? 0) + count;
      }
      if (stop !== null) throw new FormulaParseError(`MISSING_CLOSE:${stop}`, i);
      return { map, index: i };
    };

    const parsed = parseSequence(null);
    if (parsed.index !== segment.length) {
      throw new FormulaParseError(`UNCONSUMED:${segment.slice(parsed.index)}`, parsed.index);
    }
    mergeInto(composition, parsed.map, segmentMultiplier);
  }

  if (Object.keys(composition).length === 0) throw new FormulaParseError('EMPTY_COMPOSITION', 0);
  return { composition, charge };
}

/** Backward-compatible alias used by older callers. */
export const parseFormula = (formula: string): Record<string, number> => parseFormulaV2(formula).composition as Record<string, number>;

export function molarMassOf(composition: Readonly<Record<string, number>>): number {
  let mass = 0;
  for (const [symbol, count] of Object.entries(composition)) {
    const element = ELEMENT_BY_SYMBOL.get(symbol);
    if (!element) throw new Error(`UNKNOWN_ELEMENT:${symbol}`);
    mass += element.standardAtomicWeight * count;
  }
  return Number(mass.toFixed(3));
}

function normalizeOverrideComposition(participant: ReactionParticipant, override: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  const coefficient = participant.c ?? 1;
  if (coefficient <= 1) return override;
  try {
    const parsed = parseFormulaV2(participant.f).composition;
    const looksPreMultiplied = Object.keys(parsed).length === Object.keys(override).length && Object.entries(parsed).every(([symbol, count]) => override[symbol] === count * coefficient);
    if (looksPreMultiplied) {
      return Object.fromEntries(Object.entries(override).map(([symbol, count]) => [symbol, count / coefficient]));
    }
  } catch {
    // Some pseudo-species (for example e-) intentionally rely on compositionOverride.
  }
  return override;
}

function compositionOf(participant: ReactionParticipant, overrides?: Readonly<Record<string, Readonly<Record<string, number>>>>): Readonly<Record<string, number>> {
  const raw = participant.compositionOverride ?? overrides?.[participant.f];
  return raw ? normalizeOverrideComposition(participant, raw) : parseFormulaV2(participant.f).composition;
}

function chargeOf(participant: ReactionParticipant): number {
  if (participant.charge !== undefined) return participant.charge;
  return parseFormulaV2(participant.f).charge;
}

export function participantsComposition(
  participants: readonly ReactionParticipant[],
  overrides?: Readonly<Record<string, Readonly<Record<string, number>>>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const participant of participants) {
    for (const [symbol, count] of Object.entries(compositionOf(participant, overrides))) {
      out[symbol] = (out[symbol] ?? 0) + count * (participant.c ?? 1);
    }
  }
  return out;
}

/** Single authoritative reaction-balance implementation. */
export function balanceCheck(
  reactants: readonly ReactionParticipant[],
  products: readonly ReactionParticipant[],
  overrides?: Readonly<Record<string, Readonly<Record<string, number>>>>,
): { atomsOk: boolean; chargeOk: boolean; atomDiff: Record<string, number>; chargeDiff: number } {
  const left = participantsComposition(reactants, overrides);
  const right = participantsComposition(products, overrides);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const atomDiff: Record<string, number> = {};
  let atomsOk = true;

  for (const key of keys) {
    const delta = (left[key] ?? 0) - (right[key] ?? 0);
    atomDiff[key] = delta;
    if (delta !== 0) atomsOk = false;
  }

  const chargeDiff =
    reactants.reduce((sum, participant) => sum + chargeOf(participant) * (participant.c ?? 1), 0) -
    products.reduce((sum, participant) => sum + chargeOf(participant) * (participant.c ?? 1), 0);

  return { atomsOk, chargeOk: chargeDiff === 0, atomDiff, chargeDiff };
}

export function buildManifest(
  counts: Readonly<Record<string, number>>,
  sha256: Readonly<Record<string, string>>,
  verificationStatus: VerificationStatus = 'SOURCE_DECLARED_NOT_LIVE_VERIFIED',
): ChemistryManifest {
  return {
    package: 'genesis-chemistry-knowledge',
    version: '0.2.1',
    schemaVersion: '2.1',
    generatedBy: 'genesis-chemistry-v0.2.1-hardening',
    counts,
    sha256,
    verificationStatus,
  };
}
