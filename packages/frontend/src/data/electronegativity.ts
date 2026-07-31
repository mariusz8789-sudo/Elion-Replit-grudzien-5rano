/**
 * Elektroujemność Paulinga (χ) — bezwymiarowa miara zdolności atomu do
 * przyciągania wspólnej pary elektronowej w wiązaniu. Wartości: standardowe
 * tablice chemiczne (CRC Handbook of Chemistry and Physics). Gazy szlachetne
 * oraz większość pierwiastków promieniotwórczych/superciężkich nie mają
 * ustalonej wartości Paulinga — świadomie pominięte (rekord niepełny),
 * zamiast zmyślać liczbę.
 */
export const PAULING_ELECTRONEGATIVITY: Record<string, number> = {
  H: 2.2,
  Li: 0.98, Be: 1.57, B: 2.04, C: 2.55, N: 3.04, O: 3.44, F: 3.98,
  Na: 0.93, Mg: 1.31, Al: 1.61, Si: 1.9, P: 2.19, S: 2.58, Cl: 3.16,
  K: 0.82, Ca: 1.0, Sc: 1.36, Ti: 1.54, V: 1.63, Cr: 1.66, Mn: 1.55, Fe: 1.83, Co: 1.88, Ni: 1.91, Cu: 1.9, Zn: 1.65,
  Ga: 1.81, Ge: 2.01, As: 2.18, Se: 2.55, Br: 2.96,
  Rb: 0.82, Sr: 0.95, Y: 1.22, Zr: 1.33, Nb: 1.6, Mo: 2.16, Tc: 1.9, Ru: 2.2, Rh: 2.28, Pd: 2.2, Ag: 1.93, Cd: 1.69,
  In: 1.78, Sn: 1.96, Sb: 2.05, Te: 2.1, I: 2.66,
  Cs: 0.79, Ba: 0.89, La: 1.1,
  Hf: 1.3, Ta: 1.5, W: 2.36, Re: 1.9, Os: 2.2, Ir: 2.2, Pt: 2.28, Au: 2.54, Hg: 2.0,
  Tl: 1.62, Pb: 2.33, Bi: 2.02, Po: 2.0, At: 2.2,
  Fr: 0.7, Ra: 0.9,
};
