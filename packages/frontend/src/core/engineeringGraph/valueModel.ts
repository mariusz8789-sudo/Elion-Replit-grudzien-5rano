/**
 * Typed value model dla warstwy inżynierskiej (Machine Pre-Build Simulator,
 * Faza 0). Świadoma decyzja architektoniczna: rdzenny ModelGraph
 * (core/modelGraph) NADAL liczy na skalarach `number` — bo propagacja
 * rozkładów/pól wymagałaby solvera numerycznego, którego NIE budujemy (zakaz
 * CFD/FEA/DEM). Ten model to warstwa TYPÓW i PREZENTACJI nad skalarną
 * wartością węzła: opisuje, CZYM wielkość jest (skalar, przedział,
 * rozkład, odwołanie do szeregu czasowego / wyniku solvera), nie udając, że
 * potrafimy ją policzyć inaczej niż jako skalar.
 *
 * Faza 0/1 realnie UŻYWA tylko 'scalar' i 'range'. Pozostałe rodzaje są
 * jawnie oznaczone jako `computed: false` — istnieją jako typy, żeby przyszłe
 * fazy (eksport do solvera zewnętrznego) miały gdzie zawiesić dane, ale
 * DZIŚ nie niosą policzonych wartości i UI musi to pokazywać wprost.
 */

export type EngineeringValueKind = 'scalar' | 'range' | 'distribution' | 'timeseries-ref' | 'field-ref';

/** Dokładna, pojedyncza wartość liczbowa (to, co rdzenny graf faktycznie liczy). */
export interface ScalarValue {
  kind: 'scalar';
  value: number;
  unit: string;
}

/** Przedział [min, max] — np. tolerancja parametru albo zakres pewności. `nominal` to wartość używana w obliczeniach skalarnych. */
export interface RangeValue {
  kind: 'range';
  nominal: number;
  min: number;
  max: number;
  unit: string;
}

/** Rozkład — TYP-ZAŚLEPKA (Faza 0): opisuje zamiar, ale wartości nie są propagowane (brak solvera). `computed:false`. */
export interface DistributionValue {
  kind: 'distribution';
  nominal: number;
  unit: string;
  computed: false;
  note: string;
}

/** Odwołanie do szeregu czasowego — TYP-ZAŚLEPKA (Faza 0). `computed:false`. */
export interface TimeSeriesRef {
  kind: 'timeseries-ref';
  unit: string;
  computed: false;
  note: string;
}

/** Odwołanie do wyniku solvera pola (CFD/FEA/DEM) — TYP-ZAŚLEPKA (Faza 0). Miejsce na przyszły eksport/import, dziś bez wartości. `computed:false`. */
export interface FieldRef {
  kind: 'field-ref';
  unit: string;
  computed: false;
  note: string;
}

export type EngineeringValue = ScalarValue | RangeValue | DistributionValue | TimeSeriesRef | FieldRef;

/** Czy dana wielkość ma DZIŚ policzoną wartość liczbową (skalar/przedział), czy jest tylko typem-zaślepką na przyszły solver. */
export function isComputed(v: EngineeringValue): boolean {
  return v.kind === 'scalar' || v.kind === 'range';
}

/** Wartość skalarna reprezentatywna do obliczeń/prezentacji (nominal dla range, value dla scalar; NaN dla niepoliczonych rodzajów). */
export function representativeScalar(v: EngineeringValue): number {
  switch (v.kind) {
    case 'scalar': return v.value;
    case 'range': return v.nominal;
    case 'distribution': return v.nominal;
    default: return NaN;
  }
}

export function formatEngineeringValue(v: EngineeringValue, digits = 3): string {
  const fmt = (n: number) => {
    if (!Number.isFinite(n)) return '—';
    const a = Math.abs(n);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) return n.toExponential(2);
    return Number(n.toFixed(digits)).toString();
  };
  switch (v.kind) {
    case 'scalar': return `${fmt(v.value)} ${v.unit}`.trim();
    case 'range': return `${fmt(v.nominal)} ${v.unit} (${fmt(v.min)}–${fmt(v.max)})`.trim();
    case 'distribution': return `~${fmt(v.nominal)} ${v.unit} (rozkład — niepoliczony)`.trim();
    case 'timeseries-ref': return `szereg czasowy (niepoliczony)`;
    case 'field-ref': return `pole / wynik solvera (niepoliczony)`;
  }
}

export const scalar = (value: number, unit: string): ScalarValue => ({ kind: 'scalar', value, unit });
export const range = (nominal: number, min: number, max: number, unit: string): RangeValue => ({ kind: 'range', nominal, min, max, unit });
