export type PhysicalDimension =
  | 'TEMPERATURE'
  | 'PRESSURE'
  | 'MASS'
  | 'LENGTH'
  | 'TIME'
  | 'VOLTAGE'
  | 'CURRENT'
  | 'FLOW_RATE'
  | 'CONCENTRATION'
  | 'DIMENSIONLESS';

export type SupportedUnit = 'K' | 'C' | 'Pa' | 'kPa' | 'MPa' | 'GPa' | 'kg' | 'g' | 'm' | 'mm' | 's' | 'ms' | 'V' | 'A' | 'L/min' | 'mol/L' | '1';

export interface PhysicalQuantity {
  readonly value: number;
  readonly unit: SupportedUnit;
  readonly dimension: PhysicalDimension;
}

type UnitDef = { readonly dimension: PhysicalDimension; readonly toBase: (x: number) => number; readonly fromBase: (x: number) => number };

const UNITS: Record<SupportedUnit, UnitDef> = {
  K: { dimension: 'TEMPERATURE', toBase: (x) => x, fromBase: (x) => x },
  C: { dimension: 'TEMPERATURE', toBase: (x) => x + 273.15, fromBase: (x) => x - 273.15 },
  Pa: { dimension: 'PRESSURE', toBase: (x) => x, fromBase: (x) => x },
  kPa: { dimension: 'PRESSURE', toBase: (x) => x * 1e3, fromBase: (x) => x / 1e3 },
  MPa: { dimension: 'PRESSURE', toBase: (x) => x * 1e6, fromBase: (x) => x / 1e6 },
  GPa: { dimension: 'PRESSURE', toBase: (x) => x * 1e9, fromBase: (x) => x / 1e9 },
  kg: { dimension: 'MASS', toBase: (x) => x, fromBase: (x) => x },
  g: { dimension: 'MASS', toBase: (x) => x / 1000, fromBase: (x) => x * 1000 },
  m: { dimension: 'LENGTH', toBase: (x) => x, fromBase: (x) => x },
  mm: { dimension: 'LENGTH', toBase: (x) => x / 1000, fromBase: (x) => x * 1000 },
  s: { dimension: 'TIME', toBase: (x) => x, fromBase: (x) => x },
  ms: { dimension: 'TIME', toBase: (x) => x / 1000, fromBase: (x) => x * 1000 },
  V: { dimension: 'VOLTAGE', toBase: (x) => x, fromBase: (x) => x },
  A: { dimension: 'CURRENT', toBase: (x) => x, fromBase: (x) => x },
  'L/min': { dimension: 'FLOW_RATE', toBase: (x) => x, fromBase: (x) => x },
  'mol/L': { dimension: 'CONCENTRATION', toBase: (x) => x, fromBase: (x) => x },
  '1': { dimension: 'DIMENSIONLESS', toBase: (x) => x, fromBase: (x) => x },
};

export function quantity(value: number, unit: SupportedUnit): PhysicalQuantity {
  if (!Number.isFinite(value)) throw new Error('Physical quantity must be finite');
  return { value, unit, dimension: UNITS[unit].dimension };
}

export function convertQuantity(input: PhysicalQuantity, target: SupportedUnit): PhysicalQuantity {
  const sourceDef = UNITS[input.unit];
  const targetDef = UNITS[target];
  if (sourceDef.dimension !== targetDef.dimension || input.dimension !== sourceDef.dimension) throw new Error('Dimension mismatch');
  return quantity(targetDef.fromBase(sourceDef.toBase(input.value)), target);
}

export function addQuantities(a: PhysicalQuantity, b: PhysicalQuantity): PhysicalQuantity {
  if (a.dimension !== b.dimension) throw new Error(`Cannot add ${a.dimension} and ${b.dimension}`);
  const converted = convertQuantity(b, a.unit);
  return quantity(a.value + converted.value, a.unit);
}
