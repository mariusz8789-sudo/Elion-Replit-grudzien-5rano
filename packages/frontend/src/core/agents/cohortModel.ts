import type { SimAgent } from '../simulation/types';

/**
 * COHORT MODEL — heterogeniczna populacja: wiek i rola PRZESTAJĄ być etykietą.
 *
 * STAN WYJŚCIOWY (audyt)
 * `spawnAgents` nadawał każdemu agentowi `age` i `role`, ale nic ich nie
 * czytało poza `debugInfo`. Ryzyko ciężkiego przebiegu było globalne
 * (`severeRate`), śmiertelność globalna (`ifr`), a wybór celu identyczny dla
 * wszystkich — senior szedł do szkoły z tym samym prawdopodobieństwem co uczeń.
 * Populacja była jednorodna z doklejonymi napisami.
 *
 * CO TEN MODUŁ ROBI, A CZEGO NIE
 * Daje modelowi ZDOLNOŚĆ wyrażania różnic między grupami. NIE wnosi żadnych
 * danych klinicznych. Domyślny profil jest NEUTRALNY — wszystkie mnożniki równe
 * 1 — więc dołożenie tej warstwy nie zmienia ani jednego wyniku. Każda różnica
 * między grupami musi zostać JAWNIE wprowadzona przez profil kalibracyjny i
 * niesie ze sobą swoje pochodzenie.
 *
 * To rozróżnienie jest celowe: model zyskuje możliwość pytania „co, jeśli
 * seniorzy chorują ciężej", a nie twierdzenie „seniorzy chorują ciężej".
 *
 * Każda zmienna ma opis SOURCE / ASSUMPTION / PARAMETER / PROVENANCE
 * w `COHORT_VARIABLES` — bez tego nie wolno jej używać w żadnym wniosku.
 */

export const COHORT_MODEL_VERSION = '1.0.0';

/** Pasmo wieku. Podział, nie dana kliniczna — granice są parametrem. */
export type AgeBand = 'child' | 'adult' | 'senior';

export const AGE_BANDS: readonly AgeBand[] = ['child', 'adult', 'senior'];

/**
 * Skąd bierze się wartość zmiennej i czego nie wolno na jej podstawie twierdzić.
 *
 *  STRUCTURAL          — wynika z budowy modelu, nie z danych o świecie
 *                        (np. definicja pasma wieku, mechanika ochrony).
 *  REQUIRES_CALIBRATION— model umie to wyrazić, ale wartość MUSI podać badacz
 *                        wraz ze źródłem. Domyślnie neutralna (1).
 *  NOT_MODELED         — model tego nie ma i nie da się tego obejść parametrem.
 */
export type CohortProvenance = 'STRUCTURAL' | 'REQUIRES_CALIBRATION' | 'NOT_MODELED';

export interface CohortVariable {
  id: string;
  /** SOURCE — skąd pochodzi ta wielkość. */
  source: string;
  /** ASSUMPTION — co przyjmujemy, żeby w ogóle dało się ją zapisać. */
  assumption: string;
  /** PARAMETER — nazwa, jednostka i dopuszczalny zakres. */
  parameter: string;
  /** PROVENANCE — status dowodowy. */
  provenance: CohortProvenance;
}

/**
 * Rejestr zmiennych kohortowych. Nic tu nie jest daną kliniczną: to opis, co
 * model potrafi wyrazić i pod jakim warunkiem wolno się na tym oprzeć.
 */
export const COHORT_VARIABLES: readonly CohortVariable[] = [
  {
    id: 'ageBand',
    source: 'Pole `age` istniejących agentów, nadawane deterministycznie w spawnAgents.',
    assumption: 'Populację da się sensownie podzielić na trzy pasma wieku o stałych granicach.',
    parameter: 'ageBandBounds.childMaxAge, ageBandBounds.seniorMinAge [lata], 0..120',
    provenance: 'STRUCTURAL',
  },
  {
    id: 'susceptibilityMultiplier',
    source: 'BRAK — model nie zawiera danych o podatności zależnej od wieku.',
    assumption: 'Podatność na zakażenie przy kontakcie skaluje się multiplikatywnie względem pasma wieku.',
    parameter: 'susceptibilityMultiplier[band], bezwymiarowy, 0..10; 1 = brak różnicy',
    provenance: 'REQUIRES_CALIBRATION',
  },
  {
    id: 'severityMultiplier',
    source: 'BRAK — model nie zawiera danych o odsetku ciężkich przebiegów wg wieku.',
    assumption: 'Prawdopodobieństwo ciężkiego przebiegu to `severeRate` przemnożony przez mnożnik pasma.',
    parameter: 'severityMultiplier[band], bezwymiarowy, 0..20; 1 = brak różnicy',
    provenance: 'REQUIRES_CALIBRATION',
  },
  {
    id: 'fatalityMultiplier',
    source: 'BRAK — model nie zawiera danych o śmiertelności zależnej od wieku.',
    assumption: 'Ryzyko zgonu to `ifr` przemnożony przez mnożnik pasma, zaciskany do [0,1].',
    parameter: 'fatalityMultiplier[band], bezwymiarowy, 0..100; 1 = brak różnicy',
    provenance: 'REQUIRES_CALIBRATION',
  },
  {
    id: 'contactWeight',
    source: 'BRAK — model nie zawiera danych o częstości wychodzenia wg wieku.',
    assumption: 'Skłonność do opuszczenia domu skaluje się multiplikatywnie względem pasma.',
    parameter: 'contactWeight[band], bezwymiarowy, 0..5; 1 = brak różnicy',
    provenance: 'REQUIRES_CALIBRATION',
  },
  {
    id: 'shielding',
    source: 'Mechanika modelu: ochrona to zmniejszenie liczby kontaktów wybranej grupy.',
    assumption: 'Ochrona priorytetowa działa wyłącznie przez ograniczenie wychodzenia, nie przez odporność.',
    parameter: 'shieldedBands[], shieldingEffectiveness 0..1; 0 = brak ochrony, 1 = pełne pozostanie w domu',
    provenance: 'STRUCTURAL',
  },
];

/**
 * Czego ta warstwa NIE modeluje i czego nie da się nadrobić parametrem.
 * Konsument ma to pokazywać jako NOT_MODELED, a nie zastępować przybliżeniem.
 */
export const COHORT_NOT_MODELED = [
  'household-structure',        // brak gospodarstw domowych i kontaktu wewnątrzdomowego wg składu
  'workplace-contact-networks', // layout nie ma miejsc pracy ani sieci kontaktów zawodowych
  'comorbidities',             // brak chorób współistniejących jako cechy agenta
  'age-specific-care-seeking', // model nie różnicuje zgłaszalności do opieki wg wieku
  'vaccine-efficacy',          // brak odporności nabytej inaczej niż przez przechorowanie
  'waning-immunity',           // stan R jest trwały
  'age-specific-contact-matrix', // brak macierzy kontaktów typu POLYMOD (kto z kim, nie tylko ile)
] as const;

export type CohortNotModeled = (typeof COHORT_NOT_MODELED)[number];

export interface AgeBandBounds {
  /** Górna granica pasma dziecięcego włącznie. */
  childMaxAge: number;
  /** Dolna granica pasma seniorów włącznie. */
  seniorMinAge: number;
}

export type BandMultipliers = Record<AgeBand, number>;

export interface CohortProfile {
  profileId: string;
  /**
   * NEUTRAL        — same jedynki; model zachowuje się dokładnie jak bez tej warstwy.
   * REQUIRES_CALIBRATION — profil różnicuje grupy, ale wartości nie mają źródła.
   * USER_SUPPLIED  — badacz podał wartości i wskazał ich pochodzenie.
   */
  calibration: 'NEUTRAL' | 'REQUIRES_CALIBRATION' | 'USER_SUPPLIED';
  /** Skąd pochodzą liczby w tym profilu. Wymagane dla USER_SUPPLIED. */
  provenanceNote: string;
  ageBandBounds: AgeBandBounds;
  susceptibilityMultiplier: BandMultipliers;
  severityMultiplier: BandMultipliers;
  fatalityMultiplier: BandMultipliers;
  contactWeight: BandMultipliers;
  /** Pasma objęte ochroną priorytetową. */
  shieldedBands: readonly AgeBand[];
  /** 0 = brak ochrony, 1 = grupa nie opuszcza domu. */
  shieldingEffectiveness: number;
}

const ONES: BandMultipliers = { child: 1, adult: 1, senior: 1 };

/**
 * Profil neutralny — jedyny, który wolno stosować bez podawania źródła.
 *
 * Granice pasm to konwencja podziału istniejącego pola `age`, a nie dana o
 * świecie: dziecko do 19 lat, senior od 65. Ponieważ WSZYSTKIE mnożniki są
 * równe 1, ten profil nie zmienia ani jednej decyzji modelu — pasma służą
 * wyłącznie do RAPORTOWANIA wyników w rozbiciu na grupy.
 */
export const NEUTRAL_COHORT_PROFILE: CohortProfile = {
  profileId: 'neutral',
  calibration: 'NEUTRAL',
  provenanceNote:
    'Profil neutralny: wszystkie mnożniki równe 1. Pasma wieku służą tylko do rozbicia wyników na grupy i nie wpływają na dynamikę. Żadna wartość kliniczna nie jest tu zakładana.',
  ageBandBounds: { childMaxAge: 19, seniorMinAge: 65 },
  susceptibilityMultiplier: { ...ONES },
  severityMultiplier: { ...ONES },
  fatalityMultiplier: { ...ONES },
  contactWeight: { ...ONES },
  shieldedBands: [],
  shieldingEffectiveness: 0,
};

/** Pasmo wieku agenta. Brak wieku => 'adult', bo model nie zna innej wartości. */
export function bandOfAge(age: number | undefined, bounds: AgeBandBounds = NEUTRAL_COHORT_PROFILE.ageBandBounds): AgeBand {
  if (age === undefined || !Number.isFinite(age)) return 'adult';
  if (age <= bounds.childMaxAge) return 'child';
  if (age >= bounds.seniorMinAge) return 'senior';
  return 'adult';
}

export function bandOfAgent(agent: SimAgent, profile: CohortProfile = NEUTRAL_COHORT_PROFILE): AgeBand {
  return bandOfAge(agent.age, profile.ageBandBounds);
}

/**
 * Buduje profil różnicujący grupy. Wymusza podanie pochodzenia: profil bez
 * źródła jest oznaczany jako REQUIRES_CALIBRATION i nie wolno na nim opierać
 * twierdzenia o świecie — służy wyłącznie do badania „co, jeśli".
 */
export function defineCohortProfile(
  profileId: string,
  overrides: Partial<Omit<CohortProfile, 'profileId' | 'calibration'>>,
  provenance?: { calibrated: true; provenanceNote: string },
): CohortProfile {
  const differentiates =
    hasNonUnit(overrides.susceptibilityMultiplier) ||
    hasNonUnit(overrides.severityMultiplier) ||
    hasNonUnit(overrides.fatalityMultiplier) ||
    hasNonUnit(overrides.contactWeight) ||
    (overrides.shieldedBands?.length ?? 0) > 0;

  const calibration: CohortProfile['calibration'] = !differentiates
    ? 'NEUTRAL'
    : provenance?.calibrated === true
      ? 'USER_SUPPLIED'
      : 'REQUIRES_CALIBRATION';

  return {
    ...NEUTRAL_COHORT_PROFILE,
    ...overrides,
    profileId,
    calibration,
    provenanceNote:
      provenance?.provenanceNote ??
      (differentiates
        ? 'Wartości nie mają podanego źródła. Profil służy wyłącznie do analizy „co, jeśli" i nie uprawnia do twierdzeń o rzeczywistej populacji.'
        : NEUTRAL_COHORT_PROFILE.provenanceNote),
  };
}

function hasNonUnit(m: BandMultipliers | undefined): boolean {
  return m !== undefined && AGE_BANDS.some((b) => m[b] !== 1);
}

/** Czy profil w ogóle różnicuje grupy — czyli czy może zmienić wynik. */
export function differentiatesCohorts(profile: CohortProfile): boolean {
  return (
    hasNonUnit(profile.susceptibilityMultiplier) ||
    hasNonUnit(profile.severityMultiplier) ||
    hasNonUnit(profile.fatalityMultiplier) ||
    hasNonUnit(profile.contactWeight) ||
    (profile.shieldedBands.length > 0 && profile.shieldingEffectiveness > 0)
  );
}

/**
 * Mnożnik kontaktów agenta: waga pasma razy ewentualna ochrona priorytetowa.
 * Ochrona zmniejsza wychodzenie z domu — NIE nadaje odporności.
 */
export function contactMultiplierFor(agent: SimAgent, profile: CohortProfile): number {
  const band = bandOfAgent(agent, profile);
  const shielded = profile.shieldedBands.includes(band)
    ? 1 - clamp01(profile.shieldingEffectiveness)
    : 1;
  return Math.max(0, profile.contactWeight[band]) * shielded;
}

export function susceptibilityFor(agent: SimAgent, profile: CohortProfile): number {
  return Math.max(0, profile.susceptibilityMultiplier[bandOfAgent(agent, profile)]);
}

export function severityFor(agent: SimAgent, profile: CohortProfile): number {
  return Math.max(0, profile.severityMultiplier[bandOfAgent(agent, profile)]);
}

export function fatalityFor(agent: SimAgent, profile: CohortProfile): number {
  return Math.max(0, profile.fatalityMultiplier[bandOfAgent(agent, profile)]);
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
