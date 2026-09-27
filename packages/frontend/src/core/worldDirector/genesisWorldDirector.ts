import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { buildHistoricalScene, type HistoricalScene } from '../temporalCinematic/temporalCinematicEngine';
import type { CameraPath } from '../temporalCinematic/cameraPath';
import { describeSpacetimeWorld, type SpacetimeWorldDescriptor } from '../temporalCinematic/spacetimeWorldDescriptor';
import { resolveSpacetimeWorldPrompt, type ResolvedSpacetimeWorld } from '../worldModel/generation/spacetimeWorldProposal';

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

/**
 * Natural-language product path for the supported spacetime/world presets.
 * The parser is deterministic and bounded; realization always flows through
 * the canonical WorldSpecification compiler and WorldGenerator.
 */
export type GenesisDirectedPromptWorld = ResolvedSpacetimeWorld & { readonly descriptor: SpacetimeWorldDescriptor };

export function directGenesisPromptWorld(prompt: string): GenesisDirectedPromptWorld {
  const resolved = resolveSpacetimeWorldPrompt(prompt);
  return { ...resolved, descriptor: describeSpacetimeWorld(resolved.runtime.engine.graph, resolved.primaryTemplate) };
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

/** Records the actually generated prompt world, including its deterministic graph fingerprint. */
export function recordDirectedPromptWorld(ledger: EvidenceLedger, directed: GenesisDirectedPromptWorld): string {
  const entities = directed.runtime.engine.graph.listEntities();
  return ledger.addRecord({
    sourceUrl: `genesis://world-director/prompt/${directed.world.generated.worldId}`,
    sourceTimestamp: null,
    claim: `World Director generated and presented canonical prompt world ${directed.world.generated.worldId}; template=${directed.primaryTemplate}; entities=${entities.length}; descriptor=${directed.descriptor.kind}; epistemic=${directed.descriptor.epistemic}; graphFingerprint=${directed.deterministicFingerprint}`,
    claimType: 'model',
    confidence: 1,
    provenance: { sourceKind: 'document', retrievedBy: 'Genesis World Director prompt runtime', independentSourceIds: [] },
  }).record.contentHash;
}

export interface DirectedPromptWorldArtifactEvidence {
  readonly worldId: string;
  readonly template: string;
  readonly descriptorKind: string;
  readonly seconds: number;
  readonly artifactFile: string;
  readonly artifactSha256: string;
  readonly semanticFingerprint: string;
}

/** Links real browser pixels/video from a prompt world to the canonical ledger. */
export function recordDirectedPromptWorldArtifact(
  ledger: EvidenceLedger,
  input: DirectedPromptWorldArtifactEvidence,
): string {
  if (!/^[a-f0-9]{64}$/i.test(input.artifactSha256)) throw new Error('WORLD_DIRECTOR_CAPTURE_INVALID_SHA256');
  if (!/^[a-f0-9]{8,}$/i.test(input.semanticFingerprint)) throw new Error('WORLD_DIRECTOR_CAPTURE_INVALID_FINGERPRINT');
  if (!Number.isFinite(input.seconds) || input.seconds < 0) throw new Error('WORLD_DIRECTOR_CAPTURE_INVALID_TIME');
  return ledger.addRecord({
    sourceUrl: `genesis://world-director/capture/${input.worldId}/${encodeURIComponent(input.artifactFile)}`,
    sourceTimestamp: null,
    claim: `Prompt-world capture ${input.artifactFile}; sha256=${input.artifactSha256}; semanticFingerprint=${input.semanticFingerprint}; world=${input.worldId}; template=${input.template}; descriptor=${input.descriptorKind}; time=${input.seconds}`,
    claimType: 'observation',
    confidence: 1,
    provenance: { sourceKind: 'document', retrievedBy: 'Genesis World Director Cinematic Capture', independentSourceIds: [] },
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
