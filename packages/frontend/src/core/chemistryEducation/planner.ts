import { validateProtocol, type ProtocolStepType } from '../lab/experimentProtocol';
import { parseScienceChatMessage } from '../experimentFabric/parser';
import { TITRATION_ACID_IDS } from '../../labs/experiments/chemistry-titration';
import { VSEPR_SHAPES } from '../../labs/experiments/chemistry-vsepr';
import { chemistryEducationExperimentById } from './catalog';
import { bondPairInText, chemistryElementBySymbol, findElementInText } from './periodicTable';
import { lookupReaction, reactantsFromText, reactionById, titrationReaction } from './reactionKnowledge';
import type {
  ChemistryExperimentId,
  ChemistryExperimentPlan,
  ChemistryParams,
  ChemistrySafetyClass,
} from './contracts';

/**
 * The planner decides BEFORE anything runs. It only ever returns READY for an
 * experiment in the governed catalog, with parameters the bound model accepts,
 * a safety class that permits the lesson, and a protocol that validates and
 * contains no physical actuation or instrument step.
 */

/** Step types that would drive a device or read a sensor. An educational lesson has neither. */
const PHYSICAL_STEP_TYPES: ReadonlySet<ProtocolStepType> = new Set(['MEASURE', 'SET_TARGET', 'MOVE', 'MIX', 'HEAT', 'COOL', 'SAMPLE', 'IMAGE']);

export interface PlanOptions {
  /** A teacher confirmed the lesson; required for TEACHER_REVIEW content. */
  readonly teacherApproved?: boolean;
}

function withDefaults(experimentId: ChemistryExperimentId, params: ChemistryParams): Record<string, string | number> {
  const template = chemistryEducationExperimentById(experimentId);
  const out: Record<string, string | number> = {};
  for (const spec of template?.parameters ?? []) out[spec.key] = params[spec.key] ?? spec.default;
  return out;
}

function blocked(experimentId: string, status: ChemistryExperimentPlan['status'], reason: string, extra: Partial<ChemistryExperimentPlan> = {}): ChemistryExperimentPlan {
  return { status, experimentId, reason, ...extra };
}

/** Parameter validation and per-parameter safety class; null class = invalid. */
function refine(experimentId: ChemistryExperimentId, p: Record<string, string | number>): { safetyClass: ChemistrySafetyClass; conceptOnly?: ChemistryExperimentPlan['conceptOnly'] } | { invalid: string; status?: ChemistryExperimentPlan['status'] } {
  switch (experimentId) {
    case 'acid-base-titration': {
      const acid = String(p.acid);
      if (!TITRATION_ACID_IDS.includes(acid)) return { invalid: `Model miareczkowania obsługuje tylko: ${TITRATION_ACID_IDS.join(', ')}.`, status: 'UNSUPPORTED_REACTION_MODEL' };
      const record = titrationReaction(acid);
      if (!record) return { invalid: `Brak zweryfikowanego rekordu reakcji dla kwasu ${acid}.`, status: 'UNSUPPORTED_REACTION_MODEL' };
      return {
        safetyClass: record.safetyClass,
        conceptOnly: { equation: record.balancedEquation, explanation: 'Pojęcie zobojętniania słabego kwasu można omówić na przykładzie kwasu octowego — bez procedury krok po kroku dla tej substancji.' },
      };
    }
    case 'vsepr-geometry':
      return VSEPR_SHAPES.some((s) => s.id === String(p.shapeId))
        ? { safetyClass: 'CLASSROOM_SAFE_MODEL' }
        : { invalid: `Nieznany typ VSEPR ${String(p.shapeId)}; model zna ${VSEPR_SHAPES.length} geometrii.` };
    case 'bond-polarity': {
      for (const key of ['elementA', 'elementB'] as const) {
        const element = chemistryElementBySymbol(String(p[key]));
        if (!element) return { invalid: `Nieznany pierwiastek ${String(p[key])}.` };
        if (element.paulingElectronegativity === null) {
          return { invalid: `${element.name} (${element.symbol}) nie ma ustalonej elektroujemności Paulinga w danych Genesis — model polarności nie może jej użyć.`, status: 'BLOCKED_MISSING_DATA' };
        }
      }
      return { safetyClass: 'CLASSROOM_SAFE_MODEL' };
    }
    case 'element-structure':
      return chemistryElementBySymbol(String(p.symbol)) ? { safetyClass: 'CLASSROOM_SAFE_MODEL' } : { invalid: `Nieznany pierwiastek ${String(p.symbol)}.` };
    case 'reaction-thermochemistry': {
      const record = reactionById(String(p.reactionId));
      if (!record || record.modelKind !== 'THERMOCHEMISTRY') return { invalid: `Reakcja ${String(p.reactionId)} nie ma zweryfikowanego modelu termochemicznego.`, status: 'UNSUPPORTED_REACTION_MODEL' };
      return {
        safetyClass: record.safetyClass,
        conceptOnly: { equation: record.balancedEquation, explanation: 'Można omówić równanie i to, że reakcja jest silnie egzotermiczna — bez żadnych wskazówek wykonania.' },
      };
    }
    case 'arrhenius-kinetics': {
      const t = Number(p.temperatureK);
      const ea = Number(p.activationEnergyKJ);
      if (!Number.isFinite(t) || t < 200 || t > 990) return { invalid: 'Temperatura musi mieścić się w 200–990 K (model przyjmuje do 1000 K, a lekcja liczy też T + 10 K).' };
      if (!Number.isFinite(ea) || ea < 0 || ea > 300) return { invalid: 'Energia aktywacji musi mieścić się w 0–300 kJ/mol.' };
      return { safetyClass: 'CLASSROOM_SAFE_MODEL' };
    }
    default:
      return { invalid: 'Nieznany eksperyment.' };
  }
}

export function planChemistryExperiment(experimentId: string, params: ChemistryParams = {}, options: PlanOptions = {}): ChemistryExperimentPlan {
  const template = chemistryEducationExperimentById(experimentId);
  if (!template) return blocked(experimentId, 'UNKNOWN_EXPERIMENT', 'Ten eksperyment nie istnieje w zatwierdzonym katalogu Chemistry Live Lab.');

  const validation = validateProtocol(template.protocol);
  if (!validation.valid) return blocked(experimentId, 'BLOCKED_INVALID_PARAMETERS', `Protokół nie przeszedł walidacji: ${validation.errors.join(', ')}`);
  const physical = template.protocol.steps.filter((step) => PHYSICAL_STEP_TYPES.has(step.type) || step.deviceId !== undefined);
  if (physical.length > 0 || template.protocol.devices.length > 0) {
    return blocked(experimentId, 'BLOCKED_PHYSICAL_ACTUATION', `Lekcja nie może sterować urządzeniem ani czytać czujnika (kroki: ${physical.map((s) => s.stepId).join(', ') || 'urządzenia zadeklarowane'}).`);
  }

  const resolved = withDefaults(template.experimentId, params);
  const refined = refine(template.experimentId, resolved);
  if ('invalid' in refined) return blocked(experimentId, refined.status ?? 'BLOCKED_INVALID_PARAMETERS', refined.invalid, { template, params: resolved });

  if (refined.safetyClass === 'BLOCKED_HAZARDOUS') {
    return blocked(experimentId, 'BLOCKED_HAZARDOUS', 'Ta substancja lub reakcja jest niebezpieczna. Genesis nie pokazuje dla niej procedury krok po kroku ani wskazówek wykonania.', {
      template, params: resolved, safetyClass: refined.safetyClass, conceptOnly: refined.conceptOnly,
    });
  }
  if (refined.safetyClass === 'TEACHER_REVIEW' && !options.teacherApproved) {
    return blocked(experimentId, 'REQUIRES_TEACHER_REVIEW', 'Ta lekcja wymaga potwierdzenia przez nauczyciela przed uruchomieniem modelu procedury.', {
      template, params: resolved, safetyClass: refined.safetyClass,
    });
  }
  return { status: 'READY', experimentId: template.experimentId, template, params: resolved, safetyClass: refined.safetyClass };
}

/* ---------------- natural-language routing ---------------- */

export interface ChemistryPromptRoute {
  readonly status: 'ROUTED' | 'UNSUPPORTED_REACTION_MODEL' | 'NO_SUPPORTED_MODEL';
  readonly experimentId?: ChemistryExperimentId;
  readonly params?: ChemistryParams;
  readonly reason: string;
}

const ACID_WORDS: readonly { pattern: RegExp; acid: string }[] = [
  { pattern: /octow|ch3cooh|ch₃cooh/, acid: 'acetic' },
  { pattern: /mrówkow|mrowkow|hcooh/, acid: 'formic' },
  { pattern: /benzoes|c6h5cooh/, acid: 'benzoic' },
  { pattern: /cyjanowodor|\bhcn\b/, acid: 'hcn' },
];
/** Acids the titration model does NOT cover; naming one must not silently fall back to acetic acid. */
const UNMODELLED_ACIDS = /solnego|solny|\bhcl\b|siarkow|h2so4|azotow|hno3|fosforow|h3po4|węglow|weglow|cytrynow|szczawiow/;

function shapeFromText(lower: string): string | null {
  const normalized = lower.replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d)));
  for (const shape of VSEPR_SHAPES) {
    const example = shape.example.toLocaleLowerCase('pl-PL').replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d)));
    if (new RegExp(`(^|[^a-z0-9])${example.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(normalized)) return shape.id;
  }
  return null;
}

/**
 * Deterministic prompt → supported lesson. Reuses the canonical chat parser
 * (experimentFabric/parser.ts) for the model families it already recognises
 * and adds only what it lacks (bond pairs, element cards, reaction lookup).
 * No LLM: an unrecognised reaction is refused, never completed.
 */
export function routeChemistryPrompt(text: string): ChemistryPromptRoute {
  const lower = text.toLocaleLowerCase('pl-PL');

  // 1. An explicit reaction ("A + B", "A → B") goes to the Reaction Knowledge Layer and nowhere else.
  if (/\+|→|->/.test(text)) {
    const lookup = lookupReaction(reactantsFromText(text));
    if (lookup.status !== 'SUPPORTED') return { status: 'UNSUPPORTED_REACTION_MODEL', reason: lookup.reason };
    const record = lookup.record;
    return record.modelKind === 'THERMOCHEMISTRY'
      ? { status: 'ROUTED', experimentId: 'reaction-thermochemistry', params: { reactionId: record.reactionId }, reason: `Reakcja z warstwy wiedzy: ${record.balancedEquation}` }
      : { status: 'ROUTED', experimentId: 'acid-base-titration', params: { acid: record.canonicalRef }, reason: `Reakcja z warstwy wiedzy: ${record.balancedEquation}` };
  }

  // 2. Bond polarity ("polarność wiązania Na-Cl").
  if (/polarn|elektroujemn/.test(lower)) {
    const pair = bondPairInText(text);
    return pair
      ? { status: 'ROUTED', experimentId: 'bond-polarity', params: { elementA: pair[0].symbol, elementB: pair[1].symbol }, reason: `Polarność wiązania ${pair[0].symbol}–${pair[1].symbol}.` }
      : { status: 'ROUTED', experimentId: 'bond-polarity', params: {}, reason: 'Polarność wiązania — wybierz dwa pierwiastki.' };
  }

  // 3. Model families the canonical chat parser already recognises.
  const parsed = parseScienceChatMessage(text);
  if (parsed.modelId === 'chemistry-titration') {
    if (UNMODELLED_ACIDS.test(lower)) {
      return { status: 'UNSUPPORTED_REACTION_MODEL', reason: 'Model miareczkowania obejmuje tylko słabe kwasy: octowy, mrówkowy, benzoesowy i cyjanowodór. Dla tego kwasu nie ma zweryfikowanej krzywej miareczkowania.' };
    }
    const acid = ACID_WORDS.find((a) => a.pattern.test(lower))?.acid ?? 'acetic';
    return { status: 'ROUTED', experimentId: 'acid-base-titration', params: { acid }, reason: 'Miareczkowanie słabego kwasu NaOH (model bilansu ładunku).' };
  }
  if (parsed.modelId === 'chem-vsepr') {
    return { status: 'ROUTED', experimentId: 'vsepr-geometry', params: { shapeId: shapeFromText(lower) ?? 'ax4' }, reason: 'Geometria VSEPR.' };
  }
  if (parsed.modelId === 'chemistry-arrhenius') {
    return { status: 'ROUTED', experimentId: 'arrhenius-kinetics', params: {}, reason: 'Kinetyka Arrheniusa — obliczenie na backendzie.' };
  }

  // 4. An element and its place in the periodic table.
  if (/układ|uklad|okresow|pierwiast|budow|atom|powłok|powlok/.test(lower)) {
    const element = findElementInText(text);
    if (element) return { status: 'ROUTED', experimentId: 'element-structure', params: { symbol: element.symbol }, reason: `${element.name} (${element.symbol}) w układzie okresowym.` };
  }

  // 5. "reakcja X z Y" without a formula — only a known record may answer.
  if (/reakcj|reaguj/.test(lower)) {
    return { status: 'UNSUPPORTED_REACTION_MODEL', reason: 'Nie rozpoznano zweryfikowanej reakcji. Wpisz reagenty wzorami (np. „HCl + NaOH”) — Genesis pokaże tylko reakcje, dla których ma model.' };
  }
  return { status: 'NO_SUPPORTED_MODEL', reason: 'Genesis nie ma w Chemistry Live Lab modelu dla tego polecenia.' };
}
