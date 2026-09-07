import { canonicalJson, fnv1a } from './hash';
import type { GenesisEvent } from './genesisEvent';

/**
 * Read-only analytic projection of real `infection.transmission` events.
 *
 * This module never ticks EpidemicCitySimulation, mutates EventRegistry, creates
 * events, or invents a location class. It groups only model-provenanced
 * transmission events that already exist in the canonical EventRegistry.
 */
export const EPIDEMIC_TRANSMISSION_ANALYSIS_VERSION = '1.0.0';

export type EpidemicTransmissionAnalysisStatus =
  | 'AVAILABLE'
  | 'NO_TRANSMISSIONS'
  | 'BLOCKED_INCOMPLETE_PROVENANCE'
  | 'BLOCKED_DUPLICATE_EVENT_ID';

export interface TransmissionGraphNode {
  agentId: number;
  outgoingTransmissionCount: number;
  incomingTransmissionCount: number;
}

export interface TransmissionGraphEdge {
  sourceAgentId: number;
  targetAgentId: number;
  transmissionCount: number;
  firstTimestamp: number;
  lastTimestamp: number;
  eventIds: readonly string[];
}

/** A deterministic grid aggregate of exact model event coordinates, not a venue label. */
export interface TransmissionHotspot {
  cellId: string;
  cellSizeWorldUnits: number;
  transmissionCount: number;
  uniqueSourceAgents: number;
  uniqueTargetAgents: number;
  firstTimestamp: number;
  lastTimestamp: number;
  centroid: { x: number; y: number };
  eventIds: readonly string[];
}

export interface EpidemicTransmissionAnalysis {
  contractVersion: string;
  status: EpidemicTransmissionAnalysisStatus;
  /** Model output, never an observed-world outbreak assessment. */
  classification: 'SIMULATED_MODEL_OUTPUT';
  analysisFingerprint: string;
  eventIds: readonly string[];
  rejectedEventIds: readonly string[];
  sourceModelIds: readonly string[];
  experimentIds: readonly string[];
  seedValues: readonly (string | number)[];
  parameterHashes: readonly string[];
  metrics: {
    transmissionCount: number;
    uniqueSourceAgents: number;
    uniqueTargetAgents: number;
    largestSourceTransmissionCount: number;
    peakTransmissionTimestamp: number | null;
    peakTransmissionCountAtTimestamp: number;
  };
  graph: {
    nodes: readonly TransmissionGraphNode[];
    edges: readonly TransmissionGraphEdge[];
  };
  hotspots: readonly TransmissionHotspot[];
  limitations: readonly string[];
}

export interface EpidemicTransmissionAnalysisOptions {
  /** Explicit, model-coordinate grid used only to aggregate exact event locations. */
  cellSizeWorldUnits?: number;
}

type ValidTransmission = GenesisEvent & {
  source: { kind: 'agent'; id: number };
  affectedEntities: readonly [{ kind: 'agent'; id: number }, ...{ kind: string; id: string | number }[]];
  location: { x: number; y: number; z?: number };
  provenance: { origin: 'model'; modelId: string; experimentId?: string; seed?: string | number; paramsHash?: string };
};

function numberAgentId(value: string | number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function asValidTransmission(event: GenesisEvent): ValidTransmission | null {
  if (event.type !== 'infection.transmission' || event.provenance?.origin !== 'model') return null;
  if (!event.modelId || event.modelId !== event.provenance.modelId) return null;
  if (!event.source || event.source.kind !== 'agent' || numberAgentId(event.source.id) === null) return null;
  const target = event.affectedEntities.find((entity) => entity.kind === 'agent');
  if (!target || numberAgentId(target.id) === null || !event.location) return null;
  if (!Number.isFinite(event.location.x) || !Number.isFinite(event.location.y)) return null;
  return event as ValidTransmission;
}

function sortedUnique<T>(values: readonly T[], compare: (left: T, right: T) => number): T[] {
  return [...new Set(values)].sort(compare);
}

function emptyAnalysis(
  status: EpidemicTransmissionAnalysisStatus,
  eventIds: readonly string[],
  rejectedEventIds: readonly string[],
  cellSizeWorldUnits: number,
): EpidemicTransmissionAnalysis {
  const seed = { contractVersion: EPIDEMIC_TRANSMISSION_ANALYSIS_VERSION, status, eventIds, rejectedEventIds, cellSizeWorldUnits };
  return {
    contractVersion: EPIDEMIC_TRANSMISSION_ANALYSIS_VERSION,
    status,
    classification: 'SIMULATED_MODEL_OUTPUT',
    analysisFingerprint: `epidemic_transmission_analysis_${fnv1a(canonicalJson(seed))}`,
    eventIds,
    rejectedEventIds,
    sourceModelIds: [], experimentIds: [], seedValues: [], parameterHashes: [],
    metrics: {
      transmissionCount: 0, uniqueSourceAgents: 0, uniqueTargetAgents: 0,
      largestSourceTransmissionCount: 0, peakTransmissionTimestamp: null, peakTransmissionCountAtTimestamp: 0,
    },
    graph: { nodes: [], edges: [] },
    hotspots: [],
    limitations: [
      'Analiza dotyczy wyłącznie zdarzeń infection.transmission wyemitowanych przez model; nie jest obserwacją ani prognozą świata rzeczywistego.',
      'Brak klasyfikacji budynku lub czasu kontaktu: kontrakt transmisji udostępnia jedynie modelowy czas, źródło, cel i współrzędne.',
      `Siatka hotspotów ma rozmiar ${cellSizeWorldUnits} jednostek świata i agreguje dokładne współrzędne zdarzeń; nie wyznacza administracyjnych dzielnic ani przyczyny transmisji.`,
    ],
  };
}

/**
 * Creates a deterministic analytic receipt from canonical, read-only events.
 * Any malformed or unprovenanced transmission blocks the conclusion rather than
 * silently dropping it, so a mixed stream cannot be presented as a real graph.
 */
export function analyseEpidemicTransmissionEvents(
  events: readonly GenesisEvent[],
  options: EpidemicTransmissionAnalysisOptions = {},
): EpidemicTransmissionAnalysis {
  const cellSizeWorldUnits = options.cellSizeWorldUnits ?? 100;
  if (!Number.isFinite(cellSizeWorldUnits) || cellSizeWorldUnits <= 0) {
    throw new Error('cellSizeWorldUnits must be a finite number greater than zero.');
  }

  const transmissionEvents = events.filter((event) => event.type === 'infection.transmission');
  const eventIds = transmissionEvents.map((event) => event.id);
  const duplicateIds = eventIds.filter((id, index) => eventIds.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    return emptyAnalysis('BLOCKED_DUPLICATE_EVENT_ID', eventIds, sortedUnique(duplicateIds, (a, b) => a.localeCompare(b)), cellSizeWorldUnits);
  }
  if (transmissionEvents.length === 0) {
    return emptyAnalysis('NO_TRANSMISSIONS', [], [], cellSizeWorldUnits);
  }

  const accepted: ValidTransmission[] = [];
  const rejectedEventIds: string[] = [];
  for (const event of transmissionEvents) {
    const valid = asValidTransmission(event);
    if (valid) accepted.push(valid);
    else rejectedEventIds.push(event.id);
  }
  if (rejectedEventIds.length > 0) {
    return emptyAnalysis('BLOCKED_INCOMPLETE_PROVENANCE', eventIds, rejectedEventIds.sort(), cellSizeWorldUnits);
  }

  const sourceCounts = new Map<number, number>();
  const targetCounts = new Map<number, number>();
  const edges = new Map<string, { sourceAgentId: number; targetAgentId: number; timestamps: number[]; eventIds: string[] }>();
  const cells = new Map<string, { x: number; y: number; sourceIds: Set<number>; targetIds: Set<number>; timestamps: number[]; eventIds: string[] }>();
  const countsAtTime = new Map<number, number>();

  for (const event of accepted) {
    const sourceAgentId = numberAgentId(event.source.id)!;
    const target = event.affectedEntities.find((entity) => entity.kind === 'agent')!;
    const targetAgentId = numberAgentId(target.id)!;
    sourceCounts.set(sourceAgentId, (sourceCounts.get(sourceAgentId) ?? 0) + 1);
    targetCounts.set(targetAgentId, (targetCounts.get(targetAgentId) ?? 0) + 1);
    countsAtTime.set(event.timestamp, (countsAtTime.get(event.timestamp) ?? 0) + 1);

    const edgeKey = `${sourceAgentId}->${targetAgentId}`;
    const edge = edges.get(edgeKey) ?? { sourceAgentId, targetAgentId, timestamps: [], eventIds: [] };
    edge.timestamps.push(event.timestamp); edge.eventIds.push(event.id); edges.set(edgeKey, edge);

    const col = Math.floor(event.location.x / cellSizeWorldUnits);
    const row = Math.floor(event.location.y / cellSizeWorldUnits);
    const cellId = `${col}:${row}`;
    const cell = cells.get(cellId) ?? { x: 0, y: 0, sourceIds: new Set<number>(), targetIds: new Set<number>(), timestamps: [], eventIds: [] };
    cell.x += event.location.x; cell.y += event.location.y;
    cell.sourceIds.add(sourceAgentId); cell.targetIds.add(targetAgentId);
    cell.timestamps.push(event.timestamp); cell.eventIds.push(event.id); cells.set(cellId, cell);
  }

  const nodes = sortedUnique([...sourceCounts.keys(), ...targetCounts.keys()], (a, b) => a - b).map((agentId) => ({
    agentId,
    outgoingTransmissionCount: sourceCounts.get(agentId) ?? 0,
    incomingTransmissionCount: targetCounts.get(agentId) ?? 0,
  }));
  const graphEdges = [...edges.values()].map((edge) => ({
    sourceAgentId: edge.sourceAgentId,
    targetAgentId: edge.targetAgentId,
    transmissionCount: edge.eventIds.length,
    firstTimestamp: Math.min(...edge.timestamps),
    lastTimestamp: Math.max(...edge.timestamps),
    eventIds: edge.eventIds.sort(),
  })).sort((left, right) => right.transmissionCount - left.transmissionCount
    || left.sourceAgentId - right.sourceAgentId || left.targetAgentId - right.targetAgentId);
  const hotspots = [...cells.entries()].map(([cellId, cell]) => ({
    cellId,
    cellSizeWorldUnits,
    transmissionCount: cell.eventIds.length,
    uniqueSourceAgents: cell.sourceIds.size,
    uniqueTargetAgents: cell.targetIds.size,
    firstTimestamp: Math.min(...cell.timestamps),
    lastTimestamp: Math.max(...cell.timestamps),
    centroid: { x: cell.x / cell.eventIds.length, y: cell.y / cell.eventIds.length },
    eventIds: cell.eventIds.sort(),
  })).sort((left, right) => right.transmissionCount - left.transmissionCount || left.cellId.localeCompare(right.cellId));
  const peakTime = [...countsAtTime.entries()].sort(([leftTime, leftCount], [rightTime, rightCount]) => rightCount - leftCount || leftTime - rightTime)[0];
  const sourceModelIds = sortedUnique(accepted.map((event) => event.provenance.modelId), (a, b) => a.localeCompare(b));
  const experimentIds = sortedUnique(accepted.flatMap((event) => event.provenance.experimentId === undefined ? [] : [event.provenance.experimentId]), (a, b) => a.localeCompare(b));
  const seedValues = sortedUnique(accepted.flatMap((event) => event.provenance.seed === undefined ? [] : [event.provenance.seed]), (a, b) => String(a).localeCompare(String(b)));
  const parameterHashes = sortedUnique(accepted.flatMap((event) => event.provenance.paramsHash === undefined ? [] : [event.provenance.paramsHash]), (a, b) => a.localeCompare(b));
  const analysisSeed = {
    contractVersion: EPIDEMIC_TRANSMISSION_ANALYSIS_VERSION,
    eventIds: eventIds.slice().sort(), sourceModelIds, experimentIds, seedValues, parameterHashes,
    metrics: { transmissionCount: accepted.length, uniqueSourceAgents: sourceCounts.size, uniqueTargetAgents: targetCounts.size },
    graphEdges, hotspots,
  };

  return {
    contractVersion: EPIDEMIC_TRANSMISSION_ANALYSIS_VERSION,
    status: 'AVAILABLE',
    classification: 'SIMULATED_MODEL_OUTPUT',
    analysisFingerprint: `epidemic_transmission_analysis_${fnv1a(canonicalJson(analysisSeed))}`,
    eventIds: eventIds.slice().sort(),
    rejectedEventIds: [],
    sourceModelIds, experimentIds, seedValues, parameterHashes,
    metrics: {
      transmissionCount: accepted.length,
      uniqueSourceAgents: sourceCounts.size,
      uniqueTargetAgents: targetCounts.size,
      largestSourceTransmissionCount: Math.max(...sourceCounts.values()),
      peakTransmissionTimestamp: peakTime?.[0] ?? null,
      peakTransmissionCountAtTimestamp: peakTime?.[1] ?? 0,
    },
    graph: { nodes, edges: graphEdges },
    hotspots,
    limitations: [
      'Analiza dotyczy wyłącznie zdarzeń infection.transmission wyemitowanych przez model; nie jest obserwacją ani prognozą świata rzeczywistego.',
      'Graf pokazuje zarejestrowane transmisje modelu, a nie pełną sieć wszystkich kontaktów; brak eventu transmisji nie dowodzi braku kontaktu.',
      'Kontrakt transmisji nie dostarcza typu miejsca, czasu trwania kontaktu, zasobów ochrony zdrowia ani relacji przyczynowej wykraczającej poza proximity-contact.',
      `Siatka hotspotów ma rozmiar ${cellSizeWorldUnits} jednostek świata i agreguje dokładne współrzędne zdarzeń; nie wyznacza administracyjnych dzielnic ani przyczyny transmisji.`,
    ],
  };
}

export function serializeEpidemicTransmissionAnalysis(analysis: EpidemicTransmissionAnalysis): string {
  return canonicalJson(analysis);
}
