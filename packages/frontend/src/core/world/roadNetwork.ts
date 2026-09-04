import type { CityLayout } from './cityWorld';

/**
 * WORLD ENGINE ROUTING — deterministyczna sieć ulic tego samego CityLayout,
 * który czytają renderer i Scientific Core. Ta warstwa dostarcza geometrię
 * tras; nie wybiera celu, nie przesuwa stanu choroby i nie liczy transmisji.
 */

export type RouteSegmentType = 'ROAD' | 'SIDEWALK' | 'CROSSING' | 'INDOOR';

export interface WorldPoint {
  x: number;
  y: number;
}

export interface RouteSegment {
  segmentId: string;
  segmentType: RouteSegmentType;
  from: WorldPoint;
  to: WorldPoint;
  length: number;
}

export interface CityRoute {
  routeId: string;
  segments: readonly RouteSegment[];
  length: number;
}

export interface CityRoadNetwork {
  mapId: string;
  mapVersion: string;
  mapFingerprint: string;
  horizontalStreetYs: readonly number[];
  verticalStreetXs: readonly number[];
  sidewalkOffset: number;
  segments: readonly RouteSegment[];
}

const MAP_ID = 'genesis-city-grid';
const MAP_VERSION = '1.0.0';
const SIDEWALK_OFFSET = 10;

function point(x: number, y: number): WorldPoint { return { x, y }; }

function length(from: WorldPoint, to: WorldPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function segment(segmentId: string, segmentType: RouteSegmentType, from: WorldPoint, to: WorldPoint): RouteSegment {
  return { segmentId, segmentType, from, to, length: length(from, to) };
}

function nearestIndex(values: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
  }
  return best;
}

/** Buduje segmenty z tych samych linii ulic, które renderer rysuje jako drogi, chodniki i przejścia. */
export function buildRoadNetwork(layout: CityLayout): CityRoadNetwork {
  const segments: RouteSegment[] = [];
  for (const [row, y] of layout.streetsH.entries()) {
    segments.push(segment(`road:h:${row}`, 'ROAD', point(0, y), point(layout.width, y)));
    segments.push(segment(`sidewalk:h:${row}:north`, 'SIDEWALK', point(0, y - SIDEWALK_OFFSET), point(layout.width, y - SIDEWALK_OFFSET)));
    segments.push(segment(`sidewalk:h:${row}:south`, 'SIDEWALK', point(0, y + SIDEWALK_OFFSET), point(layout.width, y + SIDEWALK_OFFSET)));
  }
  for (const [column, x] of layout.streetsV.entries()) {
    segments.push(segment(`road:v:${column}`, 'ROAD', point(x, 0), point(x, layout.height)));
    segments.push(segment(`sidewalk:v:${column}:west`, 'SIDEWALK', point(x - SIDEWALK_OFFSET, 0), point(x - SIDEWALK_OFFSET, layout.height)));
    segments.push(segment(`sidewalk:v:${column}:east`, 'SIDEWALK', point(x + SIDEWALK_OFFSET, 0), point(x + SIDEWALK_OFFSET, layout.height)));
  }
  for (const [column, x] of layout.streetsV.entries()) {
    for (const [row, y] of layout.streetsH.entries()) {
      segments.push(segment(`crossing:${column}:${row}:horizontal`, 'CROSSING', point(x - SIDEWALK_OFFSET, y - SIDEWALK_OFFSET), point(x + SIDEWALK_OFFSET, y - SIDEWALK_OFFSET)));
      segments.push(segment(`crossing:${column}:${row}:vertical`, 'CROSSING', point(x - SIDEWALK_OFFSET, y - SIDEWALK_OFFSET), point(x - SIDEWALK_OFFSET, y + SIDEWALK_OFFSET)));
    }
  }
  const mapFingerprint = [MAP_ID, MAP_VERSION, layout.width, layout.height, ...layout.streetsH, ...layout.streetsV, ...layout.buildings.map((building) => building.id)].join('|');
  return {
    mapId: MAP_ID,
    mapVersion: MAP_VERSION,
    mapFingerprint,
    horizontalStreetYs: [...layout.streetsH],
    verticalStreetXs: [...layout.streetsV],
    sidewalkOffset: SIDEWALK_OFFSET,
    segments,
  };
}

/**
 * Zwraca trasę pieszego przez rzeczywistą siatkę chodników. Odcinki INDOOR
 * znaczą wyłącznie dojście od aktualnej pozycji do najbliższego chodnika; nie
 * opisują pojemności, wentylacji ani czasu kontaktu — te pola pozostają NOT_MODELED.
 */
export function planCityRoute(
  network: CityRoadNetwork,
  from: WorldPoint,
  to: WorldPoint,
  sourceId: string,
  destinationId: string,
  ordinal: number,
): CityRoute {
  const fromColumn = nearestIndex(network.verticalStreetXs, from.x);
  const fromRow = nearestIndex(network.horizontalStreetYs, from.y);
  const toColumn = nearestIndex(network.verticalStreetXs, to.x);
  const toRow = nearestIndex(network.horizontalStreetYs, to.y);
  const fromGate = point(network.verticalStreetXs[fromColumn] - network.sidewalkOffset, network.horizontalStreetYs[fromRow] - network.sidewalkOffset);
  const toGate = point(network.verticalStreetXs[toColumn] - network.sidewalkOffset, network.horizontalStreetYs[toRow] - network.sidewalkOffset);
  const routeId = `${sourceId}->${destinationId}:${ordinal}`;
  const segments: RouteSegment[] = [];
  const add = (segmentId: string, segmentType: RouteSegmentType, start: WorldPoint, end: WorldPoint) => {
    if (length(start, end) > 0.001) segments.push(segment(segmentId, segmentType, start, end));
  };

  add(`indoor:${sourceId}:${ordinal}`, 'INDOOR', from, fromGate);
  const turn = point(fromGate.x, toGate.y);
  add(`sidewalk:v:${fromColumn}:west`, 'SIDEWALK', fromGate, turn);
  if (fromColumn !== toColumn) {
    const afterFromCrossing = point(turn.x + network.sidewalkOffset * 2, turn.y);
    const beforeToCrossing = point(toGate.x - network.sidewalkOffset * 2, toGate.y);
    add(`crossing:${fromColumn}:${toRow}:horizontal`, 'CROSSING', turn, afterFromCrossing);
    add(`sidewalk:h:${toRow}:north`, 'SIDEWALK', afterFromCrossing, beforeToCrossing);
    add(`crossing:${toColumn}:${toRow}:horizontal`, 'CROSSING', beforeToCrossing, toGate);
  }
  add(`indoor:${destinationId}:${ordinal}`, 'INDOOR', toGate, to);
  return { routeId, segments, length: segments.reduce((sum, entry) => sum + entry.length, 0) };
}

/** Głęboka, niemutowalna dla konsumenta kopia topologii sieci. */
export function copyRoadNetwork(network: CityRoadNetwork): CityRoadNetwork {
  return {
    ...network,
    horizontalStreetYs: [...network.horizontalStreetYs],
    verticalStreetXs: [...network.verticalStreetXs],
    segments: network.segments.map((entry) => ({ ...entry, from: { ...entry.from }, to: { ...entry.to } })),
  };
}
