import type { IonSpec } from '@genesis/core/cern/MaterialsDiscoveryEngine.js';

/**
 * Ionic compositions the crystal synthesizer accepts by name. Radii are
 * Shannon ionic radii (pm) and masses standard atomic weights (u), the same
 * table the CERN complex view uses; the engine's properties are documented
 * ESTIMATES (see MaterialsDiscoveryEngine), never DFT results.
 */
export const ION_PRESETS: Readonly<Record<string, readonly IonSpec[]>> = {
  NaCl: [{ species: 'Na', charge: 1, radiusPm: 102, count: 1, atomicMassU: 22.99 }, { species: 'Cl', charge: -1, radiusPm: 181, count: 1, atomicMassU: 35.45 }],
  SrTiO3: [{ species: 'Sr', charge: 2, radiusPm: 144, count: 1, atomicMassU: 87.62 }, { species: 'Ti', charge: 4, radiusPm: 60.5, count: 1, atomicMassU: 47.87 }, { species: 'O', charge: -2, radiusPm: 140, count: 3, atomicMassU: 16.0 }],
  Cu: [{ species: 'Cu', charge: 0, radiusPm: 128, count: 1, atomicMassU: 63.55 }],
  MgO: [{ species: 'Mg', charge: 2, radiusPm: 72, count: 1, atomicMassU: 24.31 }, { species: 'O', charge: -2, radiusPm: 140, count: 1, atomicMassU: 16.0 }],
  Fe: [{ species: 'Fe', charge: 2, radiusPm: 126, count: 1, atomicMassU: 55.85 }],
};

export const ION_PRESET_NAMES: readonly string[] = Object.keys(ION_PRESETS);
