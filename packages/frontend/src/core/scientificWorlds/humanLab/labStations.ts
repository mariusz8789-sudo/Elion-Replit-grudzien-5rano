import type { EquipmentItem, LabStation } from './types';

export const GENESIS_LAB_STATIONS: readonly LabStation[] = [
  { stationId: 'station:human-study', zone: 'HUMAN_STUDY', label: 'Human Study Table', positionMeters: { x: -8, y: 0, z: -2 }, equipmentIds: ['equipment:anatomy-table'], interactionRadiusMeters: 1.5, accessLevel: 'OPERATOR' },
  { stationId: 'station:neuro', zone: 'NEURO', label: 'Neuro Science Console', positionMeters: { x: -3, y: 0, z: -5 }, equipmentIds: ['equipment:neuro-console'], interactionRadiusMeters: 1.4, accessLevel: 'RESEARCHER' },
  { stationId: 'station:microscopy', zone: 'MICROSCOPY', label: 'Microscopy Bay', positionMeters: { x: 4, y: 0, z: -4 }, equipmentIds: ['equipment:hyperscope', 'equipment:microscope'], interactionRadiusMeters: 1.3, accessLevel: 'RESEARCHER' },
  { stationId: 'station:histology', zone: 'HISTOLOGY', label: 'Histology Bench', positionMeters: { x: 7, y: 0, z: 1 }, equipmentIds: ['equipment:slide-prep'], interactionRadiusMeters: 1.3, accessLevel: 'RESEARCHER' },
  { stationId: 'station:imaging', zone: 'IMAGING', label: 'Imaging Center', positionMeters: { x: -6, y: 0, z: 5 }, equipmentIds: ['equipment:imaging-console'], interactionRadiusMeters: 1.7, accessLevel: 'RESEARCHER' },
  { stationId: 'station:orpheus', zone: 'MOLECULAR', label: 'Orpheus Multimodal Analysis Bay', positionMeters: { x: 3, y: 0, z: 5 }, equipmentIds: ['equipment:orpheus'], interactionRadiusMeters: 1.8, accessLevel: 'RESEARCHER' },
  { stationId: 'station:compute', zone: 'COMPUTE', label: 'Scientific Compute Wall', positionMeters: { x: 9, y: 0, z: -5 }, equipmentIds: ['equipment:compute-rack'], interactionRadiusMeters: 1.5, accessLevel: 'RESEARCHER' },
  { stationId: 'station:evidence', zone: 'EVIDENCE', label: 'Evidence Ledger Wall', positionMeters: { x: 9, y: 0, z: 5 }, equipmentIds: ['equipment:evidence-console'], interactionRadiusMeters: 1.5, accessLevel: 'OPERATOR' },
  { stationId: 'station:safety', zone: 'SAFETY', label: 'Safety & Access Console', positionMeters: { x: 0, y: 0, z: 8 }, equipmentIds: ['equipment:safety-console'], interactionRadiusMeters: 1.2, accessLevel: 'ADMIN' },
];

export const GENESIS_LAB_EQUIPMENT: readonly EquipmentItem[] = [
  { equipmentId: 'equipment:anatomy-table', kind: 'ANATOMY_TABLE', label: 'Anatomy Inspection Table', stationId: 'station:human-study', operational: true, assetSlot: 'lab.equipment.anatomy-table.high_fidelity', capabilities: ['ANATOMY_LAYER', 'XRAY_VIEW', 'ORGAN_ISOLATION'] },
  { equipmentId: 'equipment:neuro-console', kind: 'GENERIC', label: 'Neuro Science Console', stationId: 'station:neuro', operational: true, assetSlot: 'lab.equipment.neuro-console.high_fidelity', capabilities: ['BRAIN_VIEW', 'SIGNAL_VIEW', 'NEURO_SIMULATION'] },
  { equipmentId: 'equipment:hyperscope', kind: 'HYPERSCOPE', label: 'Genesis Hyperscope', stationId: 'station:microscopy', operational: true, assetSlot: 'lab.equipment.hyperscope.hero', capabilities: ['1X', '5X', '25X', '100X', '500X', '1000X'] },
  { equipmentId: 'equipment:microscope', kind: 'MICROSCOPE', label: 'Virtual Precision Microscope', stationId: 'station:microscopy', operational: true, assetSlot: 'lab.equipment.microscope.hero', capabilities: ['BRIGHTFIELD', 'FLUORESCENCE_SIM', 'DEPTH_STACK'] },
  { equipmentId: 'equipment:slide-prep', kind: 'GENERIC', label: 'Virtual Histology Workstation', stationId: 'station:histology', operational: true, assetSlot: 'lab.equipment.histology-bench.high_fidelity', capabilities: ['CREATE_SLIDE', 'CELL_MODEL'] },
  { equipmentId: 'equipment:imaging-console', kind: 'IMAGING_CONSOLE', label: 'Genesis Imaging Center Console', stationId: 'station:imaging', operational: true, assetSlot: 'lab.equipment.imaging-console.hero', capabilities: ['XRAY', 'CT_RECONSTRUCTION', 'MRI_LIKE', 'ULTRASOUND_LIKE'] },
  { equipmentId: 'equipment:orpheus', kind: 'ORPHEUS', label: 'ORPHEUS Multimodal Analyzer', stationId: 'station:orpheus', operational: true, assetSlot: 'lab.equipment.orpheus.hero', capabilities: ['SPECIMEN_SCAN', 'OPTICAL', 'COMPUTATIONAL', 'EVIDENCE_EXPORT'] },
  { equipmentId: 'equipment:compute-rack', kind: 'COMPUTE_RACK', label: 'Scientific Compute Wall', stationId: 'station:compute', operational: true, assetSlot: 'lab.equipment.compute-wall.high_fidelity', capabilities: ['SIMULATION', 'REPLAY', 'ANALYTICS'] },
  { equipmentId: 'equipment:evidence-console', kind: 'SAFETY_CONSOLE', label: 'Evidence Ledger Console', stationId: 'station:evidence', operational: true, assetSlot: 'lab.equipment.evidence-console.hero', capabilities: ['PROVENANCE', 'HASH_VERIFY', 'REPLAY_STATUS'] },
  { equipmentId: 'equipment:safety-console', kind: 'SAFETY_CONSOLE', label: 'Safety & Access Console', stationId: 'station:safety', operational: true, assetSlot: 'lab.equipment.safety-console.high_fidelity', capabilities: ['ACCESS', 'PPE', 'SAFETY_HOLD'] },
];
