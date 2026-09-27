import type { TemporalSceneRequest, TemporalSceneType } from './contracts';
import { SUPPORTED_YEAR_RANGE } from './contracts';
import { resolveKnownLocationId } from './historicalEraKnowledgeBase';
import type { ViewpointKind } from '../scenarioRequest';

/**
 * DETERMINISTIC GRAMMAR, same discipline as `scenarioRequest.ts`'s own
 * doc comment: a probabilistic parse would break replay (the request's own
 * fingerprint has to be reproducible from its text), and an unrecognised
 * fragment must be reported by name in `unresolved`, never silently guessed.
 */

export interface ParsedTemporalSceneRequest {
  readonly request: TemporalSceneRequest;
  /** Aspects the text did not name, reported honestly rather than defaulted silently. */
  readonly unresolved: readonly string[];
}

/** Matches any 1000-2999 four-digit token that reads as a year, in or out of the supported range — an out-of-range one must still be CAUGHT here so `temporalSequenceBuilder.ts` can refuse it explicitly (INVALID_TEMPORAL_RANGE), rather than the text silently reading as "no year at all" (NEEDS_INPUT). */
const YEAR_RE = /\b([12]\d{3})\b/g;

const SCENE_TYPE_KEYWORDS: readonly (readonly [RegExp, TemporalSceneType])[] = [
  [/\btransformacj|transformation|zmian[ay]\b/i, 'TRANSFORMATION'],
  [/\btimelapse|co\s+\d+\s+lat|every\s+\d+\s+years/i, 'TIMELAPSE'],
  [/\bwalk|spacer|chodz/i, 'WALK'],
  [/\bdrive|jazd|jedz/i, 'DRIVE'],
  [/\baerial|drone|z\s+lotu\s+ptaka/i, 'AERIAL'],
  [/\bcinematic|kinowo|film/i, 'CINEMATIC'],
  [/\bstreet\s*view/i, 'STREET_VIEW'],
];

const VIEWPOINT_FOR_SCENE: Readonly<Record<TemporalSceneType, ViewpointKind>> = {
  WALK: 'ANCHORED_HUMAN', DRIVE: 'DRIVER_POV', STREET_VIEW: 'OBSERVER', AERIAL: 'WIDE',
  STATIC: 'ANCHORED_HUMAN', CINEMATIC: 'OBSERVER', TIMELAPSE: 'ANCHORED_HUMAN', TRANSFORMATION: 'ANCHORED_HUMAN',
};

const WEATHER_RE = /\b(rain|deszcz|snow|śnieg|fog|mgł[ay]|sun|słoneczn\w*)\b/i;
const SEASON_RE = /\b(spring|wiosn\w*|summer|lat[oe]m?|autumn|fall|jesień|jesieni[ąi]?|winter|zim[aąie])\b/i;
const TIME_OF_DAY_RE = /\b(morning|ranek|rano|noon|południe|evening|wieczor\w*|night|noc\w*|dusk|dawn|świt)\b/i;

/** "co 10 lat" / "every 10 years" — the interval, in years. */
const INTERVAL_RE = /(?:co|every)\s+(\d{1,3})\s*(?:lat|years?)/i;

/** "5 sekund" / "30 second(s)" — the requested clip duration. */
const DURATION_RE = /(\d{1,4})\s*(?:sekund\w*|seconds?|sec\b)/i;

function extractYears(text: string): number[] {
  const matches = [...text.matchAll(YEAR_RE)].map((m) => Number(m[1]));
  return [...new Set(matches)].sort((a, b) => a - b);
}

export function parseTemporalSceneRequest(prompt: string): ParsedTemporalSceneRequest {
  const unresolved: string[] = [];

  const locationId = resolveKnownLocationId(prompt);
  const location = locationId ? { name: locationId } : null;
  if (!location) unresolved.push('location');

  const years = extractYears(prompt);
  let time: TemporalSceneRequest['time'] = {};
  const intervalMatch = prompt.match(INTERVAL_RE);
  const rangeWord = /\bto\b|\bdo\b|→|-/.test(prompt) && years.length >= 2;

  if (intervalMatch && years.length >= 1) {
    const intervalYears = Number(intervalMatch[1]);
    const startYear = years[0];
    const endYear = years.length >= 2 ? years[years.length - 1] : SUPPORTED_YEAR_RANGE.max;
    time = { startYear, endYear, intervalYears };
  } else if (years.length >= 3) {
    time = { years };
  } else if (years.length === 2 && rangeWord) {
    time = { startYear: years[0], endYear: years[1] };
  } else if (years.length === 2) {
    time = { years };
  } else if (years.length === 1) {
    time = { year: years[0] };
  } else {
    unresolved.push('time');
  }

  let sceneType: TemporalSceneType = 'STATIC';
  let sceneTypeResolved = false;
  for (const [re, kind] of SCENE_TYPE_KEYWORDS) {
    if (re.test(prompt)) { sceneType = kind; sceneTypeResolved = true; break; }
  }
  if (!sceneTypeResolved) {
    if (time.startYear !== undefined || (time.years && time.years.length > 1)) sceneType = 'TRANSFORMATION';
    else unresolved.push('sceneType');
  }

  const durationMatch = prompt.match(DURATION_RE);
  const durationSeconds = durationMatch ? Number(durationMatch[1]) : 5;

  const weatherMatch = prompt.match(WEATHER_RE);
  const seasonMatch = prompt.match(SEASON_RE);
  const timeOfDayMatch = prompt.match(TIME_OF_DAY_RE);

  const request: TemporalSceneRequest = {
    prompt,
    location,
    time,
    scene: { type: sceneType, durationSeconds, fps: 24 },
    atmosphere: {
      weather: weatherMatch?.[1]?.toLowerCase(),
      season: seasonMatch?.[1]?.toLowerCase(),
      timeOfDay: timeOfDayMatch?.[1]?.toLowerCase(),
    },
    viewpoint: VIEWPOINT_FOR_SCENE[sceneType],
  };

  return { request, unresolved };
}
