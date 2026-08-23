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
    const transmissions = counts.get(contactType) ?? 0;
    return {
      contactType,
      transmissions,
      share: total > 0 ? transmissions / total : 0,
      notModeled: CONTACT_TYPES_NOT_MODELED.includes(contactType),
    };
  }).sort((a, b) => b.transmissions - a.transmissions || a.contactType.localeCompare(b.contactType));

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
