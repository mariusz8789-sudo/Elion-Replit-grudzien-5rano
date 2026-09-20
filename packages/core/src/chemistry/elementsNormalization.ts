/* Proprietary / All Rights Reserved - Genesis OS */
import type { AtomicWeightView, ChemicalElement, EpistemicData, PhaseView } from './genesisChemistryTypes.js';

/** Elements with no standard atomic weight from a natural isotopic composition. */
export const NO_STANDARD_WEIGHT = new Set<string>([
  'Tc', 'Pm', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Pa', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No',
  'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);

export function atomicWeightView(e: ChemicalElement): AtomicWeightView {
  if (NO_STANDARD_WEIGHT.has(e.symbol)) {
    return {
      kind: 'MASS_NUMBER',
      value: Math.round(e.standardAtomicWeight),
      lowerBound: null,
      upperBound: null,
      representativeMassNumber: Math.round(e.standardAtomicWeight),
    };
  }
  return {
    kind: e.atomicWeightKind ?? 'STANDARD',
    value: e.standardAtomicWeight,
    lowerBound: null,
    upperBound: null,
    representativeMassNumber: null,
  };
}

/** Partial verified phase/property seed; remaining values stay explicitly unknown. */
export const PHASE_DATA: Readonly<Record<string, {
  meltK: number | null;
  boilK: number | null;
  phase298K: 'solid' | 'liquid' | 'gas';
  epistemic: EpistemicData;
}>> = {
  H: { meltK: 13.8, boilK: 20.3, phase298K: 'gas', epistemic: 'REFERENCE_DATA' },
  He: { meltK: 0.95, boilK: 4.22, phase298K: 'gas', epistemic: 'REFERENCE_DATA' },
  Li: { meltK: 453.65, boilK: 1615, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  C: { meltK: 3800, boilK: 4300, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  N: { meltK: 63.15, boilK: 77.36, phase298K: 'gas', epistemic: 'REFERENCE_DATA' },
  O: { meltK: 54.36, boilK: 90.20, phase298K: 'gas', epistemic: 'REFERENCE_DATA' },
  F: { meltK: 53.48, boilK: 85.03, phase298K: 'gas', epistemic: 'REFERENCE_DATA' },
  Na: { meltK: 370.87, boilK: 1156.1, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Mg: { meltK: 923, boilK: 1363, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Al: { meltK: 933.47, boilK: 2792, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Si: { meltK: 1687, boilK: 3538, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  P: { meltK: 317.3, boilK: 553.7, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  S: { meltK: 388.36, boilK: 717.87, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Cl: { meltK: 171.6, boilK: 239.11, phase298K: 'gas', epistemic: 'REFERENCE_DATA' },
  K: { meltK: 336.53, boilK: 1032, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Ca: { meltK: 1115, boilK: 1757, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Fe: { meltK: 1811, boilK: 3134, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Cu: { meltK: 1357.77, boilK: 2835, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Zn: { meltK: 692.68, boilK: 1180, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Br: { meltK: 265.8, boilK: 332, phase298K: 'liquid', epistemic: 'REFERENCE_DATA' },
  Ag: { meltK: 1234.93, boilK: 2435, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  I: { meltK: 386.85, boilK: 457.4, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Hg: { meltK: 234.32, boilK: 629.88, phase298K: 'liquid', epistemic: 'REFERENCE_DATA' },
  Au: { meltK: 1337.33, boilK: 3129, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  Pb: { meltK: 600.61, boilK: 2022, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
  U: { meltK: 1405.3, boilK: 4404, phase298K: 'solid', epistemic: 'REFERENCE_DATA' },
};

function phaseAtTemperature(tempK: number, meltK: number | null, boilK: number | null): 'solid' | 'liquid' | 'gas' | 'UNKNOWN' {
  if (meltK === null || boilK === null) return 'UNKNOWN';
  if (tempK < meltK) return 'solid';
  if (tempK < boilK) return 'liquid';
  return 'gas';
}

export function phaseView(e: ChemicalElement): PhaseView {
  const row = PHASE_DATA[e.symbol];
  if (row) {
    return {
      phase273K: phaseAtTemperature(273.15, row.meltK, row.boilK),
      phase298K: phaseAtTemperature(298.15, row.meltK, row.boilK),
      meltK: row.meltK,
      boilK: row.boilK,
      epistemic: row.epistemic,
    };
  }
  const predicted = e.atomicNumber >= 104 || NO_STANDARD_WEIGHT.has(e.symbol);
  return {
    phase273K: 'UNKNOWN',
    phase298K: e.phaseAtSTP,
    meltK: null,
    boilK: null,
    epistemic: predicted ? 'PREDICTED_DATA' : 'REFERENCE_DATA',
  };
}

export const propertyEpistemic = (e: ChemicalElement, field: 'phase' | 'config' | 'weight'): EpistemicData => {
  if (field === 'config') return e.configPredicted ? 'PREDICTED_DATA' : 'REFERENCE_DATA';
  if (field === 'phase') return phaseView(e).epistemic;
  return NO_STANDARD_WEIGHT.has(e.symbol) ? 'REFERENCE_DATA' : 'REFERENCE_DATA';
};
