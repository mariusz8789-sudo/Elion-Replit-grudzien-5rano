export interface KitaevBulkParameters {
  chemicalPotential: number;
  hopping: number;
  pairing: number;
}

export type KitaevBulkPhase = 'TOPOLOGICAL_REGIME' | 'TRIVIAL_REGIME' | 'CRITICAL_BOUNDARY';

/** Dokładna dodatnia gałąź pasma bulk BdG używana także przez renderer Q2. */
export function kitaevBulkEnergyAtMomentum(k: number, parameters: KitaevBulkParameters): number {
  const { chemicalPotential: mu, hopping: t, pairing: delta } = parameters;
  return Math.sqrt((-2 * t * Math.cos(k) - mu) ** 2 + 4 * delta * delta * Math.sin(k) ** 2);
}

export interface KitaevBulkResult {
  bulkGap: number;
  momentumAtGap: number;
  topologicalInvariant: -1 | 0 | 1;
  phase: KitaevBulkPhase;
  criticalChemicalPotentialNegative: number;
  criticalChemicalPotentialPositive: number;
  finiteSizeCaveat: string;
}

const EPSILON = 1e-10;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Exact minimization of E(k)^2 over cos(k) ∈ [-1, 1] for the translationally
 * invariant spinless p-wave Kitaev chain:
 * E(k)^2 = (-2t cos(k) - μ)^2 + 4Δ² sin²(k).
 *
 * This is a bulk toy model, not a finite-wire, material, device or hardware
 * simulation. It deliberately exposes no claim about Majorana 1.
 */
export function solveKitaevBulk(parameters: KitaevBulkParameters): KitaevBulkResult {
  const { chemicalPotential: mu, hopping: t, pairing: delta } = parameters;
  if (!Number.isFinite(mu) || !Number.isFinite(t) || !Number.isFinite(delta)) {
    throw new Error('Parametry modelu Kitaeva muszą być skończonymi liczbami.');
  }
  if (Math.abs(t) <= EPSILON) throw new Error('Parametr hopping t musi być różny od zera.');
  if (Math.abs(delta) <= EPSILON) throw new Error('Parametr pairing Δ musi być różny od zera dla modelu p-wave.');

  // f(x) = (μ + 2tx)^2 + 4Δ²(1-x²), where x = cos(k).
  const candidateXs = [-1, 1];
  const quadratic = 4 * (t * t - delta * delta);
  if (quadratic > EPSILON) candidateXs.push(clamp((-2 * mu * t) / quadratic, -1, 1));

  let minEnergySquared = Number.POSITIVE_INFINITY;
  let xAtGap = 1;
  for (const x of candidateXs) {
    const energySquared = kitaevBulkEnergyAtMomentum(Math.acos(clamp(x, -1, 1)), parameters) ** 2;
    if (energySquared < minEnergySquared) {
      minEnergySquared = energySquared;
      xAtGap = x;
    }
  }

  const threshold = 2 * Math.abs(t);
  const absoluteMu = Math.abs(mu);
  const phase: KitaevBulkPhase = Math.abs(absoluteMu - threshold) <= EPSILON
    ? 'CRITICAL_BOUNDARY'
    : absoluteMu < threshold ? 'TOPOLOGICAL_REGIME' : 'TRIVIAL_REGIME';
  const topologicalInvariant: -1 | 0 | 1 = phase === 'TOPOLOGICAL_REGIME' ? -1 : phase === 'TRIVIAL_REGIME' ? 1 : 0;

  return {
    bulkGap: Math.sqrt(Math.max(0, minEnergySquared)),
    momentumAtGap: Math.acos(clamp(xAtGap, -1, 1)),
    topologicalInvariant,
    phase,
    criticalChemicalPotentialNegative: -threshold,
    criticalChemicalPotentialPositive: threshold,
    finiteSizeCaveat: 'Klasyfikacja dotyczy translacyjnie niezmiennego bulk modelu. Skończony otwarty łańcuch może wykazywać rozszczepienie niskoenergetycznych stanów brzegowych; wynik nie symuluje materiału, nanodrutu ani urządzenia Majorana 1.',
  };
}
