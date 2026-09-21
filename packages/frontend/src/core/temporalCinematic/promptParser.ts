/**
 * TEMPORAL CINEMATIC ENGINE — PROMPT PARSER.
 *
 * Deterministic, rule-based extraction (no LLM call, no network) of
 * {place, year, durationSeconds, cameraMode, weather} from a natural-
 * language request in Polish or English — e.g. "Wygeneruj 20-sekundowy film
 * Warszawy w 1920 roku, kamera idzie ulicą, pada deszcz" or "Show me Warsaw
 * in 1920, walking down the street, raining". Mirrors the existing
 * scientificWorlds command-classification style used elsewhere in this
 * codebase (fixed regex rules over free text, never a probabilistic
 * guess) — a parse failure is reported as a field-by-field
 * `PromptParseResult`, never a silent wrong default for the fields that
 * actually matter (place, year).
 *
 * SCOPE: only `cameraMode: 'walk'` is implemented end-to-end today
 * (`cameraPath.ts`); `drive`/`aerial` are recognized (so a caller can see
 * the user asked for them) but are explicitly deferred cinematic polish —
 * `temporalCinematicEngine.ts` reports `BLOCKED_BY_RUNTIME` rather than
 * silently substituting a walk camera for a requested drive/aerial one.
 */

export type CameraMode = 'walk' | 'drive' | 'aerial';
export type WeatherHint = 'rain' | 'clear' | 'snow';

export interface PromptParseIssue {
  readonly field: 'place' | 'year' | 'yearRange';
  readonly message: string;
}

export interface TemporalCinematicRequest {
  readonly raw: string;
  readonly place: string;
  readonly year: number;
  /** Present only for an explicit "compare year A and year B" request (e.g. "1900 i 2026" / "1900 and 2026"). */
  readonly compareYear?: number;
  readonly durationSeconds: number;
  readonly cameraMode: CameraMode;
  /** Recorded, never simulated by this layer — see cameraPath.ts's own scope note. Undefined when the prompt names no weather. */
  readonly weather?: WeatherHint;
}

export interface PromptParseResult {
  readonly ok: boolean;
  readonly request?: TemporalCinematicRequest;
  readonly issues: readonly PromptParseIssue[];
}

const DEFAULT_DURATION_SECONDS = 20;

const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2})\b/g;
const DURATION_RE = /(\d+)[\s-]*(?:sekund\w*|second\w*|sec\b|s\b)/i;
const CAMERA_WALK_RE = /idzie ulic|chod[zź]i|spaceruj|walk(?:s|ing)?\s+down|walking\s+the\s+street/i;
const CAMERA_DRIVE_RE = /jedzie|jazda|driv(?:e|ing)/i;
const CAMERA_AERIAL_RE = /z\s+lotu\s+ptaka|drone|aerial|z\s+góry/i;
const WEATHER_RAIN_RE = /pada\s+deszcz|deszcz\w*|\brain(?:y|ing)?\b/i;
const WEATHER_SNOW_RE = /śnieg\w*|\bsnow(?:y|ing)?\b/i;

/**
 * Place extraction is the one genuinely fuzzy step in an otherwise strict
 * parser: rather than a place-name gazetteer this repository does not have,
 * it takes the text between a recognized location preposition
 * ("Warszawy"/"Warsaw"/"w <miasto>"/"of <city>") and the first year/comma —
 * a deliberately narrow heuristic that FAILS closed (reports the `place`
 * issue) rather than guessing wrong. A caller that already knows the place
 * (e.g. a UI field) should skip this parser and call
 * `historicalWorldParameters.ts` directly.
 */
const PLACE_AFTER_PREPOSITION_RE = /(?:film[u]?\s+)?(?:miasta\s+)?([\p{Lu}][\p{L}]+)(?:\s+w\s+\d{3,4}| w roku| in \d{3,4}|,)/u;
const PLACE_OF_RE = /(?:of|show(?:s)? me)\s+([A-Z][a-zA-Z]+)/;

function extractPlace(text: string): string | undefined {
  const m1 = PLACE_AFTER_PREPOSITION_RE.exec(text);
  if (m1?.[1]) return m1[1];
  const m2 = PLACE_OF_RE.exec(text);
  if (m2?.[1]) return m2[1];
  return undefined;
}

function extractYears(text: string): number[] {
  const years: number[] = [];
  let m: RegExpExecArray | null;
  YEAR_RE.lastIndex = 0;
  while ((m = YEAR_RE.exec(text)) !== null) years.push(parseInt(m[1], 10));
  return years;
}

function extractDurationSeconds(text: string): number {
  const m = DURATION_RE.exec(text);
  return m ? parseInt(m[1], 10) : DEFAULT_DURATION_SECONDS;
}

function extractCameraMode(text: string): CameraMode {
  if (CAMERA_DRIVE_RE.test(text)) return 'drive';
  if (CAMERA_AERIAL_RE.test(text)) return 'aerial';
  if (CAMERA_WALK_RE.test(text)) return 'walk';
  return 'walk';
}

function extractWeather(text: string): WeatherHint | undefined {
  if (WEATHER_RAIN_RE.test(text)) return 'rain';
  if (WEATHER_SNOW_RE.test(text)) return 'snow';
  return undefined;
}

/** Parses `text`. Never throws — a malformed prompt is reported via `issues`, exactly like `validateSpecification` reports a bad specification. */
export function parseTemporalCinematicPrompt(text: string): PromptParseResult {
  const issues: PromptParseIssue[] = [];

  const place = extractPlace(text);
  if (!place) issues.push({ field: 'place', message: 'Could not identify a place name in the prompt.' });

  const years = extractYears(text);
  if (years.length === 0) issues.push({ field: 'year', message: 'Could not identify a year in the prompt.' });

  if (!place || years.length === 0) return { ok: false, issues };

  const [year, compareYear] = years;
  return {
    ok: true,
    issues,
    request: {
      raw: text,
      place,
      year,
      compareYear,
      durationSeconds: extractDurationSeconds(text),
      cameraMode: extractCameraMode(text),
      weather: extractWeather(text),
    },
  };
}
