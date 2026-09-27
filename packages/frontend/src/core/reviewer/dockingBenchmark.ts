import prereg from '../../../../../docs/evidence/astex-redock-prereg.json';
import run1 from '../../../../../docs/evidence/astex-redock-benchmark-2026-09-27-run1.json';
import run2 from '../../../../../docs/evidence/astex-redock-benchmark-2026-09-27-run2.json';
import run3 from '../../../../../docs/evidence/astex-redock-benchmark-2026-09-27-run3.json';

/**
 * REVIEWER DOCKING BENCHMARK — the Astex Diverse Set redock, every run.
 *
 * Produced by `scripts/astex-redock-benchmark.py` with the same
 * `dock_worker.py redock` code the 1IEP imatinib case uses, on all 85 Astex
 * complexes. The protocol, the case list and every amendment (with the smoke
 * results that caused it) are in `docs/evidence/astex-redock-prereg.json`.
 *
 * Run 1 is the protocol as frozen. Run 2 adds Meeko's residue-template
 * tolerance and was declared AFTER run-1 failures were seen, so it is shown
 * next to run 1, never instead of it. Run 3 (amendment 4) keeps binding-site
 * cofactors and fixes the remaining preparation failures with general rules; it
 * is the run under the current preregistered protocol, and runs 1 and 2 stay
 * published under their earlier fingerprints. Every case counts in the headline: a
 * case that failed before a pose existed is a failure, not an exclusion.
 */

export interface BenchmarkCase {
  readonly pdbId: string;
  readonly status: string;
  readonly success: boolean;
  readonly rmsdA?: number;
  readonly vinaScoreKcalMol?: number;
  readonly ligandResidue?: string;
  /** RDKit canonical SMILES of the crystal ligand actually docked — the key the contamination check compares on (D-150). */
  readonly ligandSmiles?: string;
  readonly error?: string;
}

export interface BenchmarkRun {
  readonly run: string;
  readonly protocolFingerprint: string;
  readonly finishedAt: string;
  readonly versions: Readonly<Record<string, string>>;
  readonly summary: {
    readonly cases: number;
    readonly docked: number;
    readonly successes: number;
    readonly successRate: number;
    readonly successRateAmongDocked: number;
    readonly preparationOrDockingFailures: number;
  };
  readonly cases: readonly BenchmarkCase[];
}

export const ASTEX_PREREG = prereg as unknown as {
  readonly protocol: Readonly<Record<string, string>>;
  readonly protocolFingerprint: string;
  readonly amendments: readonly { readonly amendedAt: string; readonly field: string; readonly reason: string }[];
  readonly cases: readonly { readonly pdbId: string }[];
};

export const ASTEX_RUNS: readonly BenchmarkRun[] = [
  run1 as unknown as BenchmarkRun,
  run2 as unknown as BenchmarkRun,
  run3 as unknown as BenchmarkRun,
];

/** The one case a reviewer of an imatinib story will look for: imatinib (STI) in c-KIT, PDB 1T46. */
export function imatinibKitCase(run: BenchmarkRun): BenchmarkCase | undefined {
  return run.cases.find((c) => c.pdbId === '1T46');
}
