import type { AgeBand } from '../agents/cohortModel';
import { AGE_BANDS } from '../agents/cohortModel';
import {
  CONTACT_TYPES,
  CONTACT_TYPES_NOT_MODELED,
  type ContactType,
  type TransmissionEdge,
} from './contactNetwork';

/**
 * CLUSTER ANALYSIS — ogniska wyprowadzone z REALNYCH zdarzeń transmisji.
 *
 * Nic tu nie jest wykrywane heurystyką ani dopasowywane do oczekiwanego
 * kształtu. Klaster to zbiór faktycznych krawędzi transmisji, które zaszły w
 * tym samym miejscu albo w tym samym gospodarstwie. Jeżeli zdarzeń nie ma,
 * klastrów nie ma — pusty wynik jest wynikiem.
 *
 * Typy kontaktu, których model nie zna (praca, transport), nie mogą tu
 * wystąpić i są jawnie wymienione jako niemodelowane, żeby zero przy WORK nie
 * zostało przeczytane jako „w pracy nikt się nie zaraża".
 */

export const CLUSTER_ANALYSIS_VERSION = '1.0.0';

/** Ile transmisji w jednym miejscu czyni z niego ognisko. */
export const DEFAULT_CLUSTER_MIN_SIZE = 2;

export interface TransmissionCluster {
  clusterId: string;
  kind: 'household' | 'location' | 'contact-type';
  contactType: ContactType;
  locationIndex: number;
  transmissions: number;
  infectedIds: readonly number[];
  targetBands: Record<AgeBand, number>;
  firstDay: number;
  lastDay: number;
}

export interface ContactTypeAttribution {
  contactType: ContactType;
  transmissions: number;
  share: number;
  /** Ustawione dla typów, których model nie zna — zero nie znaczy tu „brak zakażeń". */
  notModeled: boolean;
  /** Transmisje, w których cel STAŁ w danym miejscu (dotarł do celu podróży). */
  dwellTransmissions: number;
  /**
   * Transmisje, w których cel był W DRODZE. Dla budynku znaczy to, że agent
   * PRZECHODZIŁ przez jego obrys po linii prostej, a nie że tam poszedł —
   * przypisanie miejsca jest wtedy artefaktem geometrii ruchu.
   */
  transitTransmissions: number;
}

/**
 * Jakość przypisania miejsca dla całego przebiegu.
 *
 * Ruch po liniach prostych sprawia, że agent mija (i przecina) obiekty, których
 * nie wybrał. Im większy udział transmisji „w drodze", tym mniej wiarygodne
 * jest zdanie „to zakażenie zaszło w szkole". Ta liczba jest raportowana
 * zawsze, żeby nikt nie czytał atrybucji miejsca jako pewnej.
 */
export interface LocationAttributionQuality {
  /** Udział transmisji, w których cel był w ruchu. */
  transitShare: number;
  /** Transmisje przypisane do budynku, choć agent tylko przez niego przechodził. */
  transitInsideBuildings: number;
  /** Transmisje przypisane do budynku, w którym agent faktycznie przebywał. */
  dwellInsideBuildings: number;
  /** HIGH: prawie wszystko w postoju. LOW: większość w tranzycie. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  caveat: string;
}

export interface CrossCohortFlow {
  from: AgeBand;
  to: AgeBand;
  transmissions: number;
  /** Z podziałem na typ kontaktu — stąd wiadomo, KTÓRĘDY biegnie zakażenie. */
  byContactType: Record<string, number>;
}

export interface ClusterAnalysis {
  contractVersion: string;
  totalTransmissions: number;
  attribution: readonly ContactTypeAttribution[];
  householdClusters: readonly TransmissionCluster[];
  locationClusters: readonly TransmissionCluster[];
  crossCohortFlows: readonly CrossCohortFlow[];
  notModeledContactTypes: readonly ContactType[];
  /** Transmisje, których typu nie dało się ustalić. Nigdy nie zgadywane. */
  unknownContactTypeTransmissions: number;
  /** Na ile w ogóle wolno wierzyć przypisaniu miejsca w tym przebiegu. */
  locationAttribution: LocationAttributionQuality;
}

function emptyBands(): Record<AgeBand, number> {
  return { child: 0, adult: 0, senior: 0 };
}

function buildClusters(
  edges: readonly TransmissionEdge[],
  keyOf: (e: TransmissionEdge) => string | null,
  kind: TransmissionCluster['kind'],
  minSize: number,
): TransmissionCluster[] {
  const groups = new Map<string, TransmissionEdge[]>();
  for (const edge of edges) {
    const key = keyOf(edge);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(edge);
    else groups.set(key, [edge]);
  }
  const clusters: TransmissionCluster[] = [];
  for (const [key, group] of groups) {
    if (group.length < minSize) continue;
    const targetBands = emptyBands();
    for (const e of group) targetBands[e.targetBand]++;
    clusters.push({
      clusterId: `${kind}:${key}`,
      kind,
      contactType: group[0].contactType,
      locationIndex: group[0].locationIndex,
      transmissions: group.length,
      infectedIds: group.map((e) => e.target),
      targetBands,
      firstDay: Math.min(...group.map((e) => e.time)),
      lastDay: Math.max(...group.map((e) => e.time)),
    });
  }
  return clusters.sort((a, b) => b.transmissions - a.transmissions || a.clusterId.localeCompare(b.clusterId));
}

/**
 * Analizuje realny graf transmisji przebiegu.
 *
 * Wszystkie liczby pochodzą z krawędzi zapisanych przez model w chwili
 * zakażenia. Analiza niczego nie dolicza i nie wygładza.
 */
export function analyseTransmissionClusters(
  edges: readonly TransmissionEdge[],
  minClusterSize = DEFAULT_CLUSTER_MIN_SIZE,
): ClusterAnalysis {
  const total = edges.length;

  const counts = new Map<ContactType, number>();
  for (const edge of edges) counts.set(edge.contactType, (counts.get(edge.contactType) ?? 0) + 1);

  const attribution = CONTACT_TYPES.map((contactType) => {
    const ofType = edges.filter((e) => e.contactType === contactType);
    const transitTransmissions = ofType.filter((e) => e.targetInTransit).length;
    return {
      contactType,
      transmissions: ofType.length,
      share: total > 0 ? ofType.length / total : 0,
      notModeled: CONTACT_TYPES_NOT_MODELED.includes(contactType),
      dwellTransmissions: ofType.length - transitTransmissions,
      transitTransmissions,
    };
  }).sort((a, b) => b.transmissions - a.transmissions || a.contactType.localeCompare(b.contactType));

  const inTransit = edges.filter((e) => e.targetInTransit).length;
  const insideBuildings = edges.filter((e) => e.locationIndex >= 0);
  const transitInsideBuildings = insideBuildings.filter((e) => e.targetInTransit).length;
  const transitShare = total > 0 ? inTransit / total : 0;
  const locationAttribution: LocationAttributionQuality = {
    transitShare,
    transitInsideBuildings,
    dwellInsideBuildings: insideBuildings.length - transitInsideBuildings,
    confidence: transitShare >= 0.5 ? 'LOW' : transitShare >= 0.2 ? 'MEDIUM' : 'HIGH',
    caveat:
      'Agenci poruszają się po liniach prostych między obiektami, więc przecinają obrysy budynków, których nie wybrali. Transmisje oznaczone jako „w drodze" mają przypisane miejsce wynikające z geometrii ruchu, a nie z decyzji agenta — i nie wolno ich czytać jako zakażeń „w szkole" czy „w sklepie".',
  };

  const flowMap = new Map<string, CrossCohortFlow>();
  for (const edge of edges) {
    const key = `${edge.sourceBand}->${edge.targetBand}`;
    let flow = flowMap.get(key);
    if (!flow) {
      flow = { from: edge.sourceBand, to: edge.targetBand, transmissions: 0, byContactType: {} };
      flowMap.set(key, flow);
    }
    flow.transmissions++;
    flow.byContactType[edge.contactType] = (flow.byContactType[edge.contactType] ?? 0) + 1;
  }
  const crossCohortFlows = [...flowMap.values()].sort(
    (a, b) => b.transmissions - a.transmissions
      || AGE_BANDS.indexOf(a.from) - AGE_BANDS.indexOf(b.from)
      || AGE_BANDS.indexOf(a.to) - AGE_BANDS.indexOf(b.to),
  );

  return {
    contractVersion: CLUSTER_ANALYSIS_VERSION,
    totalTransmissions: total,
    attribution,
    householdClusters: buildClusters(edges, (e) => (e.householdId === null ? null : String(e.householdId)), 'household', minClusterSize),
    locationClusters: buildClusters(
      edges,
      (e) => (e.locationIndex < 0 ? null : `${e.contactType}#${e.locationIndex}`),
      'location',
      minClusterSize,
    ),
    crossCohortFlows,
    notModeledContactTypes: CONTACT_TYPES_NOT_MODELED,
    unknownContactTypeTransmissions: counts.get('UNKNOWN_CONTACT_TYPE') ?? 0,
    locationAttribution,
  };
}

/** Typ kontaktu odpowiadający za najwięcej transmisji; null przy braku zdarzeń. */
export function dominantContactType(analysis: ClusterAnalysis): ContactType | null {
  const ranked = analysis.attribution.filter((a) => !a.notModeled && a.transmissions > 0);
  return ranked.length > 0 ? ranked[0].contactType : null;
}

/** Udział transmisji, które dotarły do danego pasma daną drogą kontaktu. */
export function shareIntoBand(analysis: ClusterAnalysis, band: AgeBand, contactType: ContactType): number {
  let into = 0;
  let viaType = 0;
  for (const flow of analysis.crossCohortFlows) {
    if (flow.to !== band) continue;
    into += flow.transmissions;
    viaType += flow.byContactType[contactType] ?? 0;
  }
  return into > 0 ? viaType / into : 0;
}
