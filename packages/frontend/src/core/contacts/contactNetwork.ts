import type { BuildingKind, CityLayout } from '../world/cityWorld';
import { buildingAt } from '../world/cityWorld';
import type { AgeBand } from '../agents/cohortModel';

/**
 * COHORT CONTACT / TRANSMISSION NETWORK — KTO z KIM się kontaktuje i GDZIE.
 *
 * STAN WYJŚCIOWY (audyt)
 * Warstwa kohortowa różnicowała już ILE kontaktów ma dana grupa, ale nie
 * mówiła nic o ich strukturze. Transmisja była zdarzeniem `{from,to,x,y}` bez
 * kontekstu: nie dało się zapytać, czy zakażenie zaszło w domu, w szkole, czy
 * na ulicy — a więc nie dało się zapytać, czy zamknięcie szkoły cokolwiek daje.
 *
 * MECHANIZM ≠ KALIBRACJA
 * To jest zasada tej warstwy. Repozytorium NIE MA macierzy kontaktów POLYMOD,
 * danych o gospodarstwach domowych ani danych o kontaktach szkolnych i
 * zawodowych. Budujemy więc MECHANIZM, który takie dane uniesie, a każdą
 * wartość bez źródła oznaczamy REQUIRES_CALIBRATION. Typ kontaktu NIE jest
 * przy tym zgadywany: wynika z geometrii świata i z przynależności agentów do
 * gospodarstwa, a gdy nie da się go ustalić — jest UNKNOWN_CONTACT_TYPE.
 */

export const CONTACT_NETWORK_VERSION = '1.0.0';

export type ContactType =
  | 'HOUSEHOLD'
  | 'SCHOOL'
  | 'WORK'
  | 'SHOP'
  | 'HEALTHCARE'
  | 'PUBLIC'
  | 'TRANSPORT'
  | 'OTHER'
  | 'UNKNOWN_CONTACT_TYPE';

export const CONTACT_TYPES: readonly ContactType[] = [
  'HOUSEHOLD', 'SCHOOL', 'WORK', 'SHOP', 'HEALTHCARE', 'PUBLIC', 'TRANSPORT', 'OTHER', 'UNKNOWN_CONTACT_TYPE',
];

export type ContactTypeStatus = 'DERIVED_FROM_WORLD' | 'NOT_MODELED';

export interface ContactTypeDeclaration {
  type: ContactType;
  status: ContactTypeStatus;
  /** Skąd wiadomo, że kontakt jest tego typu — albo dlaczego nie wiadomo. */
  basis: string;
}

/**
 * Jak powstaje każdy typ kontaktu. Typy oznaczone NOT_MODELED nie pojawią się
 * w żadnym wyniku — model nie ma dla nich miejsca w świecie, więc ich nie
 * podstawiamy pod inne kategorie.
 */
export const CONTACT_TYPE_DECLARATIONS: readonly ContactTypeDeclaration[] = [
  { type: 'HOUSEHOLD', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt wewnątrz budynku mieszkalnego, w którym OBAJ agenci mają swój dom (ten sam householdId).' },
  { type: 'SCHOOL', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt wewnątrz budynku o rodzaju `school`.' },
  { type: 'SHOP', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt wewnątrz budynku o rodzaju `shop`.' },
  { type: 'HEALTHCARE', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt wewnątrz szpitala lub izolatki.' },
  { type: 'PUBLIC', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt wewnątrz parku — wyznaczonej przestrzeni publicznej.' },
  { type: 'OTHER', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt na otwartej przestrzeni między obiektami (ulica). Model nie dzieli ulicy na dalsze kategorie.' },
  { type: 'WORK', status: 'NOT_MODELED', basis: 'Layout miasta nie zawiera miejsc pracy. Kontaktów zawodowych nie da się odróżnić od innych i nie są podstawiane pod SHOP ani OTHER.' },
  { type: 'TRANSPORT', status: 'NOT_MODELED', basis: 'Model nie ma transportu zbiorowego: brak pojazdów, linii i pasażerów. Agenci przemieszczają się bezpośrednio.' },
  { type: 'UNKNOWN_CONTACT_TYPE', status: 'DERIVED_FROM_WORLD', basis: 'Kontakt w budynku mieszkalnym między osobami z RÓŻNYCH gospodarstw. Model nie zna odwiedzin, więc nie przypisujemy tego do HOUSEHOLD ani do niczego innego.' },
];

export const CONTACT_TYPES_NOT_MODELED: readonly ContactType[] = CONTACT_TYPE_DECLARATIONS
  .filter((d) => d.status === 'NOT_MODELED')
  .map((d) => d.type);

/** Status kalibracji pojedynczego parametru grafu kontaktów. */
export type CalibrationStatus = 'DERIVED_FROM_MODEL' | 'REQUIRES_CALIBRATION' | 'NOT_MODELED';

export interface ContactParameterDeclaration {
  field: string;
  source: string;
  provenance: string;
  calibrationStatus: CalibrationStatus;
}

/**
 * Każde pole grafu kontaktów z jego pochodzeniem. Pola NOT_MODELED nie są
 * wypełniane wartością zastępczą — są nieobecne.
 */
export const CONTACT_GRAPH_PARAMETERS: readonly ContactParameterDeclaration[] = [
  { field: 'source', source: 'Identyfikator agenta zakaźnego z realnego zdarzenia transmisji.', provenance: 'Silnik symulacji, w chwili transmisji.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'target', source: 'Identyfikator agenta zakażonego z realnego zdarzenia transmisji.', provenance: 'Silnik symulacji, w chwili transmisji.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'location', source: 'Budynek zawierający punkt kontaktu albo przestrzeń otwarta.', provenance: 'Geometria świata (buildingAt), odczytana w chwili transmisji.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'contactType', source: 'Rodzaj budynku plus przynależność obu agentów do gospodarstwa.', provenance: 'Wyprowadzony ze świata; nierozstrzygalny przypadek daje UNKNOWN_CONTACT_TYPE.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'time', source: 'Czas symulacyjny w dniach w chwili transmisji.', provenance: 'Zegar modelu.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'stepDurationDays', source: 'Długość kroku symulacji, w którym zaszła transmisja.', provenance: 'Parametr pętli (dt). To NIE jest czas trwania kontaktu.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'transmissionProbability', source: 'Prawdopodobieństwo użyte w tym kroku: (1−e^(−β·Δt))·transmissionScale·podatność celu.', provenance: 'Ta sama wartość, którą model porównał z losowaniem.', calibrationStatus: 'DERIVED_FROM_MODEL' },
  { field: 'contactDurationDays', source: 'BRAK — model nie śledzi czasu trwania pojedynczego kontaktu, tylko bliskość w kroku.', provenance: 'Nie istnieje w modelu.', calibrationStatus: 'NOT_MODELED' },
  { field: 'weight', source: 'BRAK — model nie ma intensywności kontaktu ani macierzy kontaktów wg wieku.', provenance: 'Wymagałby danych typu POLYMOD, których repozytorium nie posiada.', calibrationStatus: 'NOT_MODELED' },
];

/**
 * Czego ta warstwa NIE modeluje. Konsument ma to pokazywać jako NOT_MODELED.
 */
export const CONTACT_NETWORK_NOT_MODELED = [
  'age-specific-contact-matrix',
  'household-demography',
  'workplace-contacts',
  'transport-contacts',
  'contact-duration',
  'contact-intensity-weight',
  'home-visiting',
] as const;

/**
 * Gospodarstwo domowe. Relacja agent → gospodarstwo JEST realna: pochodzi z
 * przydziału domu w `spawnAgents`. Realny jest jednak tylko GRAF; ROZKŁAD
 * liczebności gospodarstw jest artefaktem losowego przydziału i nie odwzorowuje
 * żadnej demografii — stąd status poniżej.
 */
export type HouseholdCalibration = 'STRUCTURAL_REAL_RELATION' | 'SYNTHETIC_CALIBRATION_REQUIRED' | 'USER_SUPPLIED';

export interface HouseholdView {
  householdId: number;
  buildingIndex: number;
  memberIds: readonly number[];
  size: number;
  bandCounts: Record<AgeBand, number>;
}

export interface HouseholdStructure {
  calibration: HouseholdCalibration;
  provenanceNote: string;
  households: readonly HouseholdView[];
  meanSize: number;
}

export const HOUSEHOLD_PROVENANCE_NOTE =
  'Przynależność agenta do gospodarstwa pochodzi z realnego przydziału domu w modelu i jest odtwarzalna. Rozkład liczebności gospodarstw wynika jednak z losowego przydziału domów, a nie z danych demograficznych — nie wolno go czytać jako struktury gospodarstw jakiejkolwiek populacji.';

/** Ustalony typ kontaktu wraz z miejscem, w którym zaszedł. */
export interface ContactClassification {
  contactType: ContactType;
  locationKind: BuildingKind | 'outdoor';
  locationIndex: number;
  householdId: number | null;
}

/**
 * Ustala typ kontaktu z geometrii świata i z przynależności do gospodarstwa.
 *
 * Nie zgaduje. Budynek mieszkalny z osobami z różnych gospodarstw daje
 * UNKNOWN_CONTACT_TYPE, bo model nie zna odwiedzin i nie ma podstaw, żeby
 * nazwać taki kontakt domowym.
 */
export function classifyContact(
  layout: CityLayout,
  x: number,
  y: number,
  sourceHouseholdId: number,
  targetHouseholdId: number,
): ContactClassification {
  const index = buildingAt(layout, x, y);
  if (index < 0) {
    return { contactType: 'OTHER', locationKind: 'outdoor', locationIndex: -1, householdId: null };
  }
  const kind = layout.buildings[index].kind;
  switch (kind) {
    case 'home':
      return sourceHouseholdId === targetHouseholdId && sourceHouseholdId === index
        ? { contactType: 'HOUSEHOLD', locationKind: kind, locationIndex: index, householdId: index }
        : { contactType: 'UNKNOWN_CONTACT_TYPE', locationKind: kind, locationIndex: index, householdId: null };
    case 'school':
      return { contactType: 'SCHOOL', locationKind: kind, locationIndex: index, householdId: null };
    case 'shop':
      return { contactType: 'SHOP', locationKind: kind, locationIndex: index, householdId: null };
    case 'hospital':
    case 'isolation':
      return { contactType: 'HEALTHCARE', locationKind: kind, locationIndex: index, householdId: null };
    case 'park':
      return { contactType: 'PUBLIC', locationKind: kind, locationIndex: index, householdId: null };
    default:
      return { contactType: 'UNKNOWN_CONTACT_TYPE', locationKind: kind, locationIndex: index, householdId: null };
  }
}

/** Krawędź grafu transmisji — jedno realne zdarzenie zakażenia. */
export interface TransmissionEdge {
  source: number;
  target: number;
  sourceBand: AgeBand;
  targetBand: AgeBand;
  sourceHouseholdId: number;
  targetHouseholdId: number;
  contactType: ContactType;
  locationKind: BuildingKind | 'outdoor';
  locationIndex: number;
  householdId: number | null;
  /** Dzień symulacji (ułamkowy) w chwili transmisji. */
  time: number;
  /** Długość kroku, w którym zaszła transmisja — NIE czas trwania kontaktu. */
  stepDurationDays: number;
  /** Prawdopodobieństwo faktycznie użyte przez model w tym kroku. */
  transmissionProbability: number;
}
