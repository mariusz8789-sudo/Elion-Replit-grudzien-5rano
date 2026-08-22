/**
 * HOSPITAL & RESOURCE MODEL — warstwa systemu ochrony zdrowia nad istniejącym
 * modelem epidemii.
 *
 * DLACZEGO ISTNIEJE
 * `EpidemicCitySimulation` decyduje, KTO trafia do szpitala (`severeRate`), ale
 * nie modeluje żadnej pojemności: szpital przyjmuje dowolną liczbę pacjentów, a
 * podwyższone ryzyko zgonu hospitalizowanych jest stałą (×3), niezależną od
 * obciążenia. Dla bliźniaka epidemicznego to jest luka krytyczna — całe pytanie
 * zdrowia publicznego brzmi „czy system się przeciąży i co się wtedy dzieje".
 *
 * ZASADA UCZCIWOŚCI
 * Ten moduł NIE wymyśla pacjentów. Przyjmuje REALNĄ liczbę hospitalizowanych
 * agentów z modelu i rozdziela ją na dostępne łóżka, raportując nadmiar.
 * Wszystko, czego nie da się wyprowadzić z modelu, jest jawnie oznaczone jako
 * NOT_MODELED i nie jest zgadywane.
 *
 * SPRZĘŻENIE ZWROTNE
 * Przeciążenie → wyższa śmiertelność jest realną decyzją modelową, która ZMIENIA
 * wyniki epidemii. Dlatego `mortalityFeedback` jest domyślnie WYŁĄCZONE:
 * włączenie go jest świadomym wyborem naukowym, a nie efektem ubocznym
 * dołożenia tej warstwy. Bez niego moduł jest czystą księgowością zasobów.
 *
 * Czyste funkcje, deterministyczne, testowalne bez WebGL i bez zegara.
 */

/** Czego ten moduł świadomie NIE modeluje — deklaracja, nie zaślepka. */
export const HOSPITAL_NOT_MODELED = [
  'staff-availability',        // model nie zna personelu ani grafików
  'consumables',               // brak zużycia tlenu/leków/PPE w modelu źródłowym
  'transfers-between-sites',   // jeden szpital w layoucie, brak sieci placówek
  'triage-policy',             // model nie opisuje reguł triażu
  'length-of-stay-per-patient', // model nie śledzi indywidualnego czasu pobytu
] as const;

export type HospitalNotModeled = (typeof HOSPITAL_NOT_MODELED)[number];

export type HospitalStatus = 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL';

export interface HospitalCapacityParams {
  /** Łóżka ogólne. Musi pochodzić z danych placówki, nie z domysłu. */
  totalBeds: number;
  /** Łóżka intensywnej terapii (podzbiór opieki, liczony osobno). */
  icuBeds: number;
  /** Udział przyjęć wymagających ICU (0..1). */
  icuShareOfAdmissions: number;
  /**
   * Czy przeciążenie ma podnosić śmiertelność. DOMYŚLNIE FALSE — włączenie
   * zmienia wyniki epidemii i musi być świadomą decyzją naukową.
   */
  mortalityFeedback?: boolean;
  /** Mnożnik ryzyka zgonu dla pacjenta, dla którego zabrakło miejsca. */
  unmetCareMortalityMultiplier?: number;
}

export const DEFAULT_HOSPITAL_CAPACITY: HospitalCapacityParams = {
  totalBeds: 24,
  icuBeds: 6,
  icuShareOfAdmissions: 0.22,
  mortalityFeedback: false,
  unmetCareMortalityMultiplier: 2,
};

export interface HospitalState {
  /** Dzień symulacji odczytany z modelu — nie własny zegar. */
  day: number;
  /** Ilu agentów model faktycznie oznaczył jako hospitalizowanych. */
  requiredCare: number;
  /** Zajęte łóżka ogólne (bez ICU). */
  occupiedBeds: number;
  /** Zajęte łóżka ICU. */
  occupiedIcu: number;
  /** Pacjenci wymagający opieki, dla których zabrakło miejsca. */
  unmetCare: number;
  /** 0..1; >1 niemożliwe, bo nadmiar trafia do `unmetCare`. */
  bedOccupancy: number;
  icuOccupancy: number;
  status: HospitalStatus;
}

/** Próg statusu liczony z faktycznego obłożenia; brak miejsc = CRITICAL. */
export function hospitalStatusFor(bedOccupancy: number, icuOccupancy: number, unmetCare: number): HospitalStatus {
  if (unmetCare > 0) return 'CRITICAL';
  const worst = Math.max(bedOccupancy, icuOccupancy);
  if (worst >= 0.95) return 'CRITICAL';
  if (worst >= 0.8) return 'HIGH';
  if (worst >= 0.6) return 'WARNING';
  return 'NORMAL';
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Rozdziela REALNĄ liczbę hospitalizowanych agentów na dostępne łóżka.
 *
 * `hospitalizedNow` MUSI pochodzić z modelu (`stats().hospitalizowani`).
 * Funkcja nie generuje pacjentów i nie zmienia stanu epidemii — zwraca wyłącznie
 * obraz obciążenia systemu w danym dniu.
 */
export function evaluateHospitalState(
  input: { day: number; hospitalizedNow: number },
  params: HospitalCapacityParams = DEFAULT_HOSPITAL_CAPACITY,
): HospitalState {
  const totalBeds = clampNonNegative(params.totalBeds);
  const icuBeds = clampNonNegative(params.icuBeds);
  const required = clampNonNegative(input.hospitalizedNow);
  const icuShare = Math.min(1, Math.max(0, params.icuShareOfAdmissions));

  // Podział zapotrzebowania na intensywną i ogólną: udział pochodzi z parametru
  // placówki, a nie z losowania — ten sam wsad daje ten sam wynik.
  const icuNeeded = Math.round(required * icuShare);
  const generalNeeded = required - icuNeeded;

  const occupiedIcu = Math.min(icuNeeded, icuBeds);
  const icuOverflow = icuNeeded - occupiedIcu;

  // Pacjent ICU bez miejsca w ICU może zająć łóżko ogólne (gorsza opieka,
  // ale nadal opieka) — dopiero brak obu miejsc daje `unmetCare`.
  const generalDemand = generalNeeded + icuOverflow;
  const occupiedBeds = Math.min(generalDemand, totalBeds);
  const unmetCare = generalDemand - occupiedBeds;

  const bedOccupancy = totalBeds > 0 ? occupiedBeds / totalBeds : 0;
  const icuOccupancy = icuBeds > 0 ? occupiedIcu / icuBeds : 0;

  return {
    day: input.day,
    requiredCare: required,
    occupiedBeds,
    occupiedIcu,
    unmetCare,
    bedOccupancy,
    icuOccupancy,
    status: hospitalStatusFor(bedOccupancy, icuOccupancy, unmetCare),
  };
}

/**
 * Mnożnik ryzyka zgonu wynikający z braku miejsca. Zwraca 1 (brak wpływu), gdy
 * sprzężenie jest wyłączone albo nikt nie został bez opieki — dzięki temu
 * dołożenie tej warstwy samo z siebie nie zmienia wyników modelu.
 */
export function unmetCareMortalityFactor(
  state: HospitalState,
  params: HospitalCapacityParams = DEFAULT_HOSPITAL_CAPACITY,
): number {
  if (!params.mortalityFeedback) return 1;
  if (state.unmetCare <= 0 || state.requiredCare <= 0) return 1;
  const multiplier = params.unmetCareMortalityMultiplier ?? 2;
  const unmetShare = state.unmetCare / state.requiredCare;
  // Interpolacja liniowa: cała kohorta bez opieki => pełny mnożnik.
  return 1 + (multiplier - 1) * unmetShare;
}

/** Szczyt obciążenia w serii dni — do raportu scenariusza. */
export function peakHospitalPressure(series: readonly HospitalState[]): {
  peakBedOccupancy: number;
  peakIcuOccupancy: number;
  totalUnmetCareDays: number;
  firstCriticalDay: number | null;
} {
  let peakBedOccupancy = 0;
  let peakIcuOccupancy = 0;
  let totalUnmetCareDays = 0;
  let firstCriticalDay: number | null = null;
  for (const s of series) {
    peakBedOccupancy = Math.max(peakBedOccupancy, s.bedOccupancy);
    peakIcuOccupancy = Math.max(peakIcuOccupancy, s.icuOccupancy);
    if (s.unmetCare > 0) totalUnmetCareDays += 1;
    if (firstCriticalDay === null && s.status === 'CRITICAL') firstCriticalDay = s.day;
  }
  return { peakBedOccupancy, peakIcuOccupancy, totalUnmetCareDays, firstCriticalDay };
}
