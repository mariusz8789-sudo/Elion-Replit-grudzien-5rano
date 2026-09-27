/**
 * SCENE DOMAIN RESOLVER — the top of the generic "Natural Language ->
 * Intent/Domain Resolution -> ..." pipeline. Deterministic keyword grammar,
 * same discipline as `scenarioRequest.ts` and `temporalSceneRequestParser.ts`:
 * a probabilistic classifier would make `genesisSceneOrchestrator.ts`'s
 * fingerprint non-reproducible. Returns `null` when nothing recognisable
 * matched — NEEDS_INPUT, never a guessed domain.
 */
export type SceneDomain = 'HISTORICAL_URBAN' | 'MOLECULE' | 'BIOLOGICAL_CELL' | 'ENGINEERING' | 'ENVIRONMENTAL';

const DOMAIN_KEYWORDS: readonly (readonly [RegExp, SceneDomain])[] = [
  // Checked before HISTORICAL_URBAN's own year-detection so a phrase like
  // "DNA molecule" doesn't get swallowed by a coincidental 4-digit match.
  [/\bmolecul|smiles|compound|aspirin|caffeine|benzene|ethanol|dna\b|cząsteczk|związ(ek|ku)/i, 'MOLECULE'],
  [/\bcell\b|\bcells\b|virus|protein|organ(izm)?|tissue|komórk|wirus|białk|tkank|human body/i, 'BIOLOGICAL_CELL'],
  [/\bpump\b|\bpipe\b|factory|industrial|plant\b|pompa|rurociąg|fabryk|zakład\s+przemysłow|machine|maszyn/i, 'ENGINEERING'],
  [/\bflood\b|ecosystem|epidem|solar system|ocean|environment|powódź|epidemi|układ\s+słoneczny|ekosystem/i, 'ENVIRONMENTAL'],
  // Historical/urban last — its own signal (a city/place name plus a year) is
  // the weakest anchor of the five and should not shadow a more specific one.
  [/\b(city|street|town|ulic|miast|london|warsaw|warszaw|krakow|kraków|new york|barcelona|rome|rzym)\b/i, 'HISTORICAL_URBAN'],
];

export function resolveSceneDomain(prompt: string): SceneDomain | null {
  for (const [re, domain] of DOMAIN_KEYWORDS) {
    if (re.test(prompt)) return domain;
  }
  // A bare year with no other domain keyword still reads as a historical/urban request.
  if (/\b[12]\d{3}\b/.test(prompt)) return 'HISTORICAL_URBAN';
  return null;
}
