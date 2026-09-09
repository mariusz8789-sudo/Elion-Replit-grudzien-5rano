import type { DomainSolver } from '../worldModel/solvers/solverRouter';

/**
 * A REAL, CITED alternative equation for the same quantity a registered
 * solver already computes — never a rename, never a re-parameterization of
 * the same formula (that is what a lever's `apply` already does).
 *
 * Registering one changes nothing by itself: `SolverRouter` only ever runs
 * whatever `domainBinding.solverId` an entity is actually bound to, so an
 * alternative sits inert in this registry until something rebinds an entity
 * to it — which is exactly what `discoveryLoop.ts`'s own regeneration step
 * does at runtime, after a clean falsification, before the very next
 * experiment.
 *
 * Mirrors `FragilityRegistry`'s (`seismicFragility.ts`) citation discipline:
 * an uncited alternative model is indistinguishable from an invented one.
 */
export interface StructuralAlternative {
  /** The solver id this is an alternative TO — what a refutation must have run under for this to apply. */
  readonly incumbentSolverId: string;
  readonly alternativeSolverId: string;
  readonly alternativeSolver: DomainSolver;
  /** What structurally differs, in one sentence a derived hypothesis's statement can quote. */
  readonly statement: string;
  readonly citation: string;
}

/**
 * The registry a real, cited structural alternative is added to. Registration
 * is validated rather than trusted, the same discipline `FragilityRegistry`
 * already established for a different domain's alternative-model registry.
 */
export class StructuralAlternativeRegistry {
  private readonly byIncumbent = new Map<string, StructuralAlternative[]>();

  register(alternative: StructuralAlternative): void {
    if (!alternative.citation.trim()) {
      throw new Error(
        `StructuralAlternativeRegistry: "${alternative.alternativeSolverId}" has no citation. An uncited alternative model is indistinguishable from an invented one.`,
      );
    }
    const existing = this.byIncumbent.get(alternative.incumbentSolverId) ?? [];
    this.byIncumbent.set(alternative.incumbentSolverId, [...existing, alternative]);
  }

  alternativesFor(incumbentSolverId: string): readonly StructuralAlternative[] {
    return this.byIncumbent.get(incumbentSolverId) ?? [];
  }
}

/**
 * The one shared runtime registry every domain's structural alternatives
 * register into, mirroring `FragilityRegistry` being a single shared
 * instance rather than one per caller — so `discoveryLoop.ts`'s regeneration
 * step can look up an alternative for ANY domain's incumbent solver without
 * that domain having to wire anything into the loop itself.
 */
export const GENESIS_STRUCTURAL_ALTERNATIVES = new StructuralAlternativeRegistry();
