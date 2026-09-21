export type CapabilityStatus = 'NOT_IMPLEMENTED' | 'STRUCTURAL' | 'UNIT_VERIFIED' | 'E2E_VERIFIED' | 'REAL_DATA_VERIFIED' | 'HARDWARE_VERIFIED';
export type GenesisLabCapabilityId =
  | 'WORLD_VISUALIZATION' | 'SCIENTIFIC_SOLVERS' | 'DEVICE_ABSTRACTION' | 'SENSOR_INGESTION' | 'CALIBRATION' | 'UNCERTAINTY'
  | 'SAMPLE_LINEAGE' | 'PROTOCOL_EXECUTION' | 'SAFETY' | 'HARDWARE_IN_LOOP' | 'DIGITAL_TWIN_SYNC' | 'MODEL_CALIBRATION'
  | 'VALIDATION_FALSIFICATION' | 'EVIDENCE_REPLAY' | 'CLOSED_LOOP' | 'LIMS_ELN_SEAMS' | 'REAL_DATA_ASSIMILATION'
  | 'MATERIALS_REALITY_LOOP' | 'BIOTECH_REALITY_LOOP' | 'BIG_SCIENCE_INTERFACE';
export interface CapabilityEntry { readonly capability: GenesisLabCapabilityId; readonly status: CapabilityStatus; readonly evidence: readonly string[] }
export interface GenesisLabCapabilityReport {
  readonly entries: readonly CapabilityEntry[];
  readonly e2eOrStrongerPercent: number;
  readonly realDataOrStrongerPercent: number;
  readonly hardwareVerifiedPercent: number;
  readonly LAB_SCOPE_90_READY: boolean;
  readonly LAB_SCOPE_97_READY: boolean;
}
const ORDER: readonly CapabilityStatus[] = ['NOT_IMPLEMENTED', 'STRUCTURAL', 'UNIT_VERIFIED', 'E2E_VERIFIED', 'REAL_DATA_VERIFIED', 'HARDWARE_VERIFIED'];
const atLeast = (status: CapabilityStatus, threshold: CapabilityStatus): boolean => ORDER.indexOf(status) >= ORDER.indexOf(threshold);
export function buildCapabilityReport(entries: readonly CapabilityEntry[], criticalCapabilities: readonly GenesisLabCapabilityId[]): GenesisLabCapabilityReport {
  if (entries.length !== 20) throw new Error(`Capability matrix must contain exactly 20 entries; got ${entries.length}`);
  const unique = new Set(entries.map((e) => e.capability)); if (unique.size !== 20) throw new Error('Capability matrix contains duplicates');
  const e2eCount = entries.filter((e) => atLeast(e.status, 'E2E_VERIFIED')).length;
  const realCount = entries.filter((e) => atLeast(e.status, 'REAL_DATA_VERIFIED')).length;
  const hardwareCount = entries.filter((e) => e.status === 'HARDWARE_VERIFIED').length;
  const criticalPass = criticalCapabilities.every((id) => {
    const entry = entries.find((e) => e.capability === id); return entry !== undefined && atLeast(entry.status, 'E2E_VERIFIED');
  });
  const e2eOrStrongerPercent = (e2eCount / 20) * 100;
  const realDataOrStrongerPercent = (realCount / 20) * 100;
  const hardwareVerifiedPercent = (hardwareCount / 20) * 100;
  const LAB_SCOPE_90_READY = e2eOrStrongerPercent >= 90 && criticalPass;
  const closedLoop = entries.find((e) => e.capability === 'CLOSED_LOOP');
  const LAB_SCOPE_97_READY = e2eOrStrongerPercent >= 97 && realCount >= 1 && hardwareCount >= 1 && closedLoop !== undefined && atLeast(closedLoop.status, 'E2E_VERIFIED') && criticalPass;
  return { entries, e2eOrStrongerPercent, realDataOrStrongerPercent, hardwareVerifiedPercent, LAB_SCOPE_90_READY, LAB_SCOPE_97_READY };
}
