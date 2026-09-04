import type { ContactType } from '../contacts/contactNetwork';

/**
 * WORLD ENGINE ↔ SCIENTIFIC CORE — kontrakt danych o ruchu i kontaktach.
 *
 * CO TO JEST, A CZYM NIE JEST
 * To jest strona NAUKOWA interfejsu: definicja tego, czego Scientific Core
 * potrzebuje, żeby móc twierdzić cokolwiek o miejscu kontaktu, oraz walidatory,
 * które przyjmowane dane sprawdzają. NIE ma tu żadnej implementacji świata,
 * żadnej mapy, żadnego generatora ruchu i żadnego atrapowego World Engine.
 * Właścicielem World Engine jest Manus.
 *
 * DLACZEGO POWSTAJE
 * Audyt wykazał, że przypisanie miejsca w obecnym modelu jest niewiarygodne:
 * agenci poruszają się po liniach prostych, więc przecinają obrysy budynków,
 * których nie wybrali. Zmierzone na realnych przebiegach: 100% transmisji
 * kategorii OTHER i ok. 75% WSZYSTKICH transmisji zachodzi, gdy agent jest w
 * drodze — w tym 81 ze 137 transmisji „w budynkach". Zdanie „to zakażenie
 * zaszło w szkole" jest dziś w większości przypadków nieuprawnione.
 *
 * ZASADA
 * Scientific Core nie wymyśla mapy. Dopóki World Engine nie dostarczy realnych
 * tras i miejsc, kategorie pozostają na obecnym poziomie rozdzielczości, a
 * eksperymenty, które ich wymagają, są zablokowane — nie przybliżone.
 */

export const WORLD_ENGINE_INTERFACE_VERSION = '1.0.0';

/**
 * Skąd pochodzi pole kontraktu.
 *  MODEL_DERIVED — liczy je Scientific Core i World Engine ma je tylko czytać.
 *  WORLD_DERIVED — musi dostarczyć World Engine; Core nie ma podstaw, by je zgadnąć.
 *  NOT_MODELED   — nie istnieje po żadnej stronie; nie wolno go wypełniać.
 */
export type FieldProvenance = 'MODEL_DERIVED' | 'WORLD_DERIVED' | 'NOT_MODELED';

export interface FieldContract {
  entity: string;
  field: string;
  provenance: FieldProvenance;
  /** Co dokładnie ma zawierać — albo dlaczego nie istnieje. */
  meaning: string;
  /** Wymagane, żeby odblokować konkretne zdolności naukowe. */
  unlocks?: readonly string[];
}

/**
 * Pełny kontrakt pól. To jest lista, którą Manus ma zaimplementować, a Core
 * waliduje. Nic poza tą listą nie jest przez Core czytane.
 */
export const WORLD_ENGINE_FIELD_CONTRACT: readonly FieldContract[] = [
  // --- AgentPosition ---
  { entity: 'AgentPosition', field: 'agentId', provenance: 'MODEL_DERIVED', meaning: 'Identyfikator agenta z modelu. World Engine nie tworzy własnych agentów.' },
  { entity: 'AgentPosition', field: 'position', provenance: 'MODEL_DERIVED', meaning: 'Bieżąca pozycja (x, y) w układzie świata. Dziś liczona przez model po linii prostej.' },
  { entity: 'AgentPosition', field: 'timestamp', provenance: 'MODEL_DERIVED', meaning: 'Czas symulacyjny w dniach. World Engine nie prowadzi własnego zegara.' },

  // --- AgentMovement ---
  { entity: 'AgentMovement', field: 'speed', provenance: 'MODEL_DERIVED', meaning: 'Prędkość w jednostkach świata na dzień; dziś stała dla wszystkich agentów.' },
  { entity: 'AgentMovement', field: 'inTransit', provenance: 'MODEL_DERIVED', meaning: 'Czy agent jest w drodze, czy dotarł do celu. Podstawa oceny wiarygodności przypisania miejsca.' },
  { entity: 'AgentMovement', field: 'destinationLocationId', provenance: 'MODEL_DERIVED', meaning: 'Dokąd agent zmierza — decyzja modelu, nie świata.' },
  { entity: 'AgentMovement', field: 'route', provenance: 'WORLD_DERIVED', meaning: 'Rzeczywista trasa przejścia jako uporządkowana lista segmentów sieci. Topologia tras jest dostępna w WorldStateView, ale Scientific Core nie konsumuje jeszcze trasy pojedynczego agenta.', unlocks: ['ROAD_NETWORK_VS_STRAIGHT_LINE', 'STREET_SIDEWALK_SPLIT'] },
  { entity: 'AgentMovement', field: 'routeSegmentId', provenance: 'WORLD_DERIVED', meaning: 'Segment sieci, na którym agent aktualnie się znajduje. Sieć ma stabilne segmenty, lecz przypisanie bieżącej pozycji agenta do segmentu pozostaje niedostarczone.', unlocks: ['STREET_SIDEWALK_SPLIT'] },

  // --- Location ---
  { entity: 'Location', field: 'locationId', provenance: 'WORLD_DERIVED', meaning: 'Stabilny identyfikator miejsca, niezmienny między przebiegami tej samej mapy.' },
  { entity: 'Location', field: 'locationType', provenance: 'WORLD_DERIVED', meaning: 'Rodzaj miejsca z zamkniętej listy (patrz REQUIRED_LOCATION_TYPES).' },
  { entity: 'Location', field: 'footprint', provenance: 'WORLD_DERIVED', meaning: 'Obrys miejsca. Dziś prostokąt z layoutu; docelowo geometria z World Engine.' },
  { entity: 'Location', field: 'capacity', provenance: 'NOT_MODELED', meaning: 'Pojemność miejsca. Ani model, ani świat jej nie mają; nie wolno jej zastępować powierzchnią.' },
  { entity: 'Location', field: 'ventilation', provenance: 'NOT_MODELED', meaning: 'Wentylacja/otwartość miejsca. Brak danych po obu stronach.' },

  // --- Route ---
  { entity: 'Route', field: 'segments', provenance: 'WORLD_DERIVED', meaning: 'Stabilna topologia sieci dostępna przez WorldStateView.routing. Trasy agentów między punktem startu a celem nadal nie są częścią modelu.', unlocks: ['ROAD_NETWORK_VS_STRAIGHT_LINE'] },
  { entity: 'Route', field: 'segmentType', provenance: 'WORLD_DERIVED', meaning: 'ROAD | SIDEWALK | CROSSING | INDOOR — typy są dostarczane przez topologię, ale nie są jeszcze przypisane do kontaktów.', unlocks: ['STREET_SIDEWALK_SPLIT'] },
  { entity: 'Route', field: 'length', provenance: 'WORLD_DERIVED', meaning: 'Długość segmentu w jednostkach świata; potrzebna do czasu przebywania na segmencie.' },

  // --- ContactEvent ---
  { entity: 'ContactEvent', field: 'source', provenance: 'MODEL_DERIVED', meaning: 'Agent zakaźny.' },
  { entity: 'ContactEvent', field: 'target', provenance: 'MODEL_DERIVED', meaning: 'Agent podatny.' },
  { entity: 'ContactEvent', field: 'position', provenance: 'MODEL_DERIVED', meaning: 'Punkt kontaktu.' },
  { entity: 'ContactEvent', field: 'timestamp', provenance: 'MODEL_DERIVED', meaning: 'Czas kontaktu w dniach.' },
  { entity: 'ContactEvent', field: 'distance', provenance: 'MODEL_DERIVED', meaning: 'Odległość między agentami w chwili kontaktu.' },
  { entity: 'ContactEvent', field: 'duration', provenance: 'NOT_MODELED', meaning: 'Czas trwania pojedynczego spotkania. Model widzi wyłącznie bliskość w kroku i NIE łączy kolejnych kroków w jedno spotkanie. Dostępny jest tylko `stepDurationDays`, czyli długość kroku.' },
  { entity: 'ContactEvent', field: 'locationId', provenance: 'WORLD_DERIVED', meaning: 'Miejsce kontaktu. Dziś wyprowadzane z obrysu budynku, co przy ruchu po linii prostej jest zawodne.' },
  { entity: 'ContactEvent', field: 'contactType', provenance: 'MODEL_DERIVED', meaning: 'Typ kontaktu wyprowadzony z miejsca i przynależności do gospodarstwa. Rozdzielczość rośnie dopiero z danymi ze świata.' },

  // --- TransmissionEvent ---
  { entity: 'TransmissionEvent', field: 'transmissionProbability', provenance: 'MODEL_DERIVED', meaning: 'Dokładnie ta wartość, którą model porównał z losowaniem.' },
  { entity: 'TransmissionEvent', field: 'transmissionOccurred', provenance: 'MODEL_DERIVED', meaning: 'Czy doszło do zakażenia. Wyłącznie decyzja modelu — World Engine nigdy jej nie ustala.' },
  { entity: 'TransmissionEvent', field: 'sourceHouseholdId', provenance: 'MODEL_DERIVED', meaning: 'Gospodarstwo źródła; relacja pochodzi z modelu.' },
  { entity: 'TransmissionEvent', field: 'targetInTransit', provenance: 'MODEL_DERIVED', meaning: 'Czy cel był w drodze. Miara zaufania do przypisania miejsca.' },
];

/** Rodzaje miejsc, których Scientific Core oczekuje od World Engine. */
export type RequiredLocationType =
  | 'ROAD' | 'SIDEWALK' | 'CROSSING'
  | 'BUILDING' | 'SCHOOL' | 'WORK' | 'SHOP' | 'HOSPITAL' | 'PARK'
  | 'TRANSPORT';

export interface LocationTypeRequirement {
  locationType: RequiredLocationType;
  /** Czy model potrafi już dziś odróżnić kontakt w tym miejscu. */
  availableToday: boolean;
  /** Co musi dostarczyć World Engine, żeby to odblokować. */
  requires: string;
  /** Na jaki typ kontaktu przekłada się to miejsce. */
  mapsToContactType: ContactType;
}

export const REQUIRED_LOCATION_TYPES: readonly LocationTypeRequirement[] = [
  { locationType: 'BUILDING', availableToday: true, requires: 'Obrysy budynków — istnieją w layoucie.', mapsToContactType: 'HOUSEHOLD' },
  { locationType: 'SCHOOL', availableToday: true, requires: 'Obrys szkoły — istnieje. UWAGA: przypisanie jest dziś zawodne, bo agenci przechodzą przez obrys w drodze gdzie indziej.', mapsToContactType: 'SCHOOL' },
  { locationType: 'SHOP', availableToday: true, requires: 'Obrys sklepu — istnieje, z tym samym zastrzeżeniem o tranzycie.', mapsToContactType: 'SHOP' },
  { locationType: 'HOSPITAL', availableToday: true, requires: 'Obrys szpitala i izolatki — istnieją.', mapsToContactType: 'HEALTHCARE' },
  { locationType: 'PARK', availableToday: true, requires: 'Obrys parku — istnieje, z tym samym zastrzeżeniem o tranzycie.', mapsToContactType: 'PUBLIC' },
  { locationType: 'ROAD', availableToday: true, requires: 'Sieć jezdni z identyfikatorami segmentów jest dostępna w WorldStateView.routing. Brakuje przypisania pozycji agenta do segmentu.', mapsToContactType: 'OTHER' },
  { locationType: 'SIDEWALK', availableToday: true, requires: 'Sieć chodników odrębna od jezdni jest dostępna w WorldStateView.routing. Brakuje przypisania kontaktu do segmentu.', mapsToContactType: 'OTHER' },
  { locationType: 'CROSSING', availableToday: true, requires: 'Przejścia są osobnymi stabilnymi segmentami topologii. Brakuje ruchu agentów po tych segmentach.', mapsToContactType: 'OTHER' },
  { locationType: 'WORK', availableToday: false, requires: 'Miejsca pracy jako obiekty w layoucie ORAZ stabilne przypisanie agent → miejsce pracy.', mapsToContactType: 'WORK' },
  { locationType: 'TRANSPORT', availableToday: false, requires: 'Pojazdy jako poruszające się pojemniki z listą pasażerów, linie i przystanki.', mapsToContactType: 'TRANSPORT' },
];

/**
 * Możliwe rozbicie dzisiejszego OTHER — WYŁĄCZNIE gdy World Engine dostarczy
 * typ segmentu trasy. Do tego czasu OTHER zostaje jednym workiem, a brak
 * rozstrzygnięcia to UNKNOWN_CONTACT_TYPE, nigdy zgadnięta kategoria.
 */
export const OTHER_REFINEMENT = {
  currentCategory: 'OTHER' as const,
  proposedCategories: ['STREET', 'SIDEWALK', 'PUBLIC_SPACE', 'UNKNOWN'] as const,
  requiredField: 'Route.segmentType',
  ruleWhenUnavailable: 'UNKNOWN_CONTACT_TYPE',
  note: 'OTHER nie zostaje usunięte ani przemianowane, dopóki dane realnie nie pozwolą na podział. Kategoria zgadnięta byłaby gorsza od kategorii szerokiej.',
};

/** Zdolności naukowe zablokowane brakiem danych ze świata. */
export type ScientificCapability =
  | 'ROAD_NETWORK_VS_STRAIGHT_LINE'
  | 'STREET_SIDEWALK_SPLIT'
  | 'WORKPLACE_CONTACTS'
  | 'TRANSPORT_CONTACTS'
  | 'CONTACT_DURATION';

export interface CapabilityRequirement {
  capability: ScientificCapability;
  unlocksExperiment: string;
  requiredFields: readonly string[];
  /** Czy dane są dziś dostępne. Zawsze false, dopóki World Engine ich nie poda. */
  availableToday: false;
  blockedReason: string;
}

/**
 * Eksperymenty czekające na dane. Każdy pozostaje zablokowany, dopóki wszystkie
 * wymagane pola nie będą realnie dostarczone — nie ma tu wersji przybliżonej.
 */
export const CAPABILITY_REQUIREMENTS: readonly CapabilityRequirement[] = [
  {
    capability: 'ROAD_NETWORK_VS_STRAIGHT_LINE',
    unlocksExperiment: 'A. Sieć dróg kontra ruch po linii prostej',
    requiredFields: ['Route.segments', 'AgentMovement.route'],
    availableToday: false,
    blockedReason: 'Agenci przemieszczają się po odcinkach prostych między obiektami. Bez trasy po sieci nie da się porównać obu wariantów ruchu, a to właśnie ta geometria odpowiada dziś za ok. 75% transmisji.',
  },
  {
    capability: 'STREET_SIDEWALK_SPLIT',
    unlocksExperiment: 'Rozbicie OTHER na STREET / SIDEWALK / PUBLIC_SPACE',
    requiredFields: ['Route.segmentType', 'AgentMovement.routeSegmentId'],
    availableToday: false,
    blockedReason: 'Bez typu segmentu kontakt na otwartej przestrzeni jest nierozróżnialny. Podział byłby zgadywaniem.',
  },
  {
    capability: 'WORKPLACE_CONTACTS',
    unlocksExperiment: 'B. Kontakty w miejscu pracy (i praca zdalna jako interwencja)',
    requiredFields: ['Location.locationType=WORK', 'Agent.workplaceId'],
    availableToday: false,
    blockedReason: 'Layout nie zawiera miejsc pracy, a agenci nie mają przypisania do pracodawcy. Podstawienie sklepu pod pracę byłoby fałszowaniem kategorii.',
  },
  {
    capability: 'TRANSPORT_CONTACTS',
    unlocksExperiment: 'D. Ograniczenie transportu zbiorowego',
    requiredFields: ['Location.locationType=TRANSPORT', 'Vehicle.occupants', 'Vehicle.route'],
    availableToday: false,
    blockedReason: 'Model nie ma pojazdów, linii ani pasażerów. Agenci przemieszczają się bezpośrednio, więc nie istnieje nic, co można by ograniczyć.',
  },
  {
    capability: 'CONTACT_DURATION',
    unlocksExperiment: 'Ekspozycja zależna od czasu spotkania',
    requiredFields: ['ContactEvent.duration'],
    availableToday: false,
    blockedReason: 'Model wykrywa bliskość w kroku i nie łączy kolejnych kroków w jedno spotkanie. Dostępny jest wyłącznie `stepDurationDays`.',
  },
];

/** Eksperymenty, które są już wykonalne — bez czekania na World Engine. */
export const AVAILABLE_EXPERIMENTS = ['C. SCHOOL_CLOSURE', 'E. HOUSEHOLD_PROTECTION'] as const;

export function capabilityFor(capability: ScientificCapability): CapabilityRequirement {
  const found = CAPABILITY_REQUIREMENTS.find((c) => c.capability === capability);
  if (!found) throw new Error(`Nieznana zdolność: ${capability}`);
  return found;
}

/** Czy zdolność jest odblokowana przez faktycznie dostarczone pola. */
export function isCapabilityUnlocked(
  capability: ScientificCapability,
  providedFields: readonly string[],
): boolean {
  return capabilityFor(capability).requiredFields.every((field) => providedFields.includes(field));
}

export type ValidationSeverity = 'ERROR' | 'WARNING';

export interface ValidationIssue {
  severity: ValidationSeverity;
  rule: string;
  message: string;
}

export interface WorldPayloadValidation {
  valid: boolean;
  issues: readonly ValidationIssue[];
  /** Zdolności, które ten ładunek faktycznie odblokowuje. */
  unlockedCapabilities: readonly ScientificCapability[];
}

/**
 * Minimalny kształt ładunku, który World Engine miałby dostarczyć. Celowo
 * luźny: walidator ma odrzucać dane niezgodne z kontraktem, a nie udawać, że
 * jakiekolwiek dane już istnieją.
 */
export interface WorldPayload {
  contractVersion?: string;
  providedFields?: readonly string[];
  locations?: readonly { locationId?: string; locationType?: string }[];
  routeSegments?: readonly { segmentId?: string; segmentType?: string; length?: number }[];
}

const KNOWN_LOCATION_TYPES = new Set<string>(REQUIRED_LOCATION_TYPES.map((r) => r.locationType));
const KNOWN_SEGMENT_TYPES = new Set(['ROAD', 'SIDEWALK', 'CROSSING', 'INDOOR']);

/**
 * Sprawdza ładunek ze świata przed dopuszczeniem go do rdzenia naukowego.
 *
 * Walidator NIE tworzy danych i nie uzupełnia braków. Odrzuca ładunek, który
 * łamie kontrakt, i wylicza, które zdolności naukowe ten ładunek realnie
 * odblokowuje — na podstawie zadeklarowanych pól, nie obietnic.
 */
export function validateWorldPayload(payload: WorldPayload): WorldPayloadValidation {
  const issues: ValidationIssue[] = [];
  const provided = payload.providedFields ?? [];

  if (payload.contractVersion !== WORLD_ENGINE_INTERFACE_VERSION) {
    issues.push({
      severity: 'ERROR',
      rule: 'contract-version',
      message: `Ładunek deklaruje wersję kontraktu „${payload.contractVersion ?? 'brak'}", oczekiwano „${WORLD_ENGINE_INTERFACE_VERSION}".`,
    });
  }

  // Pole oznaczone NOT_MODELED nie może przyjechać wypełnione: to znaczyłoby,
  // że ktoś je wymyślił po którejś ze stron.
  for (const contract of WORLD_ENGINE_FIELD_CONTRACT) {
    if (contract.provenance !== 'NOT_MODELED') continue;
    const key = `${contract.entity}.${contract.field}`;
    if (provided.includes(key)) {
      issues.push({
        severity: 'ERROR',
        rule: 'not-modeled-must-stay-empty',
        message: `Pole ${key} jest zadeklarowane jako NOT_MODELED (${contract.meaning}), a ładunek twierdzi, że je dostarcza.`,
      });
    }
  }

  // Pole MODEL_DERIVED liczy rdzeń naukowy; świat nie ma go nadsyłać.
  for (const contract of WORLD_ENGINE_FIELD_CONTRACT) {
    if (contract.provenance !== 'MODEL_DERIVED') continue;
    const key = `${contract.entity}.${contract.field}`;
    if (provided.includes(key)) {
      issues.push({
        severity: 'WARNING',
        rule: 'model-derived-not-supplied-by-world',
        message: `Pole ${key} jest liczone przez Scientific Core (MODEL_DERIVED). World Engine ma je konsumować, nie dostarczać — wartość ze świata zostanie zignorowana.`,
      });
    }
  }

  for (const [i, location] of (payload.locations ?? []).entries()) {
    if (!location.locationId) {
      issues.push({ severity: 'ERROR', rule: 'location-id-required', message: `Miejsce #${i} nie ma stabilnego locationId.` });
    }
    if (!location.locationType || !KNOWN_LOCATION_TYPES.has(location.locationType)) {
      issues.push({
        severity: 'ERROR',
        rule: 'location-type-known',
        message: `Miejsce #${i} ma nieznany locationType „${location.locationType ?? 'brak'}". Dozwolone: ${[...KNOWN_LOCATION_TYPES].join(', ')}.`,
      });
    }
  }

  for (const [i, segment] of (payload.routeSegments ?? []).entries()) {
    if (!segment.segmentId) {
      issues.push({ severity: 'ERROR', rule: 'segment-id-required', message: `Segment #${i} nie ma stabilnego segmentId.` });
    }
    if (!segment.segmentType || !KNOWN_SEGMENT_TYPES.has(segment.segmentType)) {
      issues.push({
        severity: 'ERROR',
        rule: 'segment-type-known',
        message: `Segment #${i} ma nieznany segmentType „${segment.segmentType ?? 'brak'}". Dozwolone: ${[...KNOWN_SEGMENT_TYPES].join(', ')}.`,
      });
    }
    if (segment.length !== undefined && !(segment.length > 0)) {
      issues.push({ severity: 'ERROR', rule: 'segment-length-positive', message: `Segment #${i} ma niedodatnią długość.` });
    }
  }

  const unlockedCapabilities = CAPABILITY_REQUIREMENTS
    .filter((c) => isCapabilityUnlocked(c.capability, provided))
    .map((c) => c.capability);

  return {
    valid: issues.every((issue) => issue.severity !== 'ERROR'),
    issues,
    unlockedCapabilities,
  };
}

/**
 * Wymagania odtwarzalności. Zmiana świata, która zmienia przebieg, MUSI dać
 * DRIFT — inaczej wynik naukowy przestałby być powiązany z warunkami, w których
 * powstał.
 */
export const REPLAY_REQUIREMENTS: readonly string[] = [
  'Identyfikatory miejsc i segmentów są stabilne między przebiegami tej samej mapy.',
  'Mapa świata ma własną wersję i odcisk; wchodzą one do odcisku wejścia przebiegu.',
  'Trasa agenta jest funkcją mapy, celu i ziarna — bez ukrytego stanu i bez zegara ściennego.',
  'Zmiana mapy zmienia odcisk wejścia; ten sam przebieg na innej mapie jest DRIFT, a nie MATCH.',
  'World Engine nie może mutować pozycji, celu ani stanu agenta — jest wyłącznie konsumentem.',
  'Przypisanie agent → gospodarstwo i agent → miejsce pracy jest deterministyczne przy ustalonym ziarnie.',
];

/** Czego ten interfejs nie obejmuje i nie należy tam szukać. */
export const INTERFACE_NOT_MODELED = [
  'contact-duration',
  'location-capacity',
  'ventilation',
  'vehicle-occupancy',
  'workplace-assignment',
  'agent-route-assignment',
  'contact-route-segment-attribution',
] as const;
