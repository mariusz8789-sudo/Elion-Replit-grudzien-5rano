import type { GenesisSpatialDataset, SpatialLayer } from '../experimentFabric/spatialImport';

export interface ProjectedSpatialFeature {
  sourceId: string;
  layer: SpatialLayer;
  geometry: {
    kind: 'line' | 'polygon';
    coordinates: readonly (readonly [number, number])[];
  };
  tags: Readonly<Record<string, string>>;
}

/**
 * Static, read-only map layer for the existing city renderer. It is derived
 * solely from a provenance-carrying spatial dataset and contains no agents,
 * simulation clock or mutable epidemiological state.
 */
export interface SpatialWorldOverlay {
  kind: 'read-only-spatial-overlay';
  datasetId: string;
  attribution: string;
  license: string;
  sourceUrl: string;
  sourceTimestamp: string;
  worldWidth: number;
  worldHeight: number;
  layers: Readonly<Record<SpatialLayer, readonly ProjectedSpatialFeature[]>>;
}

function projectCoordinate(
  coordinate: readonly [number, number],
  bbox: readonly [number, number, number, number],
  worldWidth: number,
  worldHeight: number,
): readonly [number, number] {
  const [west, south, east, north] = bbox;
  const [lon, lat] = coordinate;
  return [
    ((lon - west) / (east - west)) * worldWidth,
    (1 - ((lat - south) / (north - south))) * worldHeight,
  ];
}

/**
 * Converts the bounded EPSG:4326 source geometry into existing world-space
 * coordinates. This function is deterministic and never modifies `dataset`.
 */
export function createSpatialWorldOverlay(
  dataset: GenesisSpatialDataset,
  worldWidth: number,
  worldHeight: number,
): SpatialWorldOverlay {
  if (!Number.isFinite(worldWidth) || !Number.isFinite(worldHeight) || worldWidth <= 0 || worldHeight <= 0) {
    throw new Error('World dimensions for a spatial overlay must be finite positive numbers.');
  }
  const layers: Record<SpatialLayer, ProjectedSpatialFeature[]> = {
    buildings: [], roads: [], rail: [], water: [], boundaries: [],
  };
  for (const layer of Object.keys(layers) as SpatialLayer[]) {
    layers[layer] = dataset.layers[layer].map((feature) => ({
      sourceId: feature.sourceId,
      layer: feature.layer,
      geometry: {
        kind: feature.geometry.kind,
        coordinates: feature.geometry.coordinates.map((coordinate) => projectCoordinate(coordinate, dataset.bbox, worldWidth, worldHeight)),
      },
      tags: feature.tags,
    }));
  }

  return {
    kind: 'read-only-spatial-overlay',
    datasetId: dataset.datasetId,
    attribution: dataset.attribution,
    license: dataset.license,
    sourceUrl: dataset.sourceUrl,
    sourceTimestamp: dataset.sourceTimestamp,
    worldWidth,
    worldHeight,
    layers,
  };
}
