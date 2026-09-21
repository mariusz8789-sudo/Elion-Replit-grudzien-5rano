export interface UncertainValue { readonly value: number; readonly standardUncertainty: number }
export interface PropagationTerm { readonly derivative: number; readonly standardUncertainty: number }

export class UncertaintyEngine {
  absolute(input: UncertainValue): number { return Math.abs(input.standardUncertainty); }
  relative(input: UncertainValue): number { return input.value === 0 ? Number.POSITIVE_INFINITY : Math.abs(input.standardUncertainty / input.value); }
  combined(uncertainties: readonly number[]): number { return Math.sqrt(uncertainties.reduce((sum, u) => sum + u * u, 0)); }
  propagateFirstOrder(terms: readonly PropagationTerm[]): number {
    return Math.sqrt(terms.reduce((sum, term) => sum + (term.derivative * term.standardUncertainty) ** 2, 0));
  }
}
