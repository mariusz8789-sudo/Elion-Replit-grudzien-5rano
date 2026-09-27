import type { ScientificProtocol } from './types';

export const BIOLOGY_DEMO_PROTOCOLS: readonly ScientificProtocol[] = [
  {
    protocolId: 'proto:human-anatomy-inspection',
    title: 'Human anatomy inspection',
    purpose: 'Navigate a parameterized human twin and inspect an anatomical structure.',
    safetyLevel: 'LOW',
    epistemic: 'MODEL',
    steps: [
      { stepId: 'p1', kind: 'PRECHECK', title: 'Verify world and twin state', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p2', kind: 'IMAGE', title: 'Open anatomical layer', durationLogicalTicks: 2, requiredEquipmentIds: ['equipment:anatomy-table'], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p3', kind: 'VERIFY', title: 'Display epistemic label and asset provenance', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p4', kind: 'REPORT', title: 'Create inspection record', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
    ],
  },
  {
    protocolId: 'proto:hyperscope-capture',
    title: 'Virtual microscopy capture',
    purpose: 'Capture a deterministic virtual microscopy view of a specimen/model.',
    safetyLevel: 'LOW',
    epistemic: 'MODEL',
    steps: [
      { stepId: 'p1', kind: 'PRECHECK', title: 'Validate specimen', durationLogicalTicks: 1, requiredEquipmentIds: ['equipment:hyperscope'], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p2', kind: 'IMAGE', title: 'Acquire Hyperscope frame', durationLogicalTicks: 3, requiredEquipmentIds: ['equipment:hyperscope'], requiredInventoryIds: ['item:slide-holder'], requiresHumanConfirmation: false },
      { stepId: 'p3', kind: 'VERIFY', title: 'Attach epistemic and source metadata', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p4', kind: 'REPORT', title: 'Store capture record', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
    ],
  },
  {
    protocolId: 'proto:orpheus-scan',
    title: 'Orpheus multimodal specimen scan',
    purpose: 'Run a deterministic conceptual analysis pass on a specimen.',
    safetyLevel: 'CONCEPTUAL_ONLY',
    epistemic: 'SIMULATION',
    steps: [
      { stepId: 'p1', kind: 'PRECHECK', title: 'Confirm access and equipment readiness', durationLogicalTicks: 1, requiredEquipmentIds: ['equipment:orpheus'], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p2', kind: 'ACQUIRE', title: 'Load specimen into chamber', durationLogicalTicks: 2, requiredEquipmentIds: ['equipment:orpheus'], requiredInventoryIds: ['item:sample-container'], requiresHumanConfirmation: true },
      { stepId: 'p3', kind: 'ANALYZE', title: 'Run deterministic analysis model', durationLogicalTicks: 5, requiredEquipmentIds: ['equipment:orpheus'], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p4', kind: 'VERIFY', title: 'Verify output provenance', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
      { stepId: 'p5', kind: 'REPORT', title: 'Write evidence-linked result', durationLogicalTicks: 1, requiredEquipmentIds: [], requiredInventoryIds: [], requiresHumanConfirmation: false },
    ],
  },
];

export function getProtocol(protocolId: string): ScientificProtocol {
  const protocol = BIOLOGY_DEMO_PROTOCOLS.find((entry) => entry.protocolId === protocolId);
  if (!protocol) throw new Error(`PROTOCOL_NOT_FOUND:${protocolId}`);
  return protocol;
}
