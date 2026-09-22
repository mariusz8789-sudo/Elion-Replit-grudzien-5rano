import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { buildHistoricalScene, type HistoricalScene } from '../temporalCinematic/temporalCinematicEngine';
import type { CameraPath } from '../temporalCinematic/cameraPath';

/** Product presets resolved through the one canonical WorldSpecification pipeline. */
export type GenesisWorldPreset = 'MODERN_SCIENTIFIC_LAB' | 'MODERN_CITY' | 'HISTORICAL_RECONSTRUCTION';
export type GenesisWorldWeather = 'CLEAR' | 'RAIN' | 'FOG';
export type GenesisWorldLight = 'DAY' | 'NIGHT';
export type GenesisWorldNavigation = 'WALK' | 'OBSERVER' | 'CINEMATIC';

export interface GenesisWorldDirectorRequest {
  readonly preset: GenesisWorldPreset;
  readonly populationEnabled: boolean;
  readonly light: GenesisWorldLight;
  readonly weather: GenesisWorldWeather;
  readonly navigation: GenesisWorldNavigation;
}

export interface GenesisDirectedWorld {
  readonly request: GenesisWorldDirectorRequest;
  readonly scene: HistoricalScene & { readonly camera: CameraPath };
  readonly presentation: {
    readonly viewMode: 'street' | 'interior';
    readonly roomType: 'MATERIALS_LAB' | null;
    readonly weather: string;
    readonly navigationMode: GenesisWorldNavigation;
  };
  readonly proof: {
    readonly pipeline: 'WorldSpecification→compiler→WorldBlueprint→generateWorld→WorldGraph→worldFrameState→THREE';
    readonly worldId: string;
    readonly entityCount: number;
    readonly humanEntityCount: number;
    readonly roomCount: number;
    readonly assetSlotCount: number;
  };
}

const PRESETS: Readonly<Record<GenesisWorldPreset, { readonly place: string; readonly year: number; readonly interior: boolean }>> = {
  MODERN_SCIENTIFIC_LAB: { place: 'Cambridge Science Campus', year: 2026, interior: true },
  MODERN_CITY: { place: 'Warsaw', year: 2026, interior: false },
  HISTORICAL_RECONSTRUCTION: { place: 'Krakow', year: 1896, interior: false },
};

export function directGenesisWorld(request: GenesisWorldDirectorRequest): GenesisDirectedWorld {
  const preset = PRESETS[request.preset];
  const scene = buildHistoricalScene({
    place: preset.place,
    year: preset.year,
    durationSeconds: 28,
    generateInteriors: preset.interior,
    populationEnabled: request.populationEnabled,
    requiredBuildingTypes: request.preset === 'MODERN_SCIENTIFIC_LAB' ? ['RESEARCH_CAMPUS'] : undefined,
  });
  if (!('keyframes' in scene.camera)) throw new Error(`WORLD_DIRECTOR_CAMERA_BLOCKED:${scene.camera.reason}`);
  const entities = scene.world.engine.graph.listEntities();
  const weather = request.light === 'NIGHT' ? `${request.weather}_NIGHT` : request.weather;
  return {
    request,
    scene: scene as HistoricalScene & { readonly camera: CameraPath },
    presentation: {
      viewMode: preset.interior ? 'interior' : 'street',
      roomType: preset.interior ? 'MATERIALS_LAB' : null,
      weather,
      navigationMode: request.navigation,
    },
    proof: {
      pipeline: 'WorldSpecification→compiler→WorldBlueprint→generateWorld→WorldGraph→worldFrameState→THREE',
      worldId: scene.world.worldId,
      entityCount: entities.length,
      humanEntityCount: entities.filter((entity) => entity.ref.kind === 'human').length,
      roomCount: entities.filter((entity) => entity.geometry?.kind === 'ROOM').length,
      assetSlotCount: entities.filter((entity) => entity.geometry?.kind === 'ASSET_SLOT').length,
    },
  };
}

/** Records execution provenance in the existing canonical ledger; no World Director memory exists. */
export function recordDirectedWorld(ledger: EvidenceLedger, directed: GenesisDirectedWorld): string {
  const { request, proof } = directed;
  return ledger.addRecord({
    sourceUrl: `genesis://world-director/${proof.worldId}`,
    sourceTimestamp: null,
    claim: `World Director generated canonical model world ${proof.worldId}; preset=${request.preset}; entities=${proof.entityCount}; humans=${proof.humanEntityCount}; rooms=${proof.roomCount}; assetSlots=${proof.assetSlotCount}; weather=${directed.presentation.weather}; navigation=${request.navigation}`,
    claimType: 'model',
    confidence: 1,
    provenance: { sourceKind: 'document', retrievedBy: 'Genesis World Director', independentSourceIds: [] },
  }).record.contentHash;
}

/** Records the real UI INSPECT command against a canonical generated ASSET_SLOT. */
export function recordDirectedAssetInspection(
  ledger: EvidenceLedger,
  directed: GenesisDirectedWorld,
  selection: { readonly entityId: string; readonly slotType: string },
): string {
  const entity = directed.scene.world.engine.graph.tryGetEntity(selection.entityId);
  if (entity?.geometry?.kind !== 'ASSET_SLOT' || entity.geometry.slotType !== selection.slotType) {
    throw new Error(`WORLD_DIRECTOR_INVALID_ASSET_SELECTION:${selection.entityId}`);
  }
  return ledger.addRecord({
    sourceUrl: `genesis://world-director/${directed.proof.worldId}/asset/${encodeURIComponent(selection.entityId)}`,
    sourceTimestamp: null,
    claim: `INSPECT_ENTITY selected canonical ASSET_SLOT ${selection.entityId}; slotType=${selection.slotType}; world=${directed.proof.worldId}; scientificResult=UNBOUND`,
    claimType: 'observation',
    confidence: 1,
    provenance: { sourceKind: 'document', retrievedBy: 'Genesis World Director UI', independentSourceIds: [] },
  }).record.contentHash;
}
