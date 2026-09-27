import type { BiosafetyContext, LabZoneId, ScientificProtocol } from './types';

const ZONE_RESTRICTIONS: Readonly<Record<LabZoneId, readonly string[]>> = {
  ENTRY: [],
  HUMAN_STUDY: [],
  NEURO: [],
  MICROSCOPY: ['lab-coat', 'gloves'],
  HISTOLOGY: ['lab-coat', 'gloves', 'eye-protection'],
  CELL: ['lab-coat', 'gloves', 'eye-protection'],
  IMAGING: ['lab-coat'],
  MOLECULAR: ['lab-coat', 'gloves', 'eye-protection'],
  COMPUTE: [],
  EVIDENCE: [],
  SAFETY: [],
};

export function evaluateBiosafety(zone: LabZoneId, protocol: ScientificProtocol, equippedPpe: readonly string[]): BiosafetyContext {
  const requiredPpe = ZONE_RESTRICTIONS[zone] ?? [];
  const missing = requiredPpe.filter((item) => !equippedPpe.includes(item));
  if (protocol.safetyLevel === 'CONCEPTUAL_ONLY') {
    return { zone, state: 'ACCESS_RESTRICTED', requiredPpe, reasons: ['Protocol is conceptual-only and cannot claim physical laboratory execution.'] };
  }
  if (missing.length) return { zone, state: 'PPE_REQUIRED', requiredPpe, reasons: [`Missing PPE: ${missing.join(', ')}`] };
  return { zone, state: 'CLEAR', requiredPpe, reasons: [] };
}
