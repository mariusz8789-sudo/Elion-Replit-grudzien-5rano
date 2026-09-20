/* Proprietary / All Rights Reserved - Genesis OS */
import type { PkaRecord, ProvenanceMeta, Reaction, ReactionParticipant } from '../genesisChemistryTypes.js';

const P: ProvenanceMeta = {
  source: ['standard chemistry curriculum / IUPAC-style reaction representations'],
  sourceType: 'REFERENCE_DATA',
  confidence: 'MEDIUM',
  verificationStatus: 'SOURCE_DECLARED_NOT_LIVE_VERIFIED',
  sourceVersion: 'cutoff-2026-01',
  lastChecked: null,
  license: 'facts',
  notes: ['Seed reaction set; live source verification pending.'],
};

const rp = (f: string, c = 1, charge?: number, compositionOverride?: Readonly<Record<string, number>>): ReactionParticipant => ({ f, c, charge, compositionOverride });

const rx = (
  id: string,
  reactants: ReactionParticipant[],
  products: ReactionParticipant[],
  equation: string,
  reactionType: string[],
  opts: { reversible?: boolean; conditions?: string[]; catalysts?: string[]; contextDependent?: boolean; epistemic?: Reaction['epistemic'] } = {},
): Reaction => ({
  id,
  reactants,
  products,
  equation,
  reactionType,
  conditions: opts.conditions ?? [],
  catalysts: opts.catalysts ?? [],
  reversible: opts.reversible ?? false,
  contextDependent: opts.contextDependent ?? false,
  epistemic: opts.epistemic ?? 'REFERENCE_DATA',
  provenance: P,
});

export const EXTRA_REACTIONS: readonly Reaction[] = [
  rx('E01', [rp('C2H4'), rp('HBr')], [rp('C2H5Br', 1, 0, { C: 2, H: 5, Br: 1 })], 'C2H4 + HBr -> C2H5Br', ['addition']),
  rx('E02', [rp('C2H4'), rp('Br2')], [rp('C2H4Br2', 1, 0, { C: 2, H: 4, Br: 2 })], 'C2H4 + Br2 -> C2H4Br2', ['addition']),
  rx('E03', [rp('C2H5OH', 1, 0, { C: 2, H: 6, O: 1 }), rp('O2', 3)], [rp('CO2', 2), rp('H2O', 3)], 'C2H5OH + 3 O2 -> 2 CO2 + 3 H2O', ['combustion', 'redox']),
  rx('E04', [rp('C2H5OH', 2, 0, { C: 2, H: 6, O: 1 }), rp('O2')], [rp('CH3CHO', 2, 0, { C: 2, H: 4, O: 1 }), rp('H2O', 2)], '2 C2H5OH + O2 -> 2 CH3CHO + 2 H2O', ['oxidation'], { catalysts: ['Cu'] }),
  rx('E05', [rp('CH3CHO', 1, 0, { C: 2, H: 4, O: 1 }), rp('H2')], [rp('C2H5OH', 1, 0, { C: 2, H: 6, O: 1 })], 'CH3CHO + H2 -> C2H5OH', ['reduction']),
  rx('E06', [rp('CH3COOH'), rp('NaOH')], [rp('CH3COONa', 1, 0, { C: 2, H: 3, O: 2, Na: 1 }), rp('H2O')], 'CH3COOH + NaOH -> CH3COONa + H2O', ['neutralization']),
  rx('E07', [rp('C2H5Br', 1, 0, { C: 2, H: 5, Br: 1 }), rp('NaOH')], [rp('C2H5OH', 1, 0, { C: 2, H: 6, O: 1 }), rp('NaBr', 1, 0, { Na: 1, Br: 1 })], 'C2H5Br + NaOH -> C2H5OH + NaBr', ['substitution', 'hydrolysis']),
  rx('E08', [rp('C2H5Br', 1, 0, { C: 2, H: 5, Br: 1 }), rp('KOH')], [rp('C2H4'), rp('KBr'), rp('H2O')], 'C2H5Br + KOH -> C2H4 + KBr + H2O', ['elimination'], { conditions: ['alcoholic KOH'] }),
  rx('E09', [rp('C6H6'), rp('HNO3')], [rp('C6H5NO2', 1, 0, { C: 6, H: 5, N: 1, O: 2 }), rp('H2O')], 'C6H6 + HNO3 -> C6H5NO2 + H2O', ['substitution', 'nitration'], { catalysts: ['H2SO4'] }),
  rx('E10', [rp('C6H6'), rp('Br2')], [rp('C6H5Br', 1, 0, { C: 6, H: 5, Br: 1 }), rp('HBr')], 'C6H6 + Br2 -> C6H5Br + HBr', ['substitution'], { catalysts: ['FeBr3'] }),
  rx('E11', [rp('C2H4', 2)], [rp('C4H8', 1, 0, { C: 4, H: 8 })], '2 C2H4 -> C4H8', ['dimerization'], { epistemic: 'MODEL' }),
  rx('E12', [rp('CH3COOH'), rp('NH3')], [rp('CH3CONH2', 1, 0, { C: 2, H: 5, N: 1, O: 1 }), rp('H2O')], 'CH3COOH + NH3 -> CH3CONH2 + H2O', ['condensation']),
  rx('E13', [rp('C6H12O6')], [rp('C2H5OH', 2, 0, { C: 2, H: 6, O: 1 }), rp('CO2', 2)], 'C6H12O6 -> 2 C2H5OH + 2 CO2', ['fermentation', 'decomposition'], { catalysts: ['zymase'] }),
  rx('E14', [rp('C12H22O11'), rp('H2O')], [rp('C6H12O6', 2)], 'C12H22O11 + H2O -> 2 C6H12O6', ['hydrolysis']),
  rx('E15', [rp('H2O', 2)], [rp('H2', 2), rp('O2')], '2 H2O -> 2 H2 + O2', ['electrolysis', 'redox'], { conditions: ['electric current'] }),
  rx('E16', [rp('Zn'), rp('Cu2+', 1, 2, { Cu: 1 })], [rp('Zn2+', 1, 2, { Zn: 1 }), rp('Cu')], 'Zn + Cu2+ -> Zn2+ + Cu', ['redox', 'electrochemistry']),
  rx('E17', [rp('Cl-', 2, -1, { Cl: 1 })], [rp('Cl2'), rp('e-', 2, -1, {})], '2 Cl- -> Cl2 + 2 e-', ['half_reaction', 'oxidation']),
  rx('E18', [rp('Cu2+', 1, 2, { Cu: 1 }), rp('e-', 2, -1, {})], [rp('Cu')], 'Cu2+ + 2 e- -> Cu', ['half_reaction', 'reduction']),
  rx('E19', [rp('Ag+', 1, 1, { Ag: 1 }), rp('e-', 1, -1, {})], [rp('Ag')], 'Ag+ + e- -> Ag', ['half_reaction', 'reduction']),
  rx('E20', [rp('Fe3+', 1, 3, { Fe: 1 }), rp('e-', 1, -1, {})], [rp('Fe2+', 1, 2, { Fe: 1 })], 'Fe3+ + e- -> Fe2+', ['half_reaction', 'reduction']),
  rx('E21', [rp('MnO4-', 1, -1, { Mn: 1, O: 4 }), rp('H+', 8, 1, { H: 1 }), rp('e-', 5, -1, {})], [rp('Mn2+', 1, 2, { Mn: 1 }), rp('H2O', 4)], 'MnO4- + 8 H+ + 5 e- -> Mn2+ + 4 H2O', ['half_reaction', 'reduction']),
  rx('E22', [rp('O2'), rp('H+', 4, 1, { H: 1 }), rp('e-', 4, -1, {})], [rp('H2O', 2)], 'O2 + 4 H+ + 4 e- -> 2 H2O', ['half_reaction', 'reduction']),
  rx('E23', [rp('H+', 2, 1, { H: 1 }), rp('e-', 2, -1, {})], [rp('H2')], '2 H+ + 2 e- -> H2', ['half_reaction', 'reduction']),
  rx('E24', [rp('Ag+', 1, 1, { Ag: 1 }), rp('NH3', 2)], [rp('[Ag(NH3)2]+', 1, 1, { Ag: 1, N: 2, H: 6 })], 'Ag+ + 2 NH3 -> [Ag(NH3)2]+', ['complexation']),
  rx('E25', [rp('Pb2+', 1, 2, { Pb: 1 }), rp('I-', 2, -1, { I: 1 })], [rp('PbI2')], 'Pb2+ + 2 I- -> PbI2', ['precipitation']),
  rx('E26', [rp('Ca2+', 1, 2, { Ca: 1 }), rp('CO3^2-', 1, -2, { C: 1, O: 3 })], [rp('CaCO3')], 'Ca2+ + CO3^2- -> CaCO3', ['precipitation']),
  rx('E27', [rp('Ba2+', 1, 2, { Ba: 1 }), rp('SO4^2-', 1, -2, { S: 1, O: 4 })], [rp('BaSO4')], 'Ba2+ + SO4^2- -> BaSO4', ['precipitation']),
  rx('E28', [rp('Fe3+', 1, 3, { Fe: 1 }), rp('OH-', 3, -1, { O: 1, H: 1 })], [rp('Fe(OH)3', 1, 0, { Fe: 1, O: 3, H: 3 })], 'Fe3+ + 3 OH- -> Fe(OH)3', ['precipitation']),
  rx('E29', [rp('C6H12O6'), rp('ATP', 1, 0, { C: 10, H: 16, N: 5, O: 13, P: 3 })], [rp('C6H13O9P', 1, 0, { C: 6, H: 13, O: 9, P: 1 }), rp('ADP', 1, 0, { C: 10, H: 15, N: 5, O: 10, P: 2 })], 'glucose + ATP -> glucose-6-P + ADP', ['biochemical', 'phosphorylation'], { contextDependent: true, epistemic: 'MODEL', catalysts: ['hexokinase'] }),
  rx('E30', [rp('C2H5NO2', 2)], [rp('C4H8N2O3', 1, 0, { C: 4, H: 8, N: 2, O: 3 }), rp('H2O')], '2 Gly -> Gly-Gly + H2O', ['condensation', 'biochemical']),
  rx('E31', [rp('ADP', 1, 0, { C: 10, H: 15, N: 5, O: 10, P: 2 }), rp('H3PO4')], [rp('ATP', 1, 0, { C: 10, H: 16, N: 5, O: 13, P: 3 }), rp('H2O')], 'ADP + Pi -> ATP + H2O', ['condensation', 'biochemical'], { contextDependent: true, epistemic: 'MODEL' }),
  rx('E32', [rp('Zn'), rp('MnO2', 2), rp('NH4Cl', 2)], [rp('ZnCl2'), rp('Mn2O3'), rp('NH3', 2), rp('H2O')], 'Zn + 2 MnO2 + 2 NH4Cl -> ZnCl2 + Mn2O3 + 2 NH3 + H2O', ['electrochemistry', 'redox'], { epistemic: 'MODEL' }),
  rx('E33', [rp('Pb'), rp('PbO2'), rp('H2SO4', 2)], [rp('PbSO4', 2), rp('H2O', 2)], 'Pb + PbO2 + 2 H2SO4 -> 2 PbSO4 + 2 H2O', ['electrochemistry', 'redox']),
  rx('E34', [rp('H2'), rp('Cl2')], [rp('HCl', 2)], 'H2 + Cl2 -> 2 HCl', ['synthesis', 'redox']),
  rx('E35', [rp('C2H2'), rp('Br2', 2)], [rp('C2H2Br4', 1, 0, { C: 2, H: 2, Br: 4 })], 'C2H2 + 2 Br2 -> C2H2Br4', ['addition']),
  rx('E36', [rp('C6H5OH'), rp('NaOH')], [rp('C6H5ONa', 1, 0, { C: 6, H: 5, O: 1, Na: 1 }), rp('H2O')], 'C6H5OH + NaOH -> C6H5ONa + H2O', ['acid_base', 'neutralization']),
  rx('E37', [rp('CH3COOC2H5', 1, 0, { C: 4, H: 8, O: 2 }), rp('NaOH')], [rp('CH3COONa', 1, 0, { C: 2, H: 3, O: 2, Na: 1 }), rp('C2H5OH', 1, 0, { C: 2, H: 6, O: 1 })], 'CH3COOC2H5 + NaOH -> CH3COONa + C2H5OH', ['hydrolysis', 'saponification']),
  rx('E38', [rp('CH3COOC2H5', 1, 0, { C: 4, H: 8, O: 2 }), rp('H2O')], [rp('CH3COOH'), rp('C2H5OH', 1, 0, { C: 2, H: 6, O: 1 })], 'CH3COOC2H5 + H2O <-> CH3COOH + C2H5OH', ['hydrolysis'], { reversible: true }),
];

export const PKA_CONTEXT: readonly PkaRecord[] = [
  { id: 'HCl', value: -7, solvent: 'water', temperatureK: 298.15, ionicStrength: null, source: 'CRC/NIST', notes: ['strong acid, leveled in water'] },
  { id: 'HBr', value: -9, solvent: 'water', temperatureK: 298.15, ionicStrength: null, source: 'CRC', notes: ['strong acid'] },
  { id: 'HI', value: -10, solvent: 'water', temperatureK: 298.15, ionicStrength: null, source: 'CRC', notes: ['strong acid'] },
  { id: 'CH3COOH', value: 4.76, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'IUPAC/CRC', notes: [] },
  { id: 'HCOOH', value: 3.75, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'CRC', notes: [] },
  { id: 'HF', value: 3.17, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'CRC', notes: [] },
  { id: 'H2CO3', value: 6.35, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'CRC', notes: ['pKa1'] },
  { id: 'H3PO4', value: 2.15, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'CRC', notes: ['pKa1'] },
  { id: 'NH4+', value: 9.25, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'CRC', notes: [] },
  { id: 'phenol', value: 9.95, solvent: 'water', temperatureK: 298.15, ionicStrength: 0, source: 'CRC', notes: [] },
];

export const REACTION_OVERRIDES: Readonly<Record<string, { epistemic: Reaction['epistemic']; contextDependent: boolean; notes: readonly string[] }>> = {
  R27: { epistemic: 'MODEL', contextDependent: true, notes: ['ATP hydrolysis is speciation/pH-dependent; educational representation simplified.'] },
  E29: { epistemic: 'MODEL', contextDependent: true, notes: ['Phosphorylation is context-dependent (e.g. pH/Mg2+).'] },
  E31: { epistemic: 'MODEL', contextDependent: true, notes: ['ATP synthesis is context/speciation-dependent.'] },
};
