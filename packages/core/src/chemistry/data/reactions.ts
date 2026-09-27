/* Genesis Chemistry v0.1-compatible replacement; NOT the original Qwen v0.1. */
import type { ProvenanceMeta, Reaction } from '../genesisChemistryTypes.js';

const P: ProvenanceMeta = { source: ['NIST / PubChem / IUPAC reference chemistry'], sourceType: 'REFERENCE_DATA', confidence: 'MEDIUM', verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED', sourceVersion: '2026-09 package build', lastChecked: null, license: 'facts', notes: ['Reaction set reconstructed and locally atom/charge checked.'] };

export const REACTIONS: readonly Reaction[] = [
  { id: 'R01', reactants: [{ f: 'H2', c: 2 }, { f: 'O2', c: 1 }], products: [{ f: 'H2O', c: 2 }], equation: '2 H2 + O2 -> 2 H2O', reactionType: ['combustion', 'redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R02', reactants: [{ f: 'N2', c: 1 }, { f: 'H2', c: 3 }], products: [{ f: 'NH3', c: 2 }], equation: 'N2 + 3 H2 -> 2 NH3', reactionType: ['synthesis'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R03', reactants: [{ f: 'CH4', c: 1 }, { f: 'O2', c: 2 }], products: [{ f: 'CO2', c: 1 }, { f: 'H2O', c: 2 }], equation: 'CH4 + 2 O2 -> CO2 + 2 H2O', reactionType: ['combustion'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R04', reactants: [{ f: 'CO', c: 2 }, { f: 'O2', c: 1 }], products: [{ f: 'CO2', c: 2 }], equation: '2 CO + O2 -> 2 CO2', reactionType: ['oxidation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R05', reactants: [{ f: 'SO2', c: 2 }, { f: 'O2', c: 1 }], products: [{ f: 'SO3', c: 2 }], equation: '2 SO2 + O2 -> 2 SO3', reactionType: ['oxidation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R06', reactants: [{ f: 'SO3', c: 1 }, { f: 'H2O', c: 1 }], products: [{ f: 'H2SO4', c: 1 }], equation: 'SO3 + H2O -> H2SO4', reactionType: ['hydration'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R07', reactants: [{ f: 'HCl', c: 1 }, { f: 'NaOH', c: 1 }], products: [{ f: 'NaCl', c: 1 }, { f: 'H2O', c: 1 }], equation: 'HCl + NaOH -> NaCl + H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R08', reactants: [{ f: 'H2SO4', c: 1 }, { f: 'NaOH', c: 2 }], products: [{ f: 'Na2SO4', c: 1 }, { f: 'H2O', c: 2 }], equation: 'H2SO4 + 2 NaOH -> Na2SO4 + 2 H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R09', reactants: [{ f: 'HNO3', c: 1 }, { f: 'KOH', c: 1 }], products: [{ f: 'KNO3', c: 1 }, { f: 'H2O', c: 1 }], equation: 'HNO3 + KOH -> KNO3 + H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R10', reactants: [{ f: 'CaCO3', c: 1 }], products: [{ f: 'CaO', c: 1 }, { f: 'CO2', c: 1 }], equation: 'CaCO3 -> CaO + CO2', reactionType: ['decomposition'], conditions: ['heat'], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R11', reactants: [{ f: 'KClO3', c: 2 }], products: [{ f: 'KCl', c: 2 }, { f: 'O2', c: 3 }], equation: '2 KClO3 -> 2 KCl + 3 O2', reactionType: ['decomposition'], conditions: ['heat'], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R12', reactants: [{ f: 'H2O2', c: 2 }], products: [{ f: 'H2O', c: 2 }, { f: 'O2', c: 1 }], equation: '2 H2O2 -> 2 H2O + O2', reactionType: ['decomposition'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R13', reactants: [{ f: 'Fe', c: 1 }, { f: 'CuSO4', c: 1 }], products: [{ f: 'FeSO4', c: 1 }, { f: 'Cu', c: 1 }], equation: 'Fe + CuSO4 -> FeSO4 + Cu', reactionType: ['redox', 'single_replacement'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R14', reactants: [{ f: 'Na', c: 2 }, { f: 'Cl2', c: 1 }], products: [{ f: 'NaCl', c: 2 }], equation: '2 Na + Cl2 -> 2 NaCl', reactionType: ['synthesis', 'redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R15', reactants: [{ f: 'Mg', c: 2 }, { f: 'O2', c: 1 }], products: [{ f: 'MgO', c: 2 }], equation: '2 Mg + O2 -> 2 MgO', reactionType: ['combustion', 'redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R16', reactants: [{ f: 'CaO', c: 1 }, { f: 'H2O', c: 1 }], products: [{ f: 'Ca(OH)2', c: 1 }], equation: 'CaO + H2O -> Ca(OH)2', reactionType: ['hydration'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R17', reactants: [{ f: 'CO2', c: 1 }, { f: 'Ca(OH)2', c: 1 }], products: [{ f: 'CaCO3', c: 1 }, { f: 'H2O', c: 1 }], equation: 'CO2 + Ca(OH)2 -> CaCO3 + H2O', reactionType: ['precipitation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R18', reactants: [{ f: 'Na2CO3', c: 1 }, { f: 'HCl', c: 2 }], products: [{ f: 'NaCl', c: 2 }, { f: 'H2O', c: 1 }, { f: 'CO2', c: 1 }], equation: 'Na2CO3 + 2 HCl -> 2 NaCl + H2O + CO2', reactionType: ['acid_base'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R19', reactants: [{ f: 'NH3', c: 1 }, { f: 'HCl', c: 1 }], products: [{ f: 'NH4Cl', c: 1 }], equation: 'NH3 + HCl -> NH4Cl', reactionType: ['acid_base'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R20', reactants: [{ f: 'AgNO3', c: 1 }, { f: 'NaCl', c: 1 }], products: [{ f: 'AgCl', c: 1 }, { f: 'NaNO3', c: 1 }], equation: 'AgNO3 + NaCl -> AgCl + NaNO3', reactionType: ['precipitation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R21', reactants: [{ f: 'BaCl2', c: 1 }, { f: 'Na2SO4', c: 1 }], products: [{ f: 'BaSO4', c: 1 }, { f: 'NaCl', c: 2 }], equation: 'BaCl2 + Na2SO4 -> BaSO4 + 2 NaCl', reactionType: ['precipitation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R22', reactants: [{ f: 'Pb(NO3)2', c: 1 }, { f: 'KI', c: 2 }], products: [{ f: 'PbI2', c: 1 }, { f: 'KNO3', c: 2 }], equation: 'Pb(NO3)2 + 2 KI -> PbI2 + 2 KNO3', reactionType: ['precipitation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R23', reactants: [{ f: 'FeCl2', c: 2 }, { f: 'Cl2', c: 1 }], products: [{ f: 'FeCl3', c: 2 }], equation: '2 FeCl2 + Cl2 -> 2 FeCl3', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R24', reactants: [{ f: 'Fe(OH)3', c: 2 }], products: [{ f: 'Fe2O3', c: 1 }, { f: 'H2O', c: 3 }], equation: '2 Fe(OH)3 -> Fe2O3 + 3 H2O', reactionType: ['decomposition'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R25', reactants: [{ f: 'Fe2O3', c: 1 }, { f: 'CO', c: 3 }], products: [{ f: 'Fe', c: 2 }, { f: 'CO2', c: 3 }], equation: 'Fe2O3 + 3 CO -> 2 Fe + 3 CO2', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R26', reactants: [{ f: 'CH3COOH', c: 1 }, { f: 'NaOH', c: 1 }], products: [{ f: 'CH3COONa', c: 1 }, { f: 'H2O', c: 1 }], equation: 'CH3COOH + NaOH -> CH3COONa + H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R27', reactants: [{ f: 'C10H16N5O13P3', c: 1 }, { f: 'H2O', c: 1 }], products: [{ f: 'C10H15N5O10P2', c: 1 }, { f: 'H3PO4', c: 1 }], equation: 'ATP + H2O -> ADP + H3PO4', reactionType: ['biochemical', 'hydrolysis'], conditions: [], catalysts: ['ATPase'], reversible: false, contextDependent: true, epistemic: 'MODEL', provenance: P },
  { id: 'R28', reactants: [{ f: 'C6H12O6', c: 1 }, { f: 'O2', c: 6 }], products: [{ f: 'CO2', c: 6 }, { f: 'H2O', c: 6 }], equation: 'C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O', reactionType: ['biochemical', 'redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R29', reactants: [{ f: 'H2S', c: 2 }, { f: 'O2', c: 3 }], products: [{ f: 'SO2', c: 2 }, { f: 'H2O', c: 2 }], equation: '2 H2S + 3 O2 -> 2 SO2 + 2 H2O', reactionType: ['oxidation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R30', reactants: [{ f: 'NH3', c: 4 }, { f: 'O2', c: 5 }], products: [{ f: 'NO', c: 4 }, { f: 'H2O', c: 6 }], equation: '4 NH3 + 5 O2 -> 4 NO + 6 H2O', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R31', reactants: [{ f: 'NO', c: 2 }, { f: 'O2', c: 1 }], products: [{ f: 'NO2', c: 2 }], equation: '2 NO + O2 -> 2 NO2', reactionType: ['oxidation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R32', reactants: [{ f: 'NO2', c: 3 }, { f: 'H2O', c: 1 }], products: [{ f: 'HNO3', c: 2 }, { f: 'NO', c: 1 }], equation: '3 NO2 + H2O -> 2 HNO3 + NO', reactionType: ['disproportionation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R33', reactants: [{ f: 'Cl2', c: 1 }, { f: 'KBr', c: 2 }], products: [{ f: 'KCl', c: 2 }, { f: 'Br2', c: 1 }], equation: 'Cl2 + 2 KBr -> 2 KCl + Br2', reactionType: ['halogen_displacement', 'redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R34', reactants: [{ f: 'Cl2', c: 1 }, { f: 'KI', c: 2 }], products: [{ f: 'KCl', c: 2 }, { f: 'I2', c: 1 }], equation: 'Cl2 + 2 KI -> 2 KCl + I2', reactionType: ['halogen_displacement', 'redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R35', reactants: [{ f: 'Zn', c: 1 }, { f: 'HCl', c: 2 }], products: [{ f: 'ZnCl2', c: 1 }, { f: 'H2', c: 1 }], equation: 'Zn + 2 HCl -> ZnCl2 + H2', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R36', reactants: [{ f: 'Mg', c: 1 }, { f: 'HCl', c: 2 }], products: [{ f: 'MgCl2', c: 1 }, { f: 'H2', c: 1 }], equation: 'Mg + 2 HCl -> MgCl2 + H2', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R37', reactants: [{ f: 'Al', c: 2 }, { f: 'HCl', c: 6 }], products: [{ f: 'AlCl3', c: 2 }, { f: 'H2', c: 3 }], equation: '2 Al + 6 HCl -> 2 AlCl3 + 3 H2', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R38', reactants: [{ f: 'NaHCO3', c: 2 }], products: [{ f: 'Na2CO3', c: 1 }, { f: 'H2O', c: 1 }, { f: 'CO2', c: 1 }], equation: '2 NaHCO3 -> Na2CO3 + H2O + CO2', reactionType: ['decomposition'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R39', reactants: [{ f: 'NH4Cl', c: 1 }, { f: 'NaOH', c: 1 }], products: [{ f: 'NH3', c: 1 }, { f: 'NaCl', c: 1 }, { f: 'H2O', c: 1 }], equation: 'NH4Cl + NaOH -> NH3 + NaCl + H2O', reactionType: ['acid_base'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R40', reactants: [{ f: 'H2CO3', c: 1 }], products: [{ f: 'CO2', c: 1 }, { f: 'H2O', c: 1 }], equation: 'H2CO3 -> CO2 + H2O', reactionType: ['decomposition'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R41', reactants: [{ f: 'SO2', c: 1 }, { f: 'H2O', c: 1 }], products: [{ f: 'H2SO3', c: 1 }], equation: 'SO2 + H2O -> H2SO3', reactionType: ['hydration'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R42', reactants: [{ f: 'H2SO3', c: 1 }, { f: 'NaOH', c: 2 }], products: [{ f: 'Na2SO3', c: 1 }, { f: 'H2O', c: 2 }], equation: 'H2SO3 + 2 NaOH -> Na2SO3 + 2 H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R43', reactants: [{ f: 'Ca(OH)2', c: 1 }, { f: 'HCl', c: 2 }], products: [{ f: 'CaCl2', c: 1 }, { f: 'H2O', c: 2 }], equation: 'Ca(OH)2 + 2 HCl -> CaCl2 + 2 H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R44', reactants: [{ f: 'H2SO4', c: 1 }, { f: 'KOH', c: 2 }], products: [{ f: 'K2SO4', c: 1 }, { f: 'H2O', c: 2 }], equation: 'H2SO4 + 2 KOH -> K2SO4 + 2 H2O', reactionType: ['neutralization'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R45', reactants: [{ f: 'Na', c: 2 }, { f: 'H2O', c: 2 }], products: [{ f: 'NaOH', c: 2 }, { f: 'H2', c: 1 }], equation: '2 Na + 2 H2O -> 2 NaOH + H2', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R46', reactants: [{ f: 'K', c: 2 }, { f: 'H2O', c: 2 }], products: [{ f: 'KOH', c: 2 }, { f: 'H2', c: 1 }], equation: '2 K + 2 H2O -> 2 KOH + H2', reactionType: ['redox'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R47', reactants: [{ f: 'Cu', c: 2 }, { f: 'O2', c: 1 }], products: [{ f: 'CuO', c: 2 }], equation: '2 Cu + O2 -> 2 CuO', reactionType: ['oxidation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P },
  { id: 'R48', reactants: [{ f: 'Fe', c: 4 }, { f: 'O2', c: 3 }], products: [{ f: 'Fe2O3', c: 2 }], equation: '4 Fe + 3 O2 -> 2 Fe2O3', reactionType: ['oxidation'], conditions: [], catalysts: [], reversible: false, contextDependent: false, epistemic: 'REFERENCE_DATA', provenance: P }
];

export const PHYS_CHEM_EQUATIONS = [
  {
    "id": "pv1",
    "name": "ideal_gas_law",
    "equation": "PV=nRT",
    "variables": {
      "P": "pressure",
      "V": "volume",
      "n": "amount",
      "R": "gas constant",
      "T": "temperature"
    },
    "unitNotes": "SI"
  },
  {
    "id": "pv2",
    "name": "henderson_hasselbalch",
    "equation": "pH=pKa+log10([A-]/[HA])",
    "variables": {
      "pH": "acidity",
      "pKa": "acid dissociation constant"
    },
    "unitNotes": "aqueous approximation"
  },
  {
    "id": "pv3",
    "name": "nucleation_rate_symbolic",
    "equation": "J=f(ΔG*,T)",
    "variables": {
      "J": "nucleation rate",
      "T": "temperature"
    },
    "unitNotes": "model form"
  },
  {
    "id": "pv4",
    "name": "gibbs_energy",
    "equation": "ΔG=ΔH-TΔS",
    "variables": {
      "G": "Gibbs energy"
    },
    "unitNotes": "thermodynamic"
  }
] as const;

export const STOICHIOMETRY_RULES = [
  {
    "id": "s1",
    "name": "mole_ratio",
    "rule": "Use balanced reaction coefficients as mole ratios."
  },
  {
    "id": "s2",
    "name": "limiting_reagent",
    "rule": "Compute extent from minimum stoichiometric quotient."
  },
  {
    "id": "s3",
    "name": "mass_from_moles",
    "rule": "m=moles*molarMass."
  },
  {
    "id": "s4",
    "name": "molarity",
    "rule": "M=n/V."
  },
  {
    "id": "s5",
    "name": "charge_balance",
    "rule": "Sum formal participant charges weighted by coefficients."
  }
] as const;
