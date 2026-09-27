import type { LabStation } from './types';
import { GENESIS_LAB_EQUIPMENT, GENESIS_LAB_STATIONS } from './labStations';
import { REALISTIC_LAB_MATERIALS, createCinematicLabRealismProfile, createHumanVisualProfile } from './realism';

export interface SceneNodeSpec {
  readonly id: string;
  readonly kind: 'ARCHITECTURE' | 'FURNITURE' | 'EQUIPMENT' | 'LIGHT' | 'SIGNAGE' | 'PARTICLE' | 'MATERIAL';
  readonly positionMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly assetSlot?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface GenesisBiologyLabScene {
  readonly sceneId: string;
  readonly dimensionsMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly stations: readonly LabStation[];
  readonly equipment: typeof GENESIS_LAB_EQUIPMENT;
  readonly nodes: readonly SceneNodeSpec[];
  readonly realism: ReturnType<typeof createCinematicLabRealismProfile>;
  readonly humanVisual: ReturnType<typeof createHumanVisualProfile>;
  readonly materials: typeof REALISTIC_LAB_MATERIALS;
}

export function createGenesisBiologyLabScene(): GenesisBiologyLabScene {
  const nodes: SceneNodeSpec[] = [
    { id: 'arch.floor', kind: 'ARCHITECTURE', positionMeters: { x: 0, y: 0, z: 0 }, assetSlot: 'lab.architecture.floor.modular' },
    { id: 'arch.ceiling', kind: 'ARCHITECTURE', positionMeters: { x: 0, y: 4.2, z: 0 }, assetSlot: 'lab.architecture.ceiling.modular' },
    { id: 'arch.glass-wall.north', kind: 'ARCHITECTURE', positionMeters: { x: 0, y: 2.1, z: -10 }, assetSlot: 'lab.architecture.glass-wall.north' },
    { id: 'arch.glass-wall.south', kind: 'ARCHITECTURE', positionMeters: { x: 0, y: 2.1, z: 10 }, assetSlot: 'lab.architecture.glass-wall.south' },
    { id: 'light.key.01', kind: 'LIGHT', positionMeters: { x: -5, y: 3.9, z: -4 }, metadata: { temperatureK: 5200, lumens: 12000 } },
    { id: 'light.fill.01', kind: 'LIGHT', positionMeters: { x: 5, y: 3.4, z: 2 }, metadata: { temperatureK: 4300, lumens: 7000 } },
    { id: 'light.rim.01', kind: 'LIGHT', positionMeters: { x: 0, y: 2.8, z: 8 }, metadata: { temperatureK: 5600, lumens: 5000 } },
    { id: 'sign.neuro', kind: 'SIGNAGE', positionMeters: { x: -4.5, y: 2.5, z: -5.2 }, assetSlot: 'lab.sign.neuroscience' },
    { id: 'sign.micro', kind: 'SIGNAGE', positionMeters: { x: 3.8, y: 2.5, z: -4.2 }, assetSlot: 'lab.sign.microscopy' },
    { id: 'sign.orpheus', kind: 'SIGNAGE', positionMeters: { x: 3.0, y: 2.5, z: 4.2 }, assetSlot: 'lab.sign.orpheus' },
    { id: 'vfx.cleanroom-air', kind: 'PARTICLE', positionMeters: { x: 0, y: 2.8, z: 0 }, metadata: { density: 0.08, speed: 0.02 } },
  ];
  for (const station of GENESIS_LAB_STATIONS) nodes.push({ id: station.stationId, kind: 'FURNITURE', positionMeters: station.positionMeters, metadata: { zone: station.zone, label: station.label } });
  for (const equipment of GENESIS_LAB_EQUIPMENT) nodes.push({ id: equipment.equipmentId, kind: 'EQUIPMENT', positionMeters: GENESIS_LAB_STATIONS.find((s) => s.stationId === equipment.stationId)!.positionMeters, assetSlot: equipment.assetSlot, metadata: { kind: equipment.kind, label: equipment.label } });
  return {
    sceneId: 'world:genesis-human-biology-lab',
    dimensionsMeters: { x: 20, y: 4.2, z: 20 },
    stations: GENESIS_LAB_STATIONS,
    equipment: GENESIS_LAB_EQUIPMENT,
    nodes,
    realism: createCinematicLabRealismProfile(),
    humanVisual: createHumanVisualProfile(),
    materials: REALISTIC_LAB_MATERIALS,
  };
}
