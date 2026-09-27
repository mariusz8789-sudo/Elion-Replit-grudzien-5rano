/* Genesis Chemistry v0.1-compatible replacement; NOT the original Qwen v0.1. */
import type { BondType, Ion, Isotope, ProvenanceMeta, VseprGeometry } from '../genesisChemistryTypes.js';

const P: ProvenanceMeta = { source: ['NIST isotope reference data', 'IAEA-NDS', 'IUPAC/PubChem educational chemistry references'], sourceType: 'REFERENCE_DATA', confidence: 'MEDIUM', verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED', sourceVersion: '2026-09 package build', lastChecked: null, license: 'facts', notes: ['Reconstructed compatibility base.'] };

export const ISOTOPES: readonly Isotope[] = [
  { element: 'H', massNumber: 1, neutrons: 0, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'H', massNumber: 2, neutrons: 1, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'H', massNumber: 3, neutrons: 2, stable: false, halfLife: '12.32 y', decayModes: ['beta-'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'C', massNumber: 12, neutrons: 6, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'C', massNumber: 13, neutrons: 7, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'C', massNumber: 14, neutrons: 8, stable: false, halfLife: '5730 y', decayModes: ['beta-'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'N', massNumber: 14, neutrons: 7, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'N', massNumber: 15, neutrons: 8, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'O', massNumber: 16, neutrons: 8, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'O', massNumber: 18, neutrons: 10, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'Fe', massNumber: 56, neutrons: 30, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'Co', massNumber: 60, neutrons: 33, stable: false, halfLife: '5.27 y', decayModes: ['beta-', 'gamma'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'Cu', massNumber: 63, neutrons: 34, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'Cu', massNumber: 65, neutrons: 36, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'I', massNumber: 127, neutrons: 74, stable: true, halfLife: null, decayModes: ['stable'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'U', massNumber: 235, neutrons: 143, stable: false, halfLife: '7.04e8 y', decayModes: ['alpha'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'U', massNumber: 238, neutrons: 146, stable: false, halfLife: '4.47e9 y', decayModes: ['alpha'], naturalAbundance: null, daughter: null, provenance: P },
  { element: 'Tc', massNumber: 99, neutrons: 56, stable: false, halfLife: '2.11e5 y', decayModes: ['beta-'], naturalAbundance: null, daughter: null, provenance: P }
];

export const IONS: readonly Ion[] = [
  { id: 'hydrogen', formula: 'H+', charge: 1, kind: 'monatomic', name: 'hydrogen ion', namePl: 'hydrogen ion', composition: {"H": 1}, provenance: P },
  { id: 'hydroxide', formula: 'OH-', charge: -1, kind: 'polyatomic', name: 'hydroxide', namePl: 'hydroxide', composition: {"O": 1, "H": 1}, provenance: P },
  { id: 'chloride', formula: 'Cl-', charge: -1, kind: 'monatomic', name: 'chloride', namePl: 'chloride', composition: {"Cl": 1}, provenance: P },
  { id: 'bromide', formula: 'Br-', charge: -1, kind: 'monatomic', name: 'bromide', namePl: 'bromide', composition: {"Br": 1}, provenance: P },
  { id: 'iodide', formula: 'I-', charge: -1, kind: 'monatomic', name: 'iodide', namePl: 'iodide', composition: {"I": 1}, provenance: P },
  { id: 'sodium', formula: 'Na+', charge: 1, kind: 'monatomic', name: 'sodium ion', namePl: 'sodium ion', composition: {"Na": 1}, provenance: P },
  { id: 'potassium', formula: 'K+', charge: 1, kind: 'monatomic', name: 'potassium ion', namePl: 'potassium ion', composition: {"K": 1}, provenance: P },
  { id: 'magnesium', formula: 'Mg2+', charge: 2, kind: 'monatomic', name: 'magnesium ion', namePl: 'magnesium ion', composition: {"Mg": 1}, provenance: P },
  { id: 'calcium', formula: 'Ca2+', charge: 2, kind: 'monatomic', name: 'calcium ion', namePl: 'calcium ion', composition: {"Ca": 1}, provenance: P },
  { id: 'aluminum', formula: 'Al3+', charge: 3, kind: 'monatomic', name: 'aluminum ion', namePl: 'aluminum ion', composition: {"Al": 1}, provenance: P },
  { id: 'ammonium', formula: 'NH4+', charge: 1, kind: 'polyatomic', name: 'ammonium', namePl: 'ammonium', composition: {"N": 1, "H": 4}, provenance: P },
  { id: 'sulfate', formula: 'SO4^2-', charge: -2, kind: 'polyatomic', name: 'sulfate', namePl: 'sulfate', composition: {"S": 1, "O": 4}, provenance: P },
  { id: 'carbonate', formula: 'CO3^2-', charge: -2, kind: 'polyatomic', name: 'carbonate', namePl: 'carbonate', composition: {"C": 1, "O": 3}, provenance: P },
  { id: 'nitrate', formula: 'NO3-', charge: -1, kind: 'polyatomic', name: 'nitrate', namePl: 'nitrate', composition: {"N": 1, "O": 3}, provenance: P },
  { id: 'phosphate', formula: 'PO4^3-', charge: -3, kind: 'polyatomic', name: 'phosphate', namePl: 'phosphate', composition: {"P": 1, "O": 4}, provenance: P },
  { id: 'hydrogenphosphate', formula: 'HPO4^2-', charge: -2, kind: 'polyatomic', name: 'hydrogen phosphate', namePl: 'hydrogen phosphate', composition: {"H": 1, "P": 1, "O": 4}, provenance: P },
  { id: 'dihydrogenphosphate', formula: 'H2PO4-', charge: -1, kind: 'polyatomic', name: 'dihydrogen phosphate', namePl: 'dihydrogen phosphate', composition: {"H": 2, "P": 1, "O": 4}, provenance: P },
  { id: 'iron3', formula: 'Fe3+', charge: 3, kind: 'monatomic', name: 'iron(III) ion', namePl: 'iron(III) ion', composition: {"Fe": 1}, provenance: P },
  { id: 'iron2', formula: 'Fe2+', charge: 2, kind: 'monatomic', name: 'iron(II) ion', namePl: 'iron(II) ion', composition: {"Fe": 1}, provenance: P },
  { id: 'copper2', formula: 'Cu2+', charge: 2, kind: 'monatomic', name: 'copper(II) ion', namePl: 'copper(II) ion', composition: {"Cu": 1}, provenance: P },
  { id: 'zinc2', formula: 'Zn2+', charge: 2, kind: 'monatomic', name: 'zinc ion', namePl: 'zinc ion', composition: {"Zn": 1}, provenance: P },
  { id: 'silver1', formula: 'Ag+', charge: 1, kind: 'monatomic', name: 'silver ion', namePl: 'silver ion', composition: {"Ag": 1}, provenance: P },
  { id: 'lead2', formula: 'Pb2+', charge: 2, kind: 'monatomic', name: 'lead(II) ion', namePl: 'lead(II) ion', composition: {"Pb": 1}, provenance: P },
  { id: 'barium2', formula: 'Ba2+', charge: 2, kind: 'monatomic', name: 'barium ion', namePl: 'barium ion', composition: {"Ba": 1}, provenance: P },
  { id: 'manganate7', formula: 'MnO4-', charge: -1, kind: 'polyatomic', name: 'permanganate', namePl: 'permanganate', composition: {"Mn": 1, "O": 4}, provenance: P },
  { id: 'cyanide', formula: 'CN-', charge: -1, kind: 'polyatomic', name: 'cyanide', namePl: 'cyanide', composition: {"C": 1, "N": 1}, provenance: P },
  { id: 'hexacyanoferrate3', formula: 'Fe(CN)6^3-', charge: -3, kind: 'polyatomic', name: 'hexacyanoferrate(III)', namePl: 'hexacyanoferrate(III)', composition: {"Fe": 1, "C": 6, "N": 6}, provenance: P },
  { id: 'hexacyanoferrate4', formula: '[Fe(CN)6]4-', charge: -4, kind: 'polyatomic', name: 'hexacyanoferrate(II)', namePl: 'hexacyanoferrate(II)', composition: {"Fe": 1, "C": 6, "N": 6}, provenance: P },
  { id: 'tetraamminecopper2', formula: '[Cu(NH3)4]2+', charge: 2, kind: 'polyatomic', name: 'tetraamminecopper(II)', namePl: 'tetraamminecopper(II)', composition: {"Cu": 1, "N": 4, "H": 12}, provenance: P },
  { id: 'carbonate2', formula: 'CO3^2-', charge: -2, kind: 'polyatomic', name: 'carbonate', namePl: 'carbonate', composition: {"C": 1, "O": 3}, provenance: P },
  { id: 'acetate', formula: 'CH3COO-', charge: -1, kind: 'polyatomic', name: 'acetate', namePl: 'acetate', composition: {"C": 2, "H": 3, "O": 2}, provenance: P }
];

export const BOND_TYPES: readonly BondType[] = [
  { id: 'single', name: 'single covalent bond', mechanism: 'sigma', strengthKJmol: [154.0, 307.0] as const, lengthPm: [90.0, 200.0] as const, polarity: 'varies', geometryNote: 'one sigma interaction' },
  { id: 'double', name: 'double bond', mechanism: 'sigma+pi', strengthKJmol: [500.0, 700.0] as const, lengthPm: [120.0, 140.0] as const, polarity: 'polarizable', geometryNote: 'one sigma plus one pi' },
  { id: 'triple', name: 'triple bond', mechanism: 'sigma+2pi', strengthKJmol: [800.0, 1000.0] as const, lengthPm: [105.0, 125.0] as const, polarity: 'strong', geometryNote: 'one sigma plus two pi' },
  { id: 'ionic', name: 'ionic interaction', mechanism: 'electrostatic', strengthKJmol: [0, 0] as const, lengthPm: null, polarity: 'ionic', geometryNote: 'lattice electrostatics' },
  { id: 'metallic', name: 'metallic bond', mechanism: 'delocalized', strengthKJmol: [0, 0] as const, lengthPm: null, polarity: 'metallic', geometryNote: 'electron sea approximation' },
  { id: 'hydrogen', name: 'hydrogen bond', mechanism: 'electrostatic/donor-acceptor', strengthKJmol: [5.0, 40.0] as const, lengthPm: [160.0, 220.0] as const, polarity: 'strongly directional', geometryNote: 'intermolecular' },
  { id: 'coordinate', name: 'coordinate covalent bond', mechanism: 'donor-acceptor', strengthKJmol: [0, 0] as const, lengthPm: [150.0, 250.0] as const, polarity: 'variable', geometryNote: 'shared pair donated by one center' },
  { id: 'aromatic', name: 'aromatic delocalization', mechanism: 'delocalized pi', strengthKJmol: [0, 0] as const, lengthPm: [130.0, 145.0] as const, polarity: 'delocalized', geometryNote: 'resonance-stabilized ring' },
  { id: 'network', name: 'network covalent', mechanism: 'extended covalent', strengthKJmol: [0, 0] as const, lengthPm: [120.0, 190.0] as const, polarity: 'network', geometryNote: 'extended lattice' },
  { id: 'peptide', name: 'amide linkage', mechanism: 'resonance', strengthKJmol: [300.0, 500.0] as const, lengthPm: [130.0, 135.0] as const, polarity: 'polar', geometryNote: 'biomolecular linkage' },
  { id: 'disulfide', name: 'S-S bond', mechanism: 'covalent', strengthKJmol: [250.0, 250.0] as const, lengthPm: [200.0, 210.0] as const, polarity: 'polarizable', geometryNote: 'biomolecular linkage' },
  { id: 'van-der-waals', name: 'dispersion interaction', mechanism: 'London dispersion', strengthKJmol: [5.0, 5.0] as const, lengthPm: null, polarity: 'weak', geometryNote: 'noncovalent' }
];

export const VSEPR: readonly VseprGeometry[] = [
  { id: 'AX2', domains: 2, lonePairs: 0, idealAngles: ['180°'], examples: ['CO2', 'BeCl2'] },
  { id: 'AX3', domains: 3, lonePairs: 0, idealAngles: ['120°'], examples: ['BF3'] },
  { id: 'AX2E', domains: 3, lonePairs: 1, idealAngles: ['~120°'], examples: ['SO2'] },
  { id: 'AX4', domains: 4, lonePairs: 0, idealAngles: ['109.5°'], examples: ['CH4'] },
  { id: 'AX3E', domains: 4, lonePairs: 1, idealAngles: ['~107°'], examples: ['NH3'] },
  { id: 'AX2E2', domains: 4, lonePairs: 2, idealAngles: ['~104.5°'], examples: ['H2O'] },
  { id: 'AX5', domains: 5, lonePairs: 0, idealAngles: ['90°', '120°', '180°'], examples: ['PCl5'] },
  { id: 'AX4E', domains: 5, lonePairs: 1, idealAngles: ['~90°', '~120°'], examples: ['SF4'] },
  { id: 'AX3E2', domains: 5, lonePairs: 2, idealAngles: ['~90°', '180°'], examples: ['ClF3'] },
  { id: 'AX2E3', domains: 5, lonePairs: 3, idealAngles: ['180°'], examples: ['XeF2'] },
  { id: 'AX6', domains: 6, lonePairs: 0, idealAngles: ['90°', '180°'], examples: ['SF6'] },
  { id: 'AX5E', domains: 6, lonePairs: 1, idealAngles: ['~90°'], examples: ['IF5'] },
  { id: 'AX4E2', domains: 6, lonePairs: 2, idealAngles: ['90°', '180°'], examples: ['XeF4'] }
];
