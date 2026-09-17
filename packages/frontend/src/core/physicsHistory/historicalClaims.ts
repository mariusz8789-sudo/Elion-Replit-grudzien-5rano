import type { KnowledgeEpistemicStatus, KnowledgeSourceKind } from '../knowledge/supplementalRegistry';

/**
 * HISTORY OF PHYSICS — HISTORICAL CLAIMS (docs/DECISIONS.md D-076).
 *
 * ONE TAXONOMY, NOT A SEVENTH. `epistemicStatus` is the EXISTING
 * `KnowledgeEpistemicStatus` from `core/knowledge/supplementalRegistry.ts`
 * (`FACT | MODEL | THEORY | HYPOTHESIS | SCENARIO_ASSUMPTION |
 * FICTIONAL_REFERENCE`) and `sourceKind` is that file's existing
 * `KnowledgeSourceKind` — both imported, neither redeclared.
 * `core/epistemicReliability.ts` already documents that this repository has
 * SIX epistemic vocabularies and exists to MAP between them rather than add
 * another; this module obeys that and adds none.
 *
 * WHY A SEPARATE LIST RATHER THAN NEW ROWS IN `supplementalRegistry`'s
 * `RECORDS`: that array is the general knowledge corpus consulted by
 * narration/search across the whole app, and its records carry
 * `capability`/`requiredSolver` fields about SOLVER availability. These
 * records answer a different question — "what did this historical episode
 * actually establish, and what did it NOT" — and are bound to the graphs and
 * labs in this folder. They deliberately reuse that file's TYPES so a single
 * vocabulary governs both, and `historicalClaimsAsSupplemental()` below
 * projects them into the registry's own record shape for any caller that
 * wants them in the general corpus.
 *
 * THE RULES THIS FILE ENFORCES BY CONSTRUCTION:
 *  - Everett/MWI is an INTERPRETATION. Decoherence is the observable part
 *    that quantum mechanics and MWI share; no claim of detecting "other
 *    worlds" appears anywhere.
 *  - Tesla's polyphase AC and the induction motor are FACT. Long-range
 *    wireless power transmission / Wardenclyffe is HYPOTHESIS — it was never
 *    demonstrated at the claimed scale.
 *  - The Philadelphia Experiment is FICTIONAL_REFERENCE. It is not a
 *    historical experiment and carries `runnable: false`.
 */

export const HISTORICAL_CLAIMS_VERSION = '1.0.0';

export interface HistoricalClaim {
  readonly id: string;
  readonly title: string;
  /** Which `historicalGraphs.ts` graph (if any) computes this episode's quantities. */
  readonly modelIds: readonly string[];
  readonly epistemicStatus: KnowledgeEpistemicStatus;
  readonly statement: string;
  readonly sourceKind: KnowledgeSourceKind;
  readonly sourceTitle: string;
  readonly sourceUrl: string;
  /** What this claim does NOT establish. Never empty — a bounded claim always has a boundary. */
  readonly limitation: string;
  /**
   * Whether this episode may be executed as a scenario at all. The existing
   * registry declares an identical `scenarioEligible` flag that NOTHING in
   * the repository reads (verified by grep) — `philadelphiaGuard.ts` is the
   * first enforcer, and it reads THIS field.
   */
  readonly runnable: boolean;
}

const CLAIMS: readonly HistoricalClaim[] = [
  {
    id: 'einstein-photoelectric-1905',
    title: 'Einstein — efekt fotoelektryczny (1905)',
    modelIds: ['history-photoelectric'],
    epistemicStatus: 'FACT',
    statement:
      'Energia kinetyczna fotoelektronów zależy liniowo od częstotliwości padającego światła, a nie od jego natężenia; nachylenie tej zależności jest stałą Plancka. Jest to wielokrotnie potwierdzony wynik eksperymentalny (Millikan, 1916).',
    sourceKind: 'institutional-reference',
    sourceTitle: 'Nobel Prize — Albert Einstein, Nagroda 1921 za odkrycie prawa efektu fotoelektrycznego',
    sourceUrl: 'https://www.nobelprize.org/prizes/physics/1921/einstein/facts/',
    limitation:
      'Genesis liczy tu zależność Kmax = hf − φ dla ZADANEJ pracy wyjścia φ. Nie modeluje struktury pasmowej materiału, wydajności kwantowej emisji ani efektów powierzchniowych; φ jest wejściem, nie wynikiem.',
    runnable: true,
  },
  {
    id: 'einstein-perrin-brownian-1905-1909',
    title: 'Einstein / Perrin — ruchy Browna (1905, potwierdzenie 1908–1909)',
    modelIds: ['history-brownian'],
    epistemicStatus: 'FACT',
    statement:
      'Średni kwadrat przemieszczenia cząstki zawieszonej w cieczy rośnie liniowo z czasem, ⟨x²⟩ = 2Dt (jeden wymiar). Pomiary Perrina potwierdziły tę zależność i pozwoliły wyznaczyć liczbę Avogadra, co było kluczowym argumentem za atomową budową materii.',
    sourceKind: 'institutional-reference',
    sourceTitle: 'Nobel Prize — Jean Baptiste Perrin, Nagroda 1926 za prace nad nieciągłą strukturą materii',
    sourceUrl: 'https://www.nobelprize.org/prizes/physics/1926/perrin/facts/',
    limitation:
      'Krzywa liczona przez Genesis to ANALITYCZNA zależność ⟨x²⟩ = 2Dt dla zadanego D, nie odtworzenie surowych pomiarów Perrina. Nie modeluje konkretnej zawiesiny, temperatury ani lepkości jako wielkości mierzonych.',
    runnable: true,
  },
  {
    id: 'bell-chsh-inequality',
    title: 'Bell / CHSH — nierówność i jej kwantowe naruszenie',
    modelIds: ['history-bell-chsh'],
    epistemicStatus: 'FACT',
    statement:
      'Dla stanu singletowego korelacja wynosi E(θ) = −cos θ, a wielkość CHSH osiąga 2√2 ≈ 2,828, przekraczając granicę 2 obowiązującą każdą teorię lokalnie realistyczną. Naruszenie nierówności Bella zostało potwierdzone eksperymentalnie (Nagroda Nobla 2022).',
    sourceKind: 'institutional-reference',
    sourceTitle: 'Nobel Prize — Aspect, Clauser, Zeilinger, Nagroda 2022 za eksperymenty ze splątanymi fotonami',
    sourceUrl: 'https://www.nobelprize.org/prizes/physics/2022/summary/',
    limitation:
      'Genesis liczy IDEALNĄ predykcję kwantową E(θ) = −cos θ dla stanu singletowego. Nie modeluje wydajności detektorów, luk (loopholes) ani konkretnego układu eksperymentalnego; wartość 2√2 to granica teoretyczna (Tsirelson), nie wynik pomiaru.',
    runnable: true,
  },
  {
    id: 'curie-radioactive-decay',
    title: 'Curie — rozpad promieniotwórczy',
    modelIds: ['history-curie-decay'],
    epistemicStatus: 'FACT',
    statement:
      'Liczba nierozpadniętych jąder maleje wykładniczo: N/N₀ = 2^(−t/T½). Prawo rozpadu jest ustalonym, wielokrotnie potwierdzonym wynikiem; prace Marii Skłodowskiej-Curie nad promieniotwórczością i izolacją polonu oraz radu są jego historycznym fundamentem.',
    sourceKind: 'institutional-reference',
    sourceTitle: 'Nobel Prize — Marie Curie, Nagrody 1903 (fizyka) i 1911 (chemia)',
    sourceUrl: 'https://www.nobelprize.org/prizes/physics/1903/marie-curie/facts/',
    limitation:
      'Genesis liczy krzywą dla ZADANEGO czasu połowicznego rozpadu. Nie wyznacza T½ z danych, nie modeluje łańcuchów rozpadu, aktywności próbki ani dawki; jest to funkcja analityczna, nie pomiar radiometryczny.',
    runnable: true,
  },
  {
    id: 'tesla-polyphase-ac-induction-motor',
    title: 'Tesla — wielofazowy prąd przemienny i silnik indukcyjny',
    modelIds: ['history-tesla-rotating-field', 'history-tesla-lc-resonance'],
    epistemicStatus: 'FACT',
    statement:
      'Wielofazowe układy prądu przemiennego i silnik indukcyjny z wirującym polem magnetycznym działają i zostały wdrożone przemysłowo. Prędkość synchroniczna wirującego pola wynosi n = 120f/p (obr/min). Rezonans obwodu LC zachodzi przy f₀ = 1/(2π√(LC)).',
    sourceKind: 'historical-reference',
    sourceTitle: 'United States Patent and Trademark Office — publiczna wyszukiwarka patentów',
    sourceUrl: 'https://ppubs.uspto.gov/pubwebapp/',
    limitation:
      'Wzory n = 120f/p i f₀ = 1/(2π√(LC)) są dokładne przy podanych założeniach (pole synchroniczne, obwód LC bez strat). Genesis nie modeluje poślizgu, strat w rdzeniu, momentu obrotowego ani pełnych pól elektromagnetycznych maszyny.',
    runnable: true,
  },
  {
    id: 'tesla-wireless-power-wardenclyffe',
    title: 'Tesla — bezprzewodowy przesył energii na duże odległości (Wardenclyffe)',
    modelIds: [],
    epistemicStatus: 'HYPOTHESIS',
    statement:
      'Tesla proponował bezprzewodowy przesył energii na duże odległości i rozpoczął budowę wieży Wardenclyffe. Projekt nie został ukończony i NIE wykazano działającego przesyłu energii użytkowej na zakładaną skalę.',
    sourceKind: 'historical-reference',
    sourceTitle: 'United States Patent and Trademark Office — publiczna wyszukiwarka patentów',
    sourceUrl: 'https://ppubs.uspto.gov/pubwebapp/',
    limitation:
      'To HIPOTEZA, nie fakt. Nie wolno jej przedstawiać jako zademonstrowanej technologii ani mieszać z faktem, jakim jest wielofazowy AC i silnik indukcyjny. Genesis nie posiada modelu takiego przesyłu i żaden graf go nie liczy.',
    runnable: false,
  },
  {
    id: 'everett-mwi-decoherence',
    title: 'Everett — interpretacja wielu światów a dekoherencja',
    modelIds: ['history-decoherence'],
    epistemicStatus: 'THEORY',
    statement:
      'Interpretacja wielu światów (Everett) to INTERPRETACJA mechaniki kwantowej — proponuje odczytanie formalizmu bez postulatu kolapsu. Częścią wspólną, którą można obserwować i mierzyć, jest DEKOHERENCJA: zanik widzialności interferencji, visibility = exp(−Γt).',
    sourceKind: 'institutional-reference',
    sourceTitle: 'Stanford Encyclopedia of Philosophy — Many-Worlds Interpretation of Quantum Mechanics',
    sourceUrl: 'https://plato.stanford.edu/entries/qm-manyworlds/',
    limitation:
      'NIE istnieje eksperyment wykrywający „inne światy”, a dekoherencja NIE jest dowodem MWI — jest zgodna z wieloma interpretacjami. Genesis liczy wyłącznie zanik widzialności dla zadanego Γ i nie rozstrzyga sporu interpretacyjnego.',
    runnable: true,
  },
  {
    id: 'philadelphia-experiment',
    title: 'Eksperyment filadelfijski — referencja fikcyjna',
    modelIds: ['history-philadelphia-narrative'],
    epistemicStatus: 'FICTIONAL_REFERENCE',
    statement:
      'Opowieść o rzekomym uczynieniu okrętu USS Eldridge niewidzialnym lub teleportowanym w 1943 roku jest legendą miejską rozpowszechnioną w literaturze popularnej i filmie. NIE jest to eksperyment historyczny ani wynik naukowy.',
    sourceKind: 'fictional-reference',
    sourceTitle: 'U.S. Navy — Naval History and Heritage Command, stanowisko wobec „Philadelphia Experiment”',
    sourceUrl: 'https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/p/philadelphia-experiment.html',
    limitation:
      'Może istnieć wyłącznie jako warstwa narracyjna. Nie może zasilać parametrów fizycznych, obserwabli, provenance ani żadnego twierdzenia naukowego. Uruchomienie w trybie PRODUCTION jest zablokowane (patrz philadelphiaGuard.ts).',
    runnable: false,
  },
] as const;

export function listHistoricalClaims(): readonly HistoricalClaim[] {
  return CLAIMS;
}

export function getHistoricalClaim(id: string): HistoricalClaim | undefined {
  return CLAIMS.find((c) => c.id === id);
}

/** Every claim that declares a model, for the graph/lab layers to bind against. */
export function claimsForModel(modelId: string): readonly HistoricalClaim[] {
  return CLAIMS.filter((c) => c.modelIds.includes(modelId));
}

/**
 * Projection into the EXISTING `SupplementalKnowledgeRecord` shape, so these
 * records can join the general knowledge corpus without this module owning a
 * second store. `scenarioEligible` is mapped from `runnable` — the same
 * meaning, expressed in the registry's own vocabulary.
 */
export function historicalClaimsAsSupplemental(): readonly {
  id: string; title: string; domainId: string;
  epistemicStatus: KnowledgeEpistemicStatus; statement: string;
  source: { kind: KnowledgeSourceKind; title: string; url: string; retrievedAt: string };
  realModelIds: readonly string[]; scenarioEligible: boolean; limitation: string;
}[] {
  return CLAIMS.map((c) => ({
    id: c.id, title: c.title, domainId: 'physics-history',
    epistemicStatus: c.epistemicStatus, statement: c.statement,
    source: { kind: c.sourceKind, title: c.sourceTitle, url: c.sourceUrl, retrievedAt: '2026-09-15' },
    realModelIds: c.modelIds, scenarioEligible: c.runnable, limitation: c.limitation,
  }));
}
