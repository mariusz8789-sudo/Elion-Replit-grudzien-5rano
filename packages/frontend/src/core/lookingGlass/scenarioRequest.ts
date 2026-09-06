import { fnv1a } from '../events/hash';
import type { WorldCameraMode } from '../world/cameraPolicy';

/**
 * LOOKING GLASS — NATURAL LANGUAGE → STRUCTURED SCENARIO REQUEST.
 *
 * The entry point of the Looking Glass: it turns a sentence a person typed
 * into a structure the rest of Genesis can act on. It is deliberately
 * DOMAIN-AGNOSTIC. A flood, an epidemic, a bioreactor culture and a city
 * changing over decades are all the same shape of request here — a family,
 * a subject, a place, a stretch of time, and a point of view — because the
 * Looking Glass is one experience layer with domain adapters underneath it,
 * not five viewers wearing a shared name.
 *
 * WHAT IT IS NOT. It does not understand science, does not decide whether a
 * scenario is answerable, and does not invent a model. It reads INTENT.
 * Whether Genesis can actually run the thing is a separate, later decision
 * made by `scenarioResolution.ts`, which is allowed to answer NOT_MODELLED
 * — and, for one specific class of request, REFUSED.
 *
 * WHY A DETERMINISTIC GRAMMAR AND NOT A MODEL CALL. A parse that changed
 * between two runs of the same sentence would break every guarantee
 * downstream: the request id is a hash of the text, the shot plan derives
 * from the request, and replay compares runs by fingerprint. A probabilistic
 * parser would silently produce two different worlds from one sentence. It
 * also could not be honest about failure the way this one is: it reports
 * every aspect it could NOT resolve, by name, instead of guessing and being
 * confidently wrong. An unrecognised sentence yields an empty family and a
 * populated `unresolved` list — never a plausible-looking default.
 */

/**
 * The classes of scenario the Looking Glass can express. A family here is a
 * claim about VOCABULARY only — that the parser can recognise these words.
 * Whether Genesis simulates them is `scenarioResolution.ts`'s answer, and
 * for most of these today it is honestly "not yet".
 */
export const SCENARIO_FAMILIES = [
  'NATURAL_HAZARD',
  'EPIDEMIOLOGICAL',
  'INDUSTRIAL_ENVIRONMENTAL',
  'TRANSPORT',
  'CIVIL_PROTECTION',
  'LABORATORY',
  'MOLECULAR',
  'URBAN_CHANGE',
] as const;
export type ScenarioFamily = (typeof SCENARIO_FAMILIES)[number];

/** The specific event within a family, when the sentence names one. */
export type ScenarioKind =
  | 'FLOOD' | 'EARTHQUAKE' | 'TSUNAMI' | 'HURRICANE' | 'TORNADO' | 'WILDFIRE'
  | 'LANDSLIDE' | 'VOLCANIC' | 'DROUGHT' | 'EXTREME_HEAT' | 'AVALANCHE'
  | 'EPIDEMIC' | 'WATERBORNE_OUTBREAK' | 'BIOLOGICAL_CONTAMINATION' | 'QUARANTINE'
  | 'INDUSTRIAL_ACCIDENT' | 'CHEMICAL_RELEASE' | 'WATER_CONTAMINATION'
  | 'BLACKOUT' | 'INFRASTRUCTURE_FAILURE' | 'INDUSTRIAL_FIRE'
  | 'AVIATION_INCIDENT' | 'TRANSPORT_DISRUPTION'
  | 'EVACUATION' | 'EXPLOSION_CONSEQUENCE' | 'RADIOLOGICAL_CONTAMINATION' | 'COMMUNICATIONS_DISRUPTION'
  | 'LAB_EXPERIMENT' | 'CELL_CULTURE' | 'CHEMICAL_REACTION' | 'PARTICLE_SYSTEM'
  | 'URBAN_TRANSFORMATION';

export type TemporalUnit = 'HOUR' | 'DAY' | 'YEAR';

export interface TemporalSpan {
  readonly amount: number;
  readonly unit: TemporalUnit;
  /** The exact substring this was read from, so the UI can show its work. */
  readonly sourceText: string;
}

/**
 * How the user wants to BE in the scenario. `ANCHORED_HUMAN` is the
 * distinctive one: the viewer stays in a fixed human position while time
 * moves around them — a person on a bench, someone standing near a coast.
 * It is a viewpoint, not a camera path, which is why it lives here and not
 * in the sequencer.
 */
export type ViewpointKind =
  | 'ANCHORED_HUMAN' | 'SCIENTIST_POV' | 'OPERATOR_POV' | 'RESPONDER_POV'
  | 'OBSERVER' | 'WIDE' | 'MACRO';

export interface Viewpoint {
  readonly kind: ViewpointKind;
  /** The user's own words for where they are ("bench", "coast"), or null. */
  readonly anchorHint: string | null;
  /** The existing camera vocabulary — this module adds no second enum. */
  readonly cameraMode: WorldCameraMode;
}

/**
 * THE PRODUCT SAFETY BOUNDARY, made explicit in the type system.
 *
 * Genesis models the CONSEQUENCES of catastrophic events, because that is
 * what civil protection, emergency planning and public health need: where
 * the water reaches, who must be evacuated, which infrastructure fails, how
 * responders should be positioned. That work is legitimate and it saves
 * lives, and it is the whole reason the hazard families exist here.
 *
 * It is not the same activity as designing, building, optimising or
 * targeting a weapon, and the difference is not a matter of tone. A request
 * to model fallout over a city so people can be evacuated and a request to
 * improve a device's yield are different requests, and only the first is one
 * Genesis will structure. `WEAPON_DEVELOPMENT` is therefore carried on the
 * request itself and refused in resolution — not filtered quietly, so a
 * user sees a clear answer rather than a mysteriously empty result.
 */
export type SafetyClass =
  /** Consequences, exposure, evacuation, response. Proceeds normally. */
  | 'CONSEQUENCE_MODELLING'
  /** Construction, synthesis, optimisation, targeting, lethality. Refused. */
  | 'WEAPON_DEVELOPMENT';

export type UnresolvedAspect = 'FAMILY' | 'SUBJECT' | 'TIME_SPAN' | 'VIEWPOINT' | 'LOCATION';

export interface StructuredScenarioRequest {
  /** Deterministic: the same sentence always produces the same id. */
  readonly requestId: string;
  readonly sourceText: string;
  readonly family: ScenarioFamily | null;
  readonly kind: ScenarioKind | null;
  /** What the sentence is about, in the user's own words — never normalised
   * into a scientific claim. */
  readonly subject: string | null;
  /** Where, as the user said it ("this city", "the coast"), or null. */
  readonly location: string | null;
  readonly span: TemporalSpan | null;
  readonly viewpoint: Viewpoint;
  readonly safety: SafetyClass;
  /** Which words triggered a WEAPON_DEVELOPMENT classification, so a refusal
   * can explain itself instead of being unexplained. */
  readonly safetySignals: readonly string[];
  readonly comparison: boolean;
  readonly cinematic: boolean;
  /**
   * Everything this parser could not read out of the sentence. Empty means
   * fully resolved. A caller must treat a non-empty list as "ask the user",
   * never as "fill in a sensible default".
   */
  readonly unresolved: readonly UnresolvedAspect[];
}

/** Kind vocabulary. Polish and English stems both, since the product is bilingual. */
const KIND_KEYWORDS: Readonly<Record<ScenarioKind, readonly string[]>> = {
  FLOOD: ['flood', 'powód', 'powodz', 'zalan', 'inundation', 'high water'],
  EARTHQUAKE: ['earthquake', 'trzęsien', 'trzesien', 'seismic', 'sejsmic', 'aftershock', 'wstrząs'],
  TSUNAMI: ['tsunami', 'tidal wave'],
  HURRICANE: ['hurricane', 'huragan', 'cyclone', 'cyklon', 'typhoon'],
  TORNADO: ['tornado', 'trąba powietrzna', 'traba powietrzna'],
  WILDFIRE: ['wildfire', 'pożar lasu', 'pozar lasu', 'bushfire', 'forest fire'],
  LANDSLIDE: ['landslide', 'osuwisk', 'mudslide', 'rockfall'],
  VOLCANIC: ['volcan', 'wulkan', 'erupcj', 'eruption', 'lava', 'lawa'],
  DROUGHT: ['drought', 'susz'],
  EXTREME_HEAT: ['extreme heat', 'heatwave', 'upał', 'upal', 'fala upał'],
  AVALANCHE: ['avalanche', 'lawin'],
  EPIDEMIC: ['epidemic', 'epidemi', 'pandemic', 'pandemi', 'outbreak', 'infection', 'infekcj', 'disease spread', 'contagion', 'zaraz'],
  WATERBORNE_OUTBREAK: ['waterborne', 'ognisko wodne', 'cholera'],
  BIOLOGICAL_CONTAMINATION: ['biological contamination', 'skażenie biologiczne', 'skazenie biologiczne', 'pathogen release'],
  QUARANTINE: ['quarantine', 'kwarantann', 'isolation zone', 'lockdown'],
  INDUSTRIAL_ACCIDENT: ['industrial accident', 'awaria zakład', 'awaria zaklad', 'plant failure', 'wypadek przemysłow', 'incydent przemysłow'],
  CHEMICAL_RELEASE: ['chemical leak', 'chemical release', 'wyciek chemiczn', 'toxic release', 'gas leak'],
  WATER_CONTAMINATION: ['water contamination', 'skażenie wody', 'skazenie wody', 'skażenie wodociąg', 'contaminated water', 'wodociąg'],
  BLACKOUT: ['blackout', 'power outage', 'zanik zasilania', 'awaria sieci energ'],
  INFRASTRUCTURE_FAILURE: ['infrastructure failure', 'awaria infrastruktur', 'bridge collapse', 'grid failure', 'awaria sieci'],
  INDUSTRIAL_FIRE: ['industrial fire', 'pożar przemysłow', 'pozar przemyslow', 'refinery fire'],
  AVIATION_INCIDENT: ['aviation', 'aircraft', 'wypadek lotnicz', 'katastrofa lotnicz', 'airport closure', 'zamknięcie lotnisk'],
  TRANSPORT_DISRUPTION: ['transport disruption', 'awaria transport', 'zakłócenie transport', 'rail failure', 'traffic collapse'],
  EVACUATION: ['evacuation', 'ewakuacj', 'shelter in place', 'schron'],
  EXPLOSION_CONSEQUENCE: ['explosion', 'eksplozj', 'wybuch', 'blast', 'air raid', 'nalot', 'bombardowan', 'strike on'],
  RADIOLOGICAL_CONTAMINATION: ['radiological', 'radiolog', 'nuclear contamination', 'skażenie radiolog', 'skazenie radiolog', 'fallout', 'opad radioaktywn', 'nuclear', 'jądrow', 'jadrow'],
  COMMUNICATIONS_DISRUPTION: ['communications disruption', 'zakłócenie komunikac', 'network outage', 'łączność'],
  LAB_EXPERIMENT: ['laboratory', 'laboratorium', 'experiment', 'eksperyment', 'lab bench', 'apparatus', 'aparatur'],
  CELL_CULTURE: ['cell', 'komórk', 'komork', 'bioreactor', 'bioreaktor', 'culture', 'hodowl', 'bacteria', 'bakteri', 'colony', 'koloni', 'tissue', 'tkank'],
  CHEMICAL_REACTION: ['reaction', 'reakcj', 'molecule', 'cząsteczk', 'czasteczk', 'molekuł', 'compound', 'związek chem', 'catalyst', 'kataliz'],
  PARTICLE_SYSTEM: ['particle', 'cząstk', 'czastk', 'quantum', 'kwant', 'ising', 'spin', 'lattice'],
  URBAN_TRANSFORMATION: ['city change', 'urban transformation', 'zmiana miasta', 'city over', 'miasto przez', 'city grow', 'rozwój miasta'],
};

const KIND_FAMILY: Readonly<Record<ScenarioKind, ScenarioFamily>> = {
  FLOOD: 'NATURAL_HAZARD', EARTHQUAKE: 'NATURAL_HAZARD', TSUNAMI: 'NATURAL_HAZARD',
  HURRICANE: 'NATURAL_HAZARD', TORNADO: 'NATURAL_HAZARD', WILDFIRE: 'NATURAL_HAZARD',
  LANDSLIDE: 'NATURAL_HAZARD', VOLCANIC: 'NATURAL_HAZARD', DROUGHT: 'NATURAL_HAZARD',
  EXTREME_HEAT: 'NATURAL_HAZARD', AVALANCHE: 'NATURAL_HAZARD',
  EPIDEMIC: 'EPIDEMIOLOGICAL', WATERBORNE_OUTBREAK: 'EPIDEMIOLOGICAL',
  BIOLOGICAL_CONTAMINATION: 'EPIDEMIOLOGICAL', QUARANTINE: 'EPIDEMIOLOGICAL',
  INDUSTRIAL_ACCIDENT: 'INDUSTRIAL_ENVIRONMENTAL', CHEMICAL_RELEASE: 'INDUSTRIAL_ENVIRONMENTAL',
  WATER_CONTAMINATION: 'INDUSTRIAL_ENVIRONMENTAL', BLACKOUT: 'INDUSTRIAL_ENVIRONMENTAL',
  INFRASTRUCTURE_FAILURE: 'INDUSTRIAL_ENVIRONMENTAL', INDUSTRIAL_FIRE: 'INDUSTRIAL_ENVIRONMENTAL',
  AVIATION_INCIDENT: 'TRANSPORT', TRANSPORT_DISRUPTION: 'TRANSPORT',
  EVACUATION: 'CIVIL_PROTECTION', EXPLOSION_CONSEQUENCE: 'CIVIL_PROTECTION',
  RADIOLOGICAL_CONTAMINATION: 'CIVIL_PROTECTION', COMMUNICATIONS_DISRUPTION: 'CIVIL_PROTECTION',
  LAB_EXPERIMENT: 'LABORATORY', CELL_CULTURE: 'LABORATORY',
  CHEMICAL_REACTION: 'MOLECULAR', PARTICLE_SYSTEM: 'MOLECULAR',
  URBAN_TRANSFORMATION: 'URBAN_CHANGE',
};

/**
 * Phrases that mean "help me build/improve a weapon" rather than "show me
 * what a weapon would do to a population". The distinction is intent toward
 * the DEVICE versus intent toward the CONSEQUENCES, so these are all verbs
 * and objectives about making something work better, never nouns about an
 * event having happened.
 */
const WEAPON_DEVELOPMENT_PATTERNS: readonly { readonly pattern: RegExp; readonly signal: string }[] = [
  { pattern: /\b(design|build|construct|assemble|manufactur|fabricat|zbuduj|skonstruuj|zaprojektuj)\w*\s+(a\s+|an\s+|the\s+)?(weapon|bomb|warhead|device|agent|broń|bron|bomb[ęy])/i, signal: 'building a weapon or device' },
  { pattern: /\b(weaponi[sz]|militari[sz]|uzbroj)\w*/i, signal: 'weaponisation' },
  { pattern: /\b(maximi[sz]e|increase|improve|optimi[sz]e|enhance|zwiększ|maksymalizuj|optymalizuj)\w*\s+(the\s+)?(yield|lethality|casualt|damage|effectiveness|potency|blast|kill|śmiertelno|skuteczność broni)/i, signal: 'maximising lethality or yield' },
  { pattern: /\b(enrich|enrichment|wzbogacan)\w*\s*(uranium|plutonium|uranu|plutonu)?/i, signal: 'fissile material enrichment' },
  { pattern: /\b(synthesi[sz]e|culture|cultivate|zsyntetyzuj|wyhoduj)\w*\s+(a\s+|the\s+)?(pathogen|agent|toxin|nerve agent|patogen|toksyn)/i, signal: 'synthesising a harmful agent' },
  { pattern: /\b(target|targeting|aim|celuj|namierz)\w*\s+(the\s+|a\s+)?(most|maximum|optimal|najwięcej|najskuteczniej)/i, signal: 'target selection for maximum effect' },
  { pattern: /\b(best|optimal|most effective|najlepsz|najskuteczniejsz)\w*\s+(place|spot|location|time|miejsce|moment)\s+to\s+(detonate|release|attack|deploy|zdetonow|uwolni)/i, signal: 'optimising an attack' },
];

const VIEWPOINT_MODE: Readonly<Record<ViewpointKind, WorldCameraMode>> = {
  ANCHORED_HUMAN: 'HUMAN_EYE',
  SCIENTIST_POV: 'HUMAN_EYE',
  OPERATOR_POV: 'HUMAN_EYE',
  RESPONDER_POV: 'HUMAN_EYE',
  OBSERVER: 'CINEMATIC',
  WIDE: 'WIDE',
  MACRO: 'MACRO',
};

const ANCHOR_PHRASES: readonly { readonly pattern: RegExp; readonly hint: string }[] = [
  { pattern: /\b(bench|ławce|ławki|ławka|lawce)\b/i, hint: 'bench' },
  { pattern: /\b(chair|krześle|krzesle|fotelu)\b/i, hint: 'chair' },
  { pattern: /\b(coast|shore|beach|wybrzeż|wybrzez|brzegu|plaż)\w*/i, hint: 'coast' },
  { pattern: /\b(street level|street|ulicy|ulicę|ulice|chodniku)\b/i, hint: 'street' },
  { pattern: /\b(window|oknie|okna)\b/i, hint: 'window' },
  { pattern: /\b(rooftop|dachu|balcony|balkonie)\b/i, hint: 'rooftop' },
  { pattern: /\b(room|pokoju|sali|hali|laboratorium)\b/i, hint: 'room' },
];

const SCIENTIST_PHRASES = /\b(scientist|naukow|researcher|badacz|chemist|chemik|biolog|physicist|fizyk)\w*/i;
const OPERATOR_PHRASES = /\b(operator|dispatcher|control room|dyspozytor|centrum sterowania)\w*/i;
const RESPONDER_PHRASES = /\b(responder|rescuer|paramedic|firefighter|ratownik|straż|straz|służby ratunkow)\w*/i;
const SITTING_PHRASES = /\b(sitting|siedz|standing|stoj|stays in|remains|pozostaje|anchored)\w*/i;
const HUMAN_PHRASES = /\b(person|człowiek|czlowiek|human|citizen|resident|mieszkan|passer|przechodni|perspective of a|perspektywy)\w*/i;
const WIDE_PHRASES = /\b(wide|whole city|entire|overview|z góry|całe miasto|from above|aerial|z lotu ptaka)\w*/i;
const MACRO_PHRASES = /\b(close-?up|macro|zbliżen|zblizen|detail|szczegół|microscop|mikroskop)\w*/i;
const COMPARISON_PHRASES = /\b(compare|comparison|versus|vs\.?|against|porówn|porown|zestaw|counterfactual|co by było)\w*/i;
const CINEMATIC_PHRASES = /\b(cinematic|film|movie|sequence|montage|sekwencj|kinow|trailer|dokument)\w*/i;

const UNIT_PATTERNS: readonly { readonly pattern: RegExp; readonly unit: TemporalUnit }[] = [
  { pattern: /(\d+)\s*(years?|lat|lata|roku|rok)\b/i, unit: 'YEAR' },
  { pattern: /(\d+)\s*(days?|dni|dzień|dzien|doby|dób|dob)\b/i, unit: 'DAY' },
  { pattern: /(\d+)\s*(hours?|godzin|godz)\w*/i, unit: 'HOUR' },
];

const YEAR_RANGE = /\b(19\d{2}|2\d{3})\s*(?:-|–|to|until|do|→)\s*(19\d{2}|2\d{3})\b/i;

const LOCATION_PATTERNS: readonly RegExp[] = [
  /\b((?:this|the|that)\s+(?:city|town|region|coast|district|area|valley|miasto|mieście|miescie|regionie|wybrzeżu))\b/i,
  /\b(w\s+tym\s+mieście|w\s+tym\s+miescie|in\s+this\s+city)\b/i,
];

function detectKind(text: string): ScenarioKind | null {
  let best: { kind: ScenarioKind; index: number } | null = null;
  for (const kind of Object.keys(KIND_KEYWORDS) as ScenarioKind[]) {
    for (const keyword of KIND_KEYWORDS[kind]) {
      const index = text.indexOf(keyword);
      if (index === -1) continue;
      // Earliest mention wins: reading left to right is the only ordering
      // rule a reader can predict without knowing the keyword table.
      if (!best || index < best.index) best = { kind, index };
    }
  }
  return best?.kind ?? null;
}

function detectSpan(text: string): TemporalSpan | null {
  const range = YEAR_RANGE.exec(text);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (to > from) return { amount: to - from, unit: 'YEAR', sourceText: range[0] };
  }
  for (const { pattern, unit } of UNIT_PATTERNS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const amount = Number(match[1]);
    if (Number.isFinite(amount) && amount > 0) return { amount, unit, sourceText: match[0] };
  }
  return null;
}

function detectViewpoint(text: string): { viewpoint: Viewpoint; resolved: boolean } {
  const anchor = ANCHOR_PHRASES.find((candidate) => candidate.pattern.test(text)) ?? null;
  const make = (kind: ViewpointKind, hint: string | null): { viewpoint: Viewpoint; resolved: boolean } => ({
    viewpoint: { kind, anchorHint: hint, cameraMode: VIEWPOINT_MODE[kind] }, resolved: true,
  });

  // Named professional roles beat a generic human: each has a genuinely
  // different presentation (PPE and instruments; a console; a response unit).
  if (SCIENTIST_PHRASES.test(text)) return make('SCIENTIST_POV', anchor?.hint ?? 'room');
  if (RESPONDER_PHRASES.test(text)) return make('RESPONDER_POV', anchor?.hint ?? null);
  if (OPERATOR_PHRASES.test(text)) return make('OPERATOR_POV', anchor?.hint ?? 'room');

  const anchored = SITTING_PHRASES.test(text) || anchor !== null;
  if (anchored && (HUMAN_PHRASES.test(text) || anchor !== null)) return make('ANCHORED_HUMAN', anchor?.hint ?? null);
  if (MACRO_PHRASES.test(text)) return make('MACRO', null);
  if (WIDE_PHRASES.test(text)) return make('WIDE', null);
  if (HUMAN_PHRASES.test(text)) return make('ANCHORED_HUMAN', null);

  // Nothing said. OBSERVER is the neutral fallback, and the caller is told
  // the viewpoint was never actually stated.
  return { viewpoint: { kind: 'OBSERVER', anchorHint: null, cameraMode: VIEWPOINT_MODE.OBSERVER }, resolved: false };
}

function detectSubject(sourceText: string): string | null {
  const lead = /(?:show me|show|visuali[sz]e|simulate|render|run|pokaż|pokaz|zwizualizuj|symuluj|uruchom)\s+(?:me\s+)?(.+)/i.exec(sourceText);
  const rest = (lead ? lead[1] : sourceText).trim();
  const cut = rest.split(/\s+(?:from the perspective|from a perspective|z perspektywy|over the next|over|through|across|while|during|podczas|przez|for the next)\b/i)[0];
  const subject = cut.replace(/^(?:the|a|an)\s+/i, '').replace(/[.?!,;]+$/, '').trim();
  return subject.length >= 3 ? subject : null;
}

function detectLocation(sourceText: string): string | null {
  for (const pattern of LOCATION_PATTERNS) {
    const match = pattern.exec(sourceText);
    if (match) return match[1].trim();
  }
  return null;
}

function classifySafety(sourceText: string): { safety: SafetyClass; signals: readonly string[] } {
  const signals = WEAPON_DEVELOPMENT_PATTERNS
    .filter((candidate) => candidate.pattern.test(sourceText))
    .map((candidate) => candidate.signal);
  return signals.length > 0
    ? { safety: 'WEAPON_DEVELOPMENT', signals }
    : { safety: 'CONSEQUENCE_MODELLING', signals: [] };
}

/**
 * Parses a sentence into a `StructuredScenarioRequest`. Pure and
 * deterministic: same input, same output, same `requestId`, forever.
 */
export function parseScenarioRequest(sourceText: string): StructuredScenarioRequest {
  const trimmed = sourceText.trim();
  const lower = trimmed.toLowerCase();

  const kind = detectKind(lower);
  const family = kind ? KIND_FAMILY[kind] : null;
  const span = detectSpan(trimmed);
  const subject = detectSubject(trimmed);
  const location = detectLocation(trimmed);
  const { viewpoint, resolved: viewpointResolved } = detectViewpoint(trimmed);
  const { safety, signals } = classifySafety(trimmed);

  const unresolved: UnresolvedAspect[] = [];
  if (!family) unresolved.push('FAMILY');
  if (!subject) unresolved.push('SUBJECT');
  if (!span) unresolved.push('TIME_SPAN');
  if (!viewpointResolved) unresolved.push('VIEWPOINT');
  if (!location) unresolved.push('LOCATION');

  return {
    requestId: `sr-${fnv1a(lower)}`,
    sourceText: trimmed,
    family,
    kind,
    subject,
    location,
    span,
    viewpoint,
    safety,
    safetySignals: signals,
    comparison: COMPARISON_PHRASES.test(trimmed),
    cinematic: CINEMATIC_PHRASES.test(trimmed),
    unresolved,
  };
}

/** Ticks a span corresponds to, given how many ticks a world runs per unit.
 * Pure arithmetic — it does not decide whether the world SHOULD run that long. */
export function spanToTicks(span: TemporalSpan, ticksPerUnit: Readonly<Record<TemporalUnit, number>>): number {
  return Math.max(1, Math.round(span.amount * ticksPerUnit[span.unit]));
}
