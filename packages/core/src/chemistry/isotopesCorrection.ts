/* Proprietary / All Rights Reserved - Genesis OS */
import type { Isotope, ProvenanceMeta } from './genesisChemistryTypes.js';

const P: ProvenanceMeta = {
  source: ['NIST', 'IAEA-NDS'],
  sourceType: 'REFERENCE_DATA',
  confidence: 'HIGH',
  verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED',
  sourceVersion: 'cutoff-2026-01',
  lastChecked: null,
  license: 'facts',
  notes: ['Correction pass keeps Tc-99 and Tc-99m as separate nuclides.'],
};

export const TC_CORRECTION: readonly Isotope[] = [
  {
    element: 'Tc', massNumber: 99, metastable: false, neutrons: 56, stable: false,
    halfLife: '2.11e5 y', decayModes: ['beta-'], naturalAbundance: null, daughter: 'Ru-99', provenance: P,
  },
  {
    element: 'Tc', massNumber: 99, metastable: true, neutrons: 56, stable: false,
    halfLife: '6.01 h', decayModes: ['gamma', 'IT'], naturalAbundance: null, daughter: 'Tc-99', provenance: P,
  },
];

export function applyIsotopeCorrections(list: readonly Isotope[]): readonly Isotope[] {
  const out = list.filter((iso) => !(iso.element === 'Tc' && iso.massNumber === 99));
  return [...out, ...TC_CORRECTION];
}
