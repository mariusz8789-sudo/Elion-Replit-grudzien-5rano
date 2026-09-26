import { REACTIONS, SPECIES } from '@genesis/core/lab/ThermodynamicLabEngine.js';
import { TITRATION_ACID_IDS } from '../../labs/experiments/chemistry-titration';
import type { ChemistryModelBinding, ChemistrySafetyClass } from './contracts';

/**
 * REACTION KNOWLEDGE LAYER (additive, governed, deliberately small).
 *
 * A reaction is known to Genesis only if an existing model actually computes
 * something about it:
 *   - THERMOCHEMISTRY: the reactions of @genesis/core ThermodynamicLabEngine
 *     (REACTIONS over NIST/CRC-rounded SPECIES data: ΔH, ΔS, ΔG),
 *   - WEAK_ACID_TITRATION: the four bounded scenarios of
 *     labs/experiments/chemistry-titration.ts (runTitrationScenario, also the
 *     backend `chemistry-titration` model).
 * Every record must also balance element by element; a record that does not
 * is reported in EXCLUDED_REACTIONS and can never be planned. Anything else
 * resolves to UNSUPPORTED_REACTION_MODEL — Genesis never invents products,
 * observations, thermodynamic values or safety behaviour for it.
 */

export interface ReactionParticipant {
  readonly formula: string;
  readonly coefficient: number;
  readonly phase: 's' | 'l' | 'g' | 'aq';
}

export type ReactionModelKind = 'THERMOCHEMISTRY' | 'WEAK_ACID_TITRATION';

export interface ReactionRecord {
  readonly reactionId: string;
  readonly title: string;
  readonly modelKind: ReactionModelKind;
  readonly reactants: readonly ReactionParticipant[];
  readonly products: readonly ReactionParticipant[];
  readonly balancedEquation: string;
  readonly stoichiometry: Readonly<Record<string, number>>;
  readonly conditions: string;
  readonly validity: { readonly temperatureK: readonly [number, number] | null; readonly pressure: string; readonly note: string };
  readonly solvent: string | null;
  readonly modelBinding: ChemistryModelBinding;
  /** What the bound model can actually say about this reaction. */
  readonly observationModel: string;
  readonly sources: readonly string[];
  readonly provenance: string;
  readonly safetyClass: ChemistrySafetyClass;
  readonly epistemicClassification: 'MODEL';
  readonly limitations: readonly string[];
  /** The canonical engine's own id (ThermodynamicLabEngine reaction id or titration acid id). */
  readonly canonicalRef: string;
}

export interface ExcludedReaction {
  readonly canonicalRef: string;
  readonly equation: string;
  readonly reason: string;
}

/* ---------------- element balance (the integrity gate) ---------------- */

const SUBSCRIPT: Readonly<Record<string, string>> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

/** "H₂O(l)" → "H2O"; strips phase suffixes and unicode subscripts. */
export function normalizeFormula(raw: string): string {
  return raw.replace(/[₀-₉]/g, (d) => SUBSCRIPT[d] ?? d).replace(/\((?:s|l|g|aq)\)$/i, '').replace(/\s+/g, '').trim();
}

/** Element counts of a simple formula with optional parenthesised groups. Throws on anything else. */
export function elementCounts(formula: string): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  const stack: Record<string, number>[] = [counts];
  const text = normalizeFormula(formula);
  let i = 0;
  const readNumber = (): number => {
    const m = /^\d+/.exec(text.slice(i));
    if (!m) return 1;
    i += m[0].length;
    return Number(m[0]);
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '(') {
      stack.push({});
      i += 1;
    } else if (ch === ')') {
      i += 1;
      const group = stack.pop();
      if (!group || stack.length === 0) throw new Error(`unbalanced parentheses in ${formula}`);
      const n = readNumber();
      const top = stack[stack.length - 1];
      for (const [el, c] of Object.entries(group)) top[el] = (top[el] ?? 0) + c * n;
    } else {
      const m = /^[A-Z][a-z]?/.exec(text.slice(i));
      if (!m) throw new Error(`unparseable formula ${formula}`);
      i += m[0].length;
      const n = readNumber();
      const top = stack[stack.length - 1];
      top[m[0]] = (top[m[0]] ?? 0) + n;
    }
  }
  if (stack.length !== 1) throw new Error(`unbalanced parentheses in ${formula}`);
  return counts;
}

/** Elements whose totals differ between the two sides (empty = balanced). */
export function elementImbalance(reactants: readonly ReactionParticipant[], products: readonly ReactionParticipant[]): readonly string[] {
  const total = (side: readonly ReactionParticipant[]) => {
    const acc: Record<string, number> = {};
    for (const p of side) for (const [el, c] of Object.entries(elementCounts(p.formula))) acc[el] = (acc[el] ?? 0) + c * p.coefficient;
    return acc;
  };
  const left = total(reactants);
  const right = total(products);
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].filter((el) => (left[el] ?? 0) !== (right[el] ?? 0)).sort();
}

function formatSide(side: readonly ReactionParticipant[]): string {
  return side.map((p) => `${p.coefficient === 1 ? '' : `${p.coefficient} `}${p.formula}(${p.phase})`).join(' + ');
}

/* ---------------- thermochemistry records (ThermodynamicLabEngine) ---------------- */

/**
 * Safety classes for the virtual lesson. Fail-closed: a reaction added to the
 * engine later without a class here is BLOCKED_HAZARDOUS until reviewed.
 */
const THERMO_SAFETY: Readonly<Record<string, ChemistrySafetyClass>> = {
  'R-HCL-NAOH': 'CLASSROOM_SAFE_MODEL',
  'R-C-O2': 'TEACHER_REVIEW',
  'R-CH4-O2': 'TEACHER_REVIEW',
  'R-CACO3': 'TEACHER_REVIEW',
  'R-H2-O2': 'BLOCKED_HAZARDOUS',
  'R-NA-CL2': 'BLOCKED_HAZARDOUS',
};

const THERMO_TITLES: Readonly<Record<string, string>> = {
  'R-HCL-NAOH': 'Zobojętnianie HCl zasadą sodową',
  'R-C-O2': 'Spalanie węgla',
  'R-CH4-O2': 'Spalanie metanu',
  'R-CACO3': 'Rozkład termiczny węglanu wapnia',
  'R-H2-O2': 'Synteza wody z wodoru i tlenu',
  'R-NA-CL2': 'Synteza chlorku sodu z pierwiastków',
};

const THERMO_BINDING: ChemistryModelBinding = {
  kind: 'LOCAL_CANONICAL_RUNNER',
  ref: '@genesis/core/lab/ThermodynamicLabEngine.ts: ThermodynamicLabEngine.thermo (REACTIONS, SPECIES)',
  version: 'packages/core lab engine',
};

function thermoParticipants(coeffs: Readonly<Record<string, number>>, sign: 1 | -1): ReactionParticipant[] {
  return Object.entries(coeffs)
    .filter(([, nu]) => nu * sign > 0)
    .map(([id, nu]) => {
      const species = SPECIES[id];
      return { formula: normalizeFormula(species.formula), coefficient: Math.abs(nu), phase: species.phase };
    });
}

/* ---------------- weak-acid titration records (chemistry-titration) ---------------- */

const TITRATION_ACIDS: Readonly<Record<string, { acid: string; salt: string; name: string; safety: ChemistrySafetyClass }>> = {
  acetic: { acid: 'CH3COOH', salt: 'CH3COONa', name: 'kwasu octowego', safety: 'CLASSROOM_SAFE_MODEL' },
  formic: { acid: 'HCOOH', salt: 'HCOONa', name: 'kwasu mrówkowego', safety: 'TEACHER_REVIEW' },
  benzoic: { acid: 'C6H5COOH', salt: 'C6H5COONa', name: 'kwasu benzoesowego', safety: 'TEACHER_REVIEW' },
  hcn: { acid: 'HCN', salt: 'NaCN', name: 'cyjanowodoru', safety: 'BLOCKED_HAZARDOUS' },
};

const TITRATION_BINDING: ChemistryModelBinding = {
  kind: 'LOCAL_CANONICAL_RUNNER',
  ref: 'labs/experiments/chemistry-titration.ts: runTitrationScenario → core/physics.ts: titrationPH',
  backendModelId: 'chemistry-titration',
  version: '1.1.0',
};

/* ---------------- assembly with the integrity gate ---------------- */

function build(): { records: ReactionRecord[]; excluded: ExcludedReaction[] } {
  const records: ReactionRecord[] = [];
  const excluded: ExcludedReaction[] = [];

  for (const reaction of REACTIONS) {
    const reactants = thermoParticipants(reaction.coeffs, -1);
    const products = thermoParticipants(reaction.coeffs, 1);
    const equation = `${formatSide(reactants)} → ${formatSide(products)}`;
    let imbalance: readonly string[];
    try {
      imbalance = elementImbalance(reactants, products);
    } catch (error) {
      excluded.push({ canonicalRef: reaction.id, equation, reason: `FORMULA_UNPARSEABLE: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    if (imbalance.length > 0) {
      excluded.push({
        canonicalRef: reaction.id,
        equation,
        reason: `ELEMENT_BALANCE_FAILED: ${imbalance.join(', ')} — the engine's species list does not close this equation, so its ΔH/ΔS/ΔG are not trustworthy and it is not offered.`,
      });
      continue;
    }
    records.push({
      reactionId: `thermo:${reaction.id}`,
      title: THERMO_TITLES[reaction.id] ?? reaction.label,
      modelKind: 'THERMOCHEMISTRY',
      reactants,
      products,
      balancedEquation: equation,
      stoichiometry: reaction.coeffs,
      conditions: 'Stan standardowy (298,15 K, 1 bar) — dane tablicowe ΔfH° i S°.',
      validity: { temperatureK: [298.15, 298.15], pressure: '1 bar', note: 'ΔG przy innej temperaturze liczone jako ΔH − TΔS przy założeniu ΔH, ΔS ≈ const.' },
      solvent: reactants.some((p) => p.phase === 'aq') ? 'woda (roztwór rozcieńczony)' : null,
      modelBinding: THERMO_BINDING,
      observationModel: 'Bilans energii: ΔH°, ΔS°, ΔG° (298,15 K) z tablicowych ΔfH° i S°; znak ΔH → egzo/endotermiczna, znak ΔG → samorzutna w warunkach standardowych.',
      sources: ['NIST Chemistry WebBook / CRC Handbook (wartości zaokrąglone w SPECIES)'],
      provenance: `ThermodynamicLabEngine REACTIONS["${reaction.id}"]`,
      safetyClass: THERMO_SAFETY[reaction.id] ?? 'BLOCKED_HAZARDOUS',
      epistemicClassification: 'MODEL',
      limitations: [
        'Termodynamika mówi, czy reakcja jest korzystna energetycznie, nie jak szybko zachodzi (kinetyka).',
        'Wartości tablicowe są zaokrąglone; brak poprawek na aktywność, stężenie i temperaturę poza stanem standardowym.',
      ],
      canonicalRef: reaction.id,
    });
  }

  for (const acidId of TITRATION_ACID_IDS) {
    const acid = TITRATION_ACIDS[acidId];
    if (!acid) {
      excluded.push({ canonicalRef: acidId, equation: '—', reason: 'NO_VERIFIED_FORMULA: the titration runner knows this acid, but no verified formula is registered for the reaction record.' });
      continue;
    }
    const reactants: ReactionParticipant[] = [{ formula: acid.acid, coefficient: 1, phase: 'aq' }, { formula: 'NaOH', coefficient: 1, phase: 'aq' }];
    const products: ReactionParticipant[] = [{ formula: acid.salt, coefficient: 1, phase: 'aq' }, { formula: 'H2O', coefficient: 1, phase: 'l' }];
    const equation = `${formatSide(reactants)} → ${formatSide(products)}`;
    const imbalance = elementImbalance(reactants, products);
    if (imbalance.length > 0) {
      excluded.push({ canonicalRef: acidId, equation, reason: `ELEMENT_BALANCE_FAILED: ${imbalance.join(', ')}` });
      continue;
    }
    records.push({
      reactionId: `titration:${acidId}`,
      title: `Miareczkowanie ${acid.name} zasadą sodową`,
      modelKind: 'WEAK_ACID_TITRATION',
      reactants,
      products,
      balancedEquation: equation,
      stoichiometry: { [acid.acid]: -1, NaOH: -1, [acid.salt]: 1, H2O: 1 },
      conditions: 'Ca = Cb = 0,1 mol/L, Va = 25 mL, 25 °C — ustalony scenariusz modelu.',
      validity: { temperatureK: [298.15, 298.15], pressure: '1 bar', note: 'Tylko 0 ≤ Vb ≤ 60 mL i jedna tablicowa Ka (CRC).' },
      solvent: 'woda',
      modelBinding: TITRATION_BINDING,
      observationModel: 'pH(Vb) z dokładnego bilansu ładunku słabego kwasu i NaOH z autodysocjacją wody; objętość równoważnikowa.',
      sources: ['CRC Handbook of Chemistry and Physics (Ka)', 'labs/experiments/chemistry-titration.ts'],
      provenance: `chemistry-titration scenario "${acidId}"`,
      safetyClass: acid.safety,
      epistemicClassification: 'MODEL',
      limitations: [
        'Brak aktywności jonowych, CO₂ z powietrza, zmiennej temperatury i niepewności pomiarowej.',
        'To krzywa modelowa, nie pomiar konkretnej próbki.',
      ],
      canonicalRef: acidId,
    });
  }
  return { records, excluded };
}

const BUILT = build();

export const REACTION_KNOWLEDGE: readonly ReactionRecord[] = BUILT.records;
export const EXCLUDED_REACTIONS: readonly ExcludedReaction[] = BUILT.excluded;

export function reactionById(reactionId: string): ReactionRecord | null {
  return REACTION_KNOWLEDGE.find((r) => r.reactionId === reactionId) ?? null;
}

export function thermochemistryReactions(): readonly ReactionRecord[] {
  return REACTION_KNOWLEDGE.filter((r) => r.modelKind === 'THERMOCHEMISTRY');
}

export function titrationReaction(acidId: string): ReactionRecord | null {
  return reactionById(`titration:${acidId}`);
}

export type ReactionLookup =
  | { readonly status: 'SUPPORTED'; readonly record: ReactionRecord }
  | { readonly status: 'UNSUPPORTED_REACTION_MODEL'; readonly reactants: readonly string[]; readonly reason: string };

const SPECIES_ALIASES: Readonly<Record<string, string>> = {
  'kwas octowy': 'CH3COOH', 'kwasu octowego': 'CH3COOH',
  'kwas mrówkowy': 'HCOOH', 'kwasu mrówkowego': 'HCOOH',
  'kwas benzoesowy': 'C6H5COOH', 'kwasu benzoesowego': 'C6H5COOH',
  'kwas solny': 'HCl', 'kwasu solnego': 'HCl',
  'wodorotlenek sodu': 'NaOH', 'wodorotlenku sodu': 'NaOH', 'zasada sodowa': 'NaOH', 'zasadą sodową': 'NaOH',
  'metan': 'CH4', 'wodór': 'H2', 'tlen': 'O2', 'chlor': 'Cl2', 'sód': 'Na', 'węgiel': 'C', 'węglan wapnia': 'CaCO3',
};

/** Splits "2 H2 + O2 → ..." (or "Na i Cl2") into normalized reactant formulas. */
export function reactantsFromText(text: string): readonly string[] {
  const left = text.split(/→|->|=>|=/)[0];
  return left
    .split(/\s\+\s|\+|\s+i\s+|\s+z\s+|\s+oraz\s+/)
    .map((part) => part.trim().toLocaleLowerCase('pl-PL') in SPECIES_ALIASES ? SPECIES_ALIASES[part.trim().toLocaleLowerCase('pl-PL')] : part.trim())
    .map((part) => normalizeFormula(part.replace(/^\d+\s*/, '')))
    .filter((part) => /^[A-Z(][A-Za-z0-9()]*$/.test(part));
}

/**
 * Exact match on the reactant set (phases ignored). No partial or "closest"
 * matching: a reaction Genesis has not modelled is unsupported, full stop.
 */
export function lookupReaction(reactantFormulas: readonly string[]): ReactionLookup {
  const wanted = [...new Set(reactantFormulas.map(normalizeFormula))].sort();
  const record = REACTION_KNOWLEDGE.find((r) => {
    const have = [...new Set(r.reactants.map((p) => p.formula))].sort();
    return have.length === wanted.length && have.every((f, i) => f === wanted[i]);
  });
  if (record) return { status: 'SUPPORTED', record };
  return {
    status: 'UNSUPPORTED_REACTION_MODEL',
    reactants: wanted,
    reason: wanted.length === 0
      ? 'Nie rozpoznano reagentów.'
      : `Genesis nie ma zweryfikowanego modelu reakcji ${wanted.join(' + ')}. Nie wymyślamy produktów, obserwacji, wartości termodynamicznych ani zachowania bezpieczeństwa.`,
  };
}
