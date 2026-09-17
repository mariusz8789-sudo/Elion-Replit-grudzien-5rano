import { generateCity, fbm2 } from '../../../../core/src/city-enterprise/GenesisCityGenerator.js';
import type { CityGrid, CityProfileId, TransportNode, Building } from '../../../../core/src/city-enterprise/GenesisCityGenerator.js';
export type { CityGrid, CityProfileId, TransportNode, Building };
export interface DigitalTwinHandle {
  readonly grid: CityGrid;
  elevationAt(x: number, y: number): number;
  zoneAt(x: number, y: number): number;
  neighbors(cell: number): number[];
  transportNodes(): readonly TransportNode[];
  buildingsInZone(zone: number): Building[];
  serialize(): string;
}
/** View-model adapter over the core generator for renderers/UI. Deterministic; no physics here. */
export function createDigitalTwin(seed: number, profileId: CityProfileId): DigitalTwinHandle {
  const grid = generateCity(seed, profileId); const N = grid.gridSize;
  return {
    grid,
    elevationAt: (x, y) => grid.elevation[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))],
    zoneAt: (x, y) => grid.zones[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))],
    neighbors: (cell) => { const x = cell % N, y = Math.floor(cell / N); const out: number[] = []; if (x > 0) out.push(cell - 1); if (x < N - 1) out.push(cell + 1); if (y > 0) out.push(cell - N); if (y < N - 1) out.push(cell + N); return out; },
    transportNodes: () => grid.nodes,
    buildingsInZone: (zone) => grid.buildings.filter(b => b.zone === zone),
    serialize: () => JSON.stringify({ seed, profileId, fingerprint: grid.fingerprint }),
  };
}
export { fbm2 };
