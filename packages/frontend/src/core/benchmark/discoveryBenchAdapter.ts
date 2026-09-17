import { fnv1a, canonicalJson } from '../events/hash';
import { fitModelSpec, normalizeModelSpec, type ModelFit, type ModelPoint, type ModelSpec } from '../agent/modelSpace';
import { runDiscoveryCampaign, type CampaignLaboratory, type CampaignResult } from '../agent/discoveryCampaign';
import { EVOLUTION_FRESHWATER_FISH_CSV, EVOLUTION_FRESHWATER_FISH_CSV_SHA256 } from './discoveryBenchFixtureData';
import {
  DISCOVERYBENCH_ID,
  DISCOVERYBENCH_SOURCE,
  DISCOVERYBENCH_VERSION,
  EVOLUTION_FISH_CASES,
  EVOLUTION_FISH_DECLARED_VARIABLES,
  EVOLUTION_FISH_TARGET_VARIABLE,
  type EvolutionFishCaseSpec,
} from './discoveryBenchManifest';
import type { BenchmarkCase, BenchmarkDataset, BenchmarkDatasetFile } from './types';

/**
 * DISCOVERYBENCH ADAPTER — translates the frozen `evolution_freshwater_fish`
 * fixture into Genesis's OWN existing shapes (`ModelPoint`/`ModelSpec` from
 * `modelSpace.ts`, `CampaignLaboratory` for `discoveryCampaign.ts`) and reads
 * a real answer back out. No new fitting math, no new campaign loop: every
 * number here comes from calling the SAME `fitModelSpec`/`runDiscoveryCampaign`
 * this codebase already uses everywhere else.
 */

/** Minimal, honest CSV parsing: the header row is quoted, every data row here is plain unquoted numerics (verified against the frozen file — no embedded commas/quotes in data rows). */
function parseCsv(text: string): { readonly header: readonly string[]; readonly rows: readonly (readonly string[])[] } {
  const lines = text.split('\n').filter((l) => l.length > 0);
  const header = lines[0]!.split(',').map((h) => h.replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map((l) => l.split(','));
  return { header, rows };
}

export interface EvolutionFishRow {
  readonly rowIndex: number;
  readonly target: number;
  readonly vars: Readonly<Record<string, number>>;
}

/** Parses the embedded fixture into real numeric rows. Verifies the embedded string's own checksum first — see `discoveryBenchFixtureIntegrity` for the archival-copy cross-check. */
export function loadEvolutionFishRows(): readonly EvolutionFishRow[] {
  const { header, rows } = parseCsv(EVOLUTION_FRESHWATER_FISH_CSV);
  const targetIdx = header.indexOf(EVOLUTION_FISH_TARGET_VARIABLE);
  const varIdx = EVOLUTION_FISH_DECLARED_VARIABLES.map((v) => header.indexOf(v));
  if (targetIdx === -1 || varIdx.some((i) => i === -1)) {
    throw new Error('discoveryBenchAdapter: fixture CSV header does not contain the declared target/variable columns — refusing to fabricate a mapping.');
  }
  return rows.map((cells, i) => {
    const target = Number(cells[targetIdx]);
    const vars: Record<string, number> = {};
    EVOLUTION_FISH_DECLARED_VARIABLES.forEach((v, j) => { vars[v] = Number(cells[varIdx[j]!]); });
    return { rowIndex: i, target, vars };
  });
}

function caseFingerprint(spec: EvolutionFishCaseSpec, datasetFiles: readonly BenchmarkDatasetFile[]): string {
  return fnv1a(canonicalJson({
    benchmarkId: DISCOVERYBENCH_ID,
    benchmarkVersion: DISCOVERYBENCH_VERSION,
    caseId: spec.caseId,
    task: spec.task,
    expected: spec.expected,
    datasetFiles,
  }));
}

/** The frozen, ordered `BenchmarkCase[]` this run attempts — built once, never mutated after. */
export function buildEvolutionFishDataset(): BenchmarkDataset {
  const datasetFiles: readonly BenchmarkDatasetFile[] = [
    { path: DISCOVERYBENCH_SOURCE.originalPath + 'body-size-evolution-in-south-american-freshwater-fishes.csv', sha256: EVOLUTION_FRESHWATER_FISH_CSV_SHA256, byteLength: EVOLUTION_FRESHWATER_FISH_CSV.length },
  ];
  const cases: BenchmarkCase[] = [...EVOLUTION_FISH_CASES]
    .sort((a, b) => a.caseId.localeCompare(b.caseId)) // deterministic ordering (§9), independent of manifest declaration order
    .map((spec) => ({
      benchmarkId: DISCOVERYBENCH_ID,
      benchmarkVersion: DISCOVERYBENCH_VERSION,
      caseId: spec.caseId,
      task: spec.task,
      goldHypothesisText: spec.goldHypothesisText,
      expected: spec.expected,
      source: DISCOVERYBENCH_SOURCE,
      datasetFiles,
      fingerprint: caseFingerprint(spec, datasetFiles),
    }));
  return {
    benchmarkId: DISCOVERYBENCH_ID,
    benchmarkVersion: DISCOVERYBENCH_VERSION,
    cases,
    datasetFingerprint: fnv1a(canonicalJson(cases.map((c) => c.fingerprint))),
  };
}

/** The full published covariate model: CONSTANT + one LINEAR term per declared variable — exactly the grammar the real OLS study used, no search. */
export function fullCovariateModelSpec(): ModelSpec {
  return {
    id: 'discoverybench:evolution_freshwater_fish:full-covariate-ols',
    terms: [{ basis: 'CONSTANT' }, ...EVOLUTION_FISH_DECLARED_VARIABLES.map((variable) => ({ basis: 'LINEAR' as const, variable }))],
    lineage: null,
  };
}

function toModelPoints(rows: readonly EvolutionFishRow[]): readonly ModelPoint[] {
  // No real per-row measurement sigma is reported for this observational survey dataset (same honest situation
  // as the published OLS itself, which assumes homoscedastic unit-weighted errors) — sigma=1 for every row
  // reduces `fitModelSpec`'s weighted least squares to ordinary least squares, matching the study's own method.
  return rows.map((r) => ({ x: r.rowIndex, y: r.target, sigma: 1, vars: r.vars }));
}

/** FACET A — Genesis's `fitModelSpec` on the full, published covariate set. The most direct reproduction of the real study's own method. */
export function runFullCovariateFit(rows: readonly EvolutionFishRow[]) {
  return fitModelSpec(fullCovariateModelSpec(), toModelPoints(rows));
}

/**
 * `fitModelSpec` fits over `normalizeModelSpec(spec).terms` — sorted into
 * canonical (alphabetical-by-`termKey`) order, NOT the order `spec.terms` was
 * written in — so `fit.coefficients[i]` corresponds to the NORMALIZED term at
 * position `i`, never to `spec.terms[i]`. Reading a coefficient by variable
 * name must go through that same normalization, exactly once, here — not be
 * re-derived (and risked getting wrong) at every call site.
 */
export function linearCoefficientFor(
  spec: ModelSpec,
  fit: Extract<ModelFit, { ok: true }>,
  variable: string,
): { readonly coefficient: number; readonly standardError: number | null } | null {
  const index = normalizeModelSpec(spec).terms.findIndex((t) => t.basis === 'LINEAR' && t.variable === variable);
  if (index === -1) return null;
  return { coefficient: fit.coefficients[index]!, standardError: fit.standardErrors?.[index] ?? null };
}

/**
 * Bounds FACET B's round budget. The dataset is a completed observational
 * survey (all 460 rows already exist), so this is a diagnostic replay of
 * "which rows would the engine have prioritised", not a real sequential
 * experiment — it does not need to, and for a ~230000-fit-per-extra-round
 * cost at 11 candidate terms should not, walk all 460 rows to reach a
 * decisive, replayable conclusion.
 */
const AUTONOMOUS_CAMPAIGN_MAX_ROUNDS = 20;

/**
 * FACET B — Genesis's OWN autonomous `runDiscoveryCampaign`, given only the
 * candidate pool of 10 declared variables (no instruction on which matter),
 * restricted to LINEAR terms only (the real study's own grammar — no
 * LOG/POWER/RECIPROCAL/EXP_SATURATION/INTERACTION invented for a domain that
 * published none). The SAME canonical loop this codebase uses everywhere;
 * this benchmark does not fork or duplicate it. `candidateVars` is what makes
 * multi-variable SELECTION possible here (see `CampaignLaboratory`'s own
 * comment): every row's independent-variable values are known in advance in
 * this already-collected dataset, exactly the case that option exists for.
 */
export function runAutonomousCampaign(rows: readonly EvolutionFishRow[]): CampaignResult {
  const points = toModelPoints(rows);
  const byX = new Map(points.map((p) => [p.x, p]));
  const lab: CampaignLaboratory = {
    labId: 'discoverybench:evolution_freshwater_fish',
    problem: 'Which of the 10 declared evolutionary-rate/environmental variables explain spatial variation in speciation rates (BAMM_speciation), and with what sign?',
    candidateX: points.map((p) => p.x),
    observe: (x) => byX.get(x) ?? null,
    candidateVars: (x) => byX.get(x)?.vars,
    xRange: { min: 0, max: points.length - 1 },
    xLabel: 'row index',
    yLabel: EVOLUTION_FISH_TARGET_VARIABLE,
  };
  return runDiscoveryCampaign(lab, {
    maxRounds: AUTONOMOUS_CAMPAIGN_MAX_ROUNDS,
    maxTerms: EVOLUTION_FISH_DECLARED_VARIABLES.length + 1,
    excludeBases: ['LOG', 'RECIPROCAL', 'POWER', 'EXP_SATURATION', 'INTERACTION'],
    variables: EVOLUTION_FISH_DECLARED_VARIABLES,
  });
}
