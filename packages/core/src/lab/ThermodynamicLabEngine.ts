/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, type EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
export interface SpeciesDef { readonly id: string; readonly formula: string; readonly phase: 's' | 'l' | 'g' | 'aq'; readonly dHf: number; readonly S: number; readonly Cp: number; readonly boilK: number; readonly meltK: number; readonly color: string; }
/** Standard thermodynamic data (kJ/mol, J/mol·K) — NIST/CRC rounded values. */
export const SPECIES: Readonly<Record<string, SpeciesDef>> = Object.freeze({
  H2: { id: 'H2', formula: 'H2', phase: 'g', dHf: 0, S: 130.68, Cp: 28.84, boilK: 20.3, meltK: 13.8, color: '#dfefff' },
  O2: { id: 'O2', formula: 'O2', phase: 'g', dHf: 0, S: 205.14, Cp: 29.38, boilK: 90.2, meltK: 54.4, color: '#9fc3ff' },
  H2O_l: { id: 'H2O_l', formula: 'H2O(l)', phase: 'l', dHf: -285.83, S: 69.95, Cp: 75.3, boilK: 373.15, meltK: 273.15, color: '#38bdf8' },
  H2O_g: { id: 'H2O_g', formula: 'H2O(g)', phase: 'g', dHf: -241.82, S: 188.83, Cp: 33.58, boilK: 373.15, meltK: 273.15, color: '#dfefff' },
  CO2: { id: 'CO2', formula: 'CO2', phase: 'g', dHf: -393.51, S: 213.79, Cp: 37.11, boilK: 194.7, meltK: 216.6, color: '#dfefff' },
  CH4: { id: 'CH4', formula: 'CH4', phase: 'g', dHf: -74.87, S: 186.25, Cp: 35.69, boilK: 111.7, meltK: 90.7, color: '#dfefff' },
  C_s: { id: 'C_s', formula: 'C(s)', phase: 's', dHf: 0, S: 5.74, Cp: 8.53, boilK: 4200, meltK: 3800, color: '#1a1a1a' },
  Na_s: { id: 'Na_s', formula: 'Na(s)', phase: 's', dHf: 0, S: 51.21, Cp: 28.2, boilK: 1156, meltK: 371, color: '#c0c0c0' },
  Cl2: { id: 'Cl2', formula: 'Cl2', phase: 'g', dHf: 0, S: 223.07, Cp: 33.95, boilK: 239.1, meltK: 171.6, color: '#a3e635' },
  NaCl_s: { id: 'NaCl_s', formula: 'NaCl(s)', phase: 's', dHf: -411.12, S: 72.13, Cp: 50.5, boilK: 1686, meltK: 1074, color: '#f8fafc' },
  HCl_aq: { id: 'HCl_aq', formula: 'HCl(aq)', phase: 'aq', dHf: -167.16, S: 56.5, Cp: 75.0, boilK: 373, meltK: 273, color: '#e2e8f0' },
  NaOH_aq: { id: 'NaOH_aq', formula: 'NaOH(aq)', phase: 'aq', dHf: -470.11, S: 48.1, Cp: 75.0, boilK: 373, meltK: 273, color: '#e2e8f0' },
  NaCl_aq: { id: 'NaCl_aq', formula: 'NaCl(aq)', phase: 'aq', dHf: -407.27, S: 115.5, Cp: 75.0, boilK: 373, meltK: 273, color: '#e2e8f0' },
  CaCO3_s: { id: 'CaCO3_s', formula: 'CaCO3(s)', phase: 's', dHf: -1206.9, S: 92.9, Cp: 81.9, boilK: 1600, meltK: 1100, color: '#f1f5f9' },
  CaO_s: { id: 'CaO_s', formula: 'CaO(s)', phase: 's', dHf: -635.09, S: 39.75, Cp: 42.0, boilK: 3100, meltK: 2886, color: '#f8fafc' },
  CuSO4_aq: { id: 'CuSO4_aq', formula: 'CuSO4(aq)', phase: 'aq', dHf: -889.0, S: 200.0, Cp: 75.0, boilK: 373, meltK: 273, color: '#0ea5e9' },
  Zn_s: { id: 'Zn_s', formula: 'Zn(s)', phase: 's', dHf: 0, S: 41.6, Cp: 25.4, boilK: 1180, meltK: 693, color: '#94a3b8' },
  ZnSO4_aq: { id: 'ZnSO4_aq', formula: 'ZnSO4(aq)', phase: 'aq', dHf: -1022.0, S: 110.0, Cp: 75.0, boilK: 373, meltK: 273, color: '#e2e8f0' },
});
export interface ReactionDef { readonly id: string; readonly label: string; readonly coeffs: Readonly<Record<string, number>>; }
export const REACTIONS: readonly ReactionDef[] = Object.freeze([
  { id: 'R-H2-O2', label: '2 H2 + O2 -> 2 H2O(g)', coeffs: { H2: -2, O2: -1, H2O_g: 2 } },
  { id: 'R-CH4-O2', label: 'CH4 + 2 O2 -> CO2 + 2 H2O(g)', coeffs: { CH4: -1, O2: -2, CO2: 1, H2O_g: 2 } },
  { id: 'R-C-O2', label: 'C + O2 -> CO2', coeffs: { C_s: -1, O2: -1, CO2: 1 } },
  { id: 'R-NA-CL2', label: '2 Na + Cl2 -> 2 NaCl(s)', coeffs: { Na_s: -2, Cl2: -1, NaCl_s: 2 } },
  { id: 'R-CACO3', label: 'CaCO3 -> CaO + CO2', coeffs: { CaCO3_s: -1, CaO_s: 1, CO2: 1 } },
  { id: 'R-HCL-NAOH', label: 'HCl + NaOH -> NaCl(aq) + H2O(l)', coeffs: { HCl_aq: -1, NaOH_aq: -1, NaCl_aq: 1, H2O_l: 1 } },
  { id: 'R-ZN-CUSO4', label: 'Zn + CuSO4 -> ZnSO4 + Cu(s)', coeffs: { Zn_s: -1, CuSO4_aq: -1, ZnSO4_aq: 1, NaCl_s: 0 } },
] as ReactionDef[]);
export interface ThermoResult { readonly dH: number; readonly dS: number; readonly dG: number; readonly exothermic: boolean; readonly spontaneous: boolean; }
export interface StoichResult { readonly limiting: string | null; readonly extent: number; readonly consumed: Readonly<Record<string, number>>; readonly produced: Readonly<Record<string, number>>; readonly leftover: Readonly<Record<string, number>>; }
export interface LabOutcome { readonly gasMol: number; readonly explosion: boolean; readonly crystallization: boolean; readonly colorChange: boolean; readonly phaseChanges: readonly string[]; }
export interface LabResult { readonly reactionId: string | null; readonly stoich: StoichResult | null; readonly thermo: ThermoResult | null; readonly adiabaticTK: number; readonly outcome: LabOutcome; readonly finalAmounts: Readonly<Record<string, number>>; readonly eventHash: string; }
const sumCoeff = (r: ReactionDef, fn: (s: SpeciesDef, nu: number) => number): number => Object.entries(r.coeffs).reduce((acc, [id, nu]) => acc + fn(SPECIES[id], nu), 0);
export class ThermodynamicLabEngine {
  constructor(private seedBase: number) {}
  thermo(reactionId: string, T = 298.15): ThermoResult {
    const r = REACTIONS.find(x => x.id === reactionId); if (!r) throw new Error('UNKNOWN_REACTION:' + reactionId);
    const dH = sumCoeff(r, (s, nu) => nu * s.dHf);
    const dS = sumCoeff(r, (s, nu) => nu * s.S) / 1000;
    const dG = dH - T * dS;
    return { dH: +dH.toFixed(3), dS: +dS.toFixed(4), dG: +dG.toFixed(3), exothermic: dH < 0, spontaneous: dG < 0 };
  }
  solveStoichiometry(reactionId: string, amounts: Readonly<Record<string, number>>): StoichResult {
    const r = REACTIONS.find(x => x.id === reactionId); if (!r) throw new Error('UNKNOWN_REACTION:' + reactionId);
    let extent = Infinity; let limiting: string | null = null;
    for (const [id, nu] of Object.entries(r.coeffs)) if (nu < 0) { const avail = amounts[id] ?? 0; const e = avail / -nu; if (e < extent) { extent = e; limiting = id; } }
    if (!Number.isFinite(extent)) extent = 0;
    const consumed: Record<string, number> = {}; const produced: Record<string, number> = {}; const leftover: Record<string, number> = { ...amounts };
    for (const [id, nu] of Object.entries(r.coeffs)) { const d = nu * extent; if (d < 0) { consumed[id] = -d; leftover[id] = (leftover[id] ?? 0) + d; } else if (d > 0) { produced[id] = d; leftover[id] = (leftover[id] ?? 0) + d; } }
    return { limiting, extent: +extent.toFixed(6), consumed, produced, leftover };
  }
  matchReaction(reagents: readonly string[]): ReactionDef | null {
    for (const r of REACTIONS) { const reactants = Object.entries(r.coeffs).filter(([, nu]) => nu < 0).map(([id]) => id); if (reactants.length > 0 && reactants.every(id => reagents.includes(id))) return r; }
    return null;
  }
  mix(reagents: Readonly<Record<string, number>>, ignition: boolean, T0 = 298.15): LabResult {
    const r = this.matchReaction(Object.keys(reagents).filter(k => (reagents[k] ?? 0) > 0));
    if (!r) { const hash = sha256hex(stableStringify({ seed: this.seedBase, reagents, ignition, T0, none: true })); return { reactionId: null, stoich: null, thermo: null, adiabaticTK: T0, outcome: { gasMol: 0, explosion: false, crystallization: false, colorChange: false, phaseChanges: [] }, finalAmounts: reagents, eventHash: hash }; }
    const st = this.solveStoichiometry(r.id, reagents);
    const th = this.thermo(r.id, T0);
    const cpSum = Object.entries(st.leftover).reduce((acc, [id, n]) => acc + n * SPECIES[id].Cp, 0) + Object.entries(st.produced).reduce((acc, [id, n]) => acc + n * SPECIES[id].Cp, 0);
    const heatJ = -th.dH * 1000 * st.extent;
    const adiabaticTK = +(T0 + (cpSum > 1e-9 ? heatJ / cpSum : 0)).toFixed(2);
    const gasMol = +Object.entries(st.produced).filter(([id]) => SPECIES[id].phase === 'g').reduce((a, [, n]) => a + n, 0).toFixed(6);
    const colorBefore = Object.keys(reagents).map(id => SPECIES[id]?.color).filter(Boolean)[0] ?? '#e2e8f0';
    const colorAfter = Object.keys(st.produced).map(id => SPECIES[id]?.color).filter(Boolean)[0] ?? colorBefore;
    const phaseChanges: string[] = [];
    if (adiabaticTK > SPECIES.H2O_l.boilK) phaseChanges.push('H2O(l)->H2O(g)');
    if (adiabaticTK > SPECIES.NaCl_s.meltK && (st.produced['NaCl_s'] ?? 0) > 0) phaseChanges.push('NaCl(s)->melt');
    const explosion = ignition && th.exothermic && adiabaticTK > 1200 && gasMol > 0;
    const crystallization = (st.produced['NaCl_s'] ?? 0) > 0 && Object.keys(st.leftover).some(id => SPECIES[id]?.phase === 'aq' || SPECIES[id]?.phase === 'l');
    const finalAmounts = st.leftover;
    const eventHash = sha256hex(stableStringify({ seed: this.seedBase, reaction: r.id, extent: st.extent, dH: th.dH, adiabaticTK, outcome: { gasMol, explosion, crystallization, colorChange: colorBefore !== colorAfter, phaseChanges } }));
    return { reactionId: r.id, stoich: st, thermo: th, adiabaticTK, outcome: { gasMol, explosion, crystallization, colorChange: colorBefore !== colorAfter, phaseChanges }, finalAmounts, eventHash };
  }
  commitToLedger(ledger: EvidenceLedger, res: LabResult): string {
    const input: NewEvidenceInput = { sourceUrl: 'genesis://lab/' + res.eventHash.slice(0, 12), sourceTimestamp: null, claim: 'reaction=' + (res.reactionId ?? 'none') + ' dH=' + (res.thermo?.dH ?? 0) + 'kJ Tad=' + res.adiabaticTK + 'K', claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'thermodynamic-lab-engine', independentSourceIds: [] } };
    return ledger.addRecord(input).record.contentHash;
  }
}
