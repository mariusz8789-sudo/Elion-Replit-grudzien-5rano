/**
 * Trendy okresowe: promień atomowy i pierwsza energia jonizacji.
 * Wartości: CRC Handbook of Chemistry and Physics; NIST Atomic Spectra
 * Database (energie jonizacji); promień atomowy — empiryczne wartości
 * Slatera (J.C. Slater, J. Chem. Phys. 41, 3199, 1964), standardowa
 * tabela dydaktyczna. Świadomie ograniczone do okresów 1–4 (Z=1–36) —
 * te wartości są ugruntowane i wielokrotnie zweryfikowane w podręcznikach;
 * dalsze okresy w backlogu, zamiast podawać niepewne liczby. Gazy szlachetne
 * nie mają dobrze zdefiniowanego promienia empirycznego/kowalencyjnego
 * (nie tworzą wiązań) — pominięte, zamiast zmyślać wartość (ten sam wzorzec
 * co `data/electronegativity.ts`).
 */
export interface PeriodicTrendPoint {
  z: number;
  /** Promień atomowy (empiryczny, Slater 1964), piktometry. null = brak ustalonej wartości. */
  radiusPm: number | null;
  /** Pierwsza energia jonizacji, kJ/mol. */
  ionizationKJ: number;
}

export const PERIODIC_TRENDS: Record<number, PeriodicTrendPoint> = Object.fromEntries(
  (
    [
      [1, 25, 1312], [2, null, 2372],
      [3, 145, 520], [4, 105, 899], [5, 85, 801], [6, 70, 1086], [7, 65, 1402], [8, 60, 1314], [9, 50, 1681], [10, null, 2081],
      [11, 180, 496], [12, 150, 738], [13, 125, 578], [14, 110, 786], [15, 100, 1012], [16, 100, 1000], [17, 100, 1251], [18, null, 1521],
      [19, 220, 419], [20, 180, 590], [21, 160, 633], [22, 140, 659], [23, 135, 651], [24, 140, 653], [25, 140, 717], [26, 140, 762],
      [27, 135, 760], [28, 135, 737], [29, 135, 745], [30, 135, 906], [31, 130, 579], [32, 125, 762], [33, 115, 947], [34, 115, 941],
      [35, 115, 1140], [36, null, 1351],
    ] as [number, number | null, number][]
  ).map(([z, radiusPm, ionizationKJ]) => [z, { z, radiusPm, ionizationKJ }]),
);

export const PERIODIC_TRENDS_MAX_Z = 36;
