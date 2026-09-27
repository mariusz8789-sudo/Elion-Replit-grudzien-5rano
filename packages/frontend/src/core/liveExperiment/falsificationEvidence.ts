import { canonicalJson, fnv1a } from '../events/hash';
import { ASTEX_PREREG, ASTEX_RUNS, type BenchmarkRun } from '../reviewer/dockingBenchmark';
import redockEvidence from '../../../../../docs/evidence/finalist-falsification-2026-09-27.json';
import type { LiveDrugRunState } from './drugRunState';

/**
 * FALSIFICATION EVIDENCE FOR A DRUG FINALIST (D-150).
 *
 * `selfFalsificationBattery.ts` leaves a probe UNRESOLVED unless the caller can point at evidence.
 * Until D-150 the live drug bench could point at three things (the server's preregistration record,
 * the number of docked candidates, the receptor/pose checksums) and the other ten probes stood
 * UNRESOLVED. This module assembles, from records that ALREADY EXIST, the evidence the remaining ten
 * need. Nothing here is typed in by hand and nothing is a threshold invented to make a probe pass:
 *
 *   - `docs/evidence/finalist-falsification-2026-09-27.json` — a REAL run of
 *     `scripts/finalist-falsification-evidence.py` over `dock_worker.py` (AutoDock Vina 1.2.7 +
 *     Meeko 0.8.0 + RDKit): the co-crystallised ligand of the run's own target redocked at five
 *     (seed, exhaustiveness) settings, and a declared control set (one further type-II ABL1
 *     inhibitor, five unrelated approved drugs) docked into the same prepared receptor. Its protocol
 *     and its thresholds were frozen in the script before any number was read, and both the protocol
 *     and the body carry a sha256. Gives NUMERICAL_ARTIFACT (score/pose stability across seeds),
 *     MEASUREMENT_ARTIFACT (heavy-atom RMSD against the deposited X-ray pose — an independent
 *     channel that shares no code path with Vina), ALTERNATIVE_MODEL (comparator separation) and the
 *     independent-measurement declaration TAUTOLOGY needs.
 *   - `core/reviewer/dockingBenchmark.ts` — the Astex Diverse Set redock, 85 complexes, three runs
 *     under a preregistered protocol. Gives DATASET_CONTAMINATION (does the validation set contain
 *     the molecules the campaign is testing?), LEAKAGE (the fact that check ran) and OVERFITTING
 *     (a two-proportion test of the pipeline's success rate across a deterministic split of the 85
 *     cases — whether the measured rate is a property of the protocol or of which half you look at).
 *   - the run's own persisted records — `state.ordering` (the order the server wrote the events in)
 *     for TEMPORAL_LEAKAGE, the stage counters for SELECTION_BIAS, and the target/pose records for
 *     the confounders CONFOUNDING must disclose.
 *
 * WHY `discoveryReplicationEngine.ts::detectDatasetOverlap` IS NOT REUSED for the contamination
 * check: it compares numeric `ModelPoint`s (x/y pairs of a fitted curve). A docking campaign's
 * datasets are sets of MOLECULES, and the honest identity of a molecule here is its RDKit canonical
 * SMILES — coercing those into x/y pairs to reach the existing function would be a fake reuse that
 * compares the wrong thing. The rule (zero shared members = clean, any shared member = contaminated)
 * is the same rule that function applies; only the equality it applies it over differs.
 *
 * Every record carries an `identity` (a sha256, a protocol fingerprint or a computed fnv1a) so a
 * PASS or FAIL in the panel points at something a reviewer can open. Where the evidence does not
 * apply to THIS run — a different docking target, no docked candidate — the record is `null` and the
 * probe stays UNRESOLVED with the blocker naming exactly what is missing.
 */

export const FALSIFICATION_EVIDENCE_CONTRACT_VERSION = '1.0.0';

/** One resolvable pointer: what the verdict was read from, and the identity that pins it. */
export interface EvidenceIdentity {
  /** Machine source — a repo path or module, never prose. */
  readonly source: string;
  /** Polish label for the panel. */
  readonly labelPl: string;
  /** sha256, protocol fingerprint, run id or computed fnv1a. */
  readonly identity: string;
}

export interface RedockRobustnessEvidence {
  readonly targetId: string;
  readonly configurations: number;
  readonly configurationsDocked: number;
  readonly scoreSpreadKcalMol: number | null;
  readonly bestAffinityKcalMol: number | null;
  readonly rmsdARange: readonly [number, number] | null;
  readonly medianRmsdA: number | null;
  readonly positiveControlBestAffinityKcalMol: number | null;
  readonly weakestNegativeControlBestAffinityKcalMol: number | null;
  readonly separationFromWeakestNegativeKcalMol: number | null;
  readonly thresholds: {
    readonly redockSuccessRmsdA: number;
    readonly maxScoreSpreadKcalMol: number;
    readonly minControlSeparationKcalMol: number;
  };
  readonly limitations: readonly string[];
  readonly engines: Readonly<Record<string, string | null>>;
  readonly identity: EvidenceIdentity;
}

export interface ContaminationEvidence {
  readonly benchmarkRun: string;
  readonly benchmarkCases: number;
  readonly campaignCandidates: number;
  readonly overlapCount: number;
  readonly overlappingSmiles: readonly string[];
  readonly identity: EvidenceIdentity;
}

/** A two-proportion z-test of the benchmark's success rate across a deterministic split of its cases. */
export interface GeneralizationEvidence {
  readonly benchmarkRun: string;
  readonly halfA: { readonly cases: number; readonly successes: number; readonly rate: number };
  readonly halfB: { readonly cases: number; readonly successes: number; readonly rate: number };
  readonly z: number | null;
  readonly criticalZ: number;
  readonly identity: EvidenceIdentity;
}

export interface SamplingEvidence {
  readonly generated: number;
  readonly dockingPlanned: number;
  readonly dockingDone: number;
  readonly identity: EvidenceIdentity;
}

export interface ConfounderEvidence {
  readonly confounders: readonly string[];
  readonly identity: EvidenceIdentity;
}

export interface FalsificationEvidence {
  readonly redock: RedockRobustnessEvidence | null;
  readonly contamination: ContaminationEvidence | null;
  readonly generalization: GeneralizationEvidence | null;
  readonly sampling: SamplingEvidence;
  readonly confounders: ConfounderEvidence;
  readonly ordering: EvidenceIdentity;
}

/** The shape of the recorded run, read defensively: a field the file does not carry stays null. */
interface RecordedRedock {
  readonly protocol?: { readonly target?: string; readonly thresholds?: Readonly<Record<string, unknown>>; readonly limitations?: readonly string[] };
  readonly protocolFingerprint?: string;
  readonly bodySha256?: string;
  readonly registered?: boolean;
  readonly summary?: Readonly<Record<string, unknown>>;
  readonly engines?: Readonly<Record<string, string | null>>;
}

const RECORDED = redockEvidence as unknown as RecordedRedock;

const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const pair = (v: unknown): readonly [number, number] | null =>
  Array.isArray(v) && v.length === 2 && numOf(v[0]) !== null && numOf(v[1]) !== null ? [Number(v[0]), Number(v[1])] : null;

/**
 * The recorded multi-seed redock + control run, but only for the target it was actually run against.
 * A run docking into any other receptor gets `null` — the evidence is not transferable.
 */
export function redockRobustness(targetId: string | null): RedockRobustnessEvidence | null {
  const protocolTarget = RECORDED.protocol?.target ?? null;
  if (!targetId || !protocolTarget || protocolTarget !== targetId) return null;
  if (RECORDED.registered === false) return null;
  const s = RECORDED.summary ?? {};
  const th = RECORDED.protocol?.thresholds ?? {};
  const redockSuccessRmsdA = numOf(th.redockSuccessRmsdA);
  const maxScoreSpreadKcalMol = numOf(th.maxScoreSpreadKcalMol);
  const minControlSeparationKcalMol = numOf(th.minControlSeparationKcalMol);
  const identity = RECORDED.bodySha256 ?? RECORDED.protocolFingerprint ?? null;
  if (redockSuccessRmsdA === null || maxScoreSpreadKcalMol === null || minControlSeparationKcalMol === null || !identity) return null;
  const range = pair(s.bestAffinityKcalMolRange);
  return {
    targetId: protocolTarget,
    configurations: numOf(s.configurations) ?? 0,
    configurationsDocked: numOf(s.configurationsDocked) ?? 0,
    scoreSpreadKcalMol: numOf(s.scoreSpreadKcalMol),
    bestAffinityKcalMol: range ? range[0] : null,
    rmsdARange: pair(s.rmsdARange),
    medianRmsdA: numOf(s.medianRmsdA),
    positiveControlBestAffinityKcalMol: numOf(s.positiveControlBestAffinityKcalMol),
    weakestNegativeControlBestAffinityKcalMol: numOf(s.weakestNegativeControlBestAffinityKcalMol),
    separationFromWeakestNegativeKcalMol: numOf(s.separationFromWeakestNegativeKcalMol),
    thresholds: { redockSuccessRmsdA, maxScoreSpreadKcalMol, minControlSeparationKcalMol },
    limitations: RECORDED.protocol?.limitations ?? [],
    engines: RECORDED.engines ?? {},
    identity: {
      source: 'docs/evidence/finalist-falsification-2026-09-27.json (scripts/finalist-falsification-evidence.py)',
      labelPl: 'Rzeczywisty przebieg: redock wielu ziaren + zestaw kontrolny (AutoDock Vina / Meeko / RDKit)',
      identity: `sha256:${identity}`,
    },
  };
}

/** The benchmark run under the current preregistered protocol — the last one published. */
export function currentBenchmarkRun(): BenchmarkRun | null {
  return ASTEX_RUNS.length > 0 ? ASTEX_RUNS[ASTEX_RUNS.length - 1]! : null;
}

/**
 * Does the independent validation set contain the very molecules the campaign is testing? Compared
 * on canonical SMILES, both sides produced by RDKit (`Chem.MolToSmiles`), so a match is a match of
 * molecules, not of strings someone typed.
 */
export function contaminationAgainstBenchmark(state: LiveDrugRunState): ContaminationEvidence | null {
  const run = currentBenchmarkRun();
  if (!run) return null;
  const benchmarkSmiles = new Map<string, string>();
  for (const c of run.cases) {
    const smiles = (c as { ligandSmiles?: unknown }).ligandSmiles;
    if (typeof smiles === 'string' && smiles.length > 0) benchmarkSmiles.set(smiles, c.pdbId);
  }
  if (benchmarkSmiles.size === 0) return null;
  const candidateSmiles = state.candidates.map((c) => c.smiles);
  const overlapping = [...new Set(candidateSmiles.filter((s) => benchmarkSmiles.has(s)))].sort();
  return {
    benchmarkRun: run.run,
    benchmarkCases: run.cases.length,
    campaignCandidates: candidateSmiles.length,
    overlapCount: overlapping.length,
    overlappingSmiles: overlapping.map((s) => `${benchmarkSmiles.get(s)}: ${s}`),
    identity: {
      source: 'core/reviewer/dockingBenchmark.ts (Astex Diverse Set) × the run\'s persisted candidates',
      labelPl: 'Przecięcie kanonicznych SMILES: zbiór walidacyjny Astex × kandydaci kampanii',
      identity: `fnv1a:${fnv1a(canonicalJson({ run: run.run, protocol: ASTEX_PREREG.protocolFingerprint, candidateSmiles: [...candidateSmiles].sort(), overlapping }))}`,
    },
  };
}

/**
 * Does the docking pipeline's measured success rate generalize, or is it a property of the half of
 * the benchmark the protocol was tuned on? The 85 cases are split deterministically by fnv1a of the
 * PDB id, and the two success rates are compared with a standard two-proportion z-test at α = 0.05.
 * This tests the PROTOCOL's homogeneity across cases it was not separately tuned on; it is not a
 * hold-out of a fitted model, because no model is fitted here — the panel says so.
 */
export function benchmarkGeneralization(): GeneralizationEvidence | null {
  const run = currentBenchmarkRun();
  if (!run || run.cases.length === 0) return null;
  const halves: [{ cases: number; successes: number }, { cases: number; successes: number }] = [
    { cases: 0, successes: 0 }, { cases: 0, successes: 0 },
  ];
  for (const c of run.cases) {
    const digest = fnv1a(c.pdbId);
    const bucket = parseInt(digest.slice(-1), 16) % 2;
    const half = halves[bucket]!;
    half.cases += 1;
    if (c.success) half.successes += 1;
  }
  const [a, b] = halves;
  const rate = (h: { cases: number; successes: number }) => (h.cases > 0 ? h.successes / h.cases : 0);
  const pooled = (a.successes + b.successes) / Math.max(a.cases + b.cases, 1);
  const se = a.cases > 0 && b.cases > 0 ? Math.sqrt(pooled * (1 - pooled) * (1 / a.cases + 1 / b.cases)) : 0;
  const z = se > 0 ? (rate(a) - rate(b)) / se : null;
  return {
    benchmarkRun: run.run,
    halfA: { ...a, rate: Number(rate(a).toFixed(4)) },
    halfB: { ...b, rate: Number(rate(b).toFixed(4)) },
    z: z === null ? null : Number(z.toFixed(3)),
    criticalZ: 1.96,
    identity: {
      source: `core/reviewer/dockingBenchmark.ts ${run.run} (protokół ${run.protocolFingerprint.slice(0, 12)}…)`,
      labelPl: 'Test dwóch proporcji na deterministycznym podziale 85 kompleksów Astex',
      identity: `fnv1a:${fnv1a(canonicalJson({ run: run.run, protocolFingerprint: run.protocolFingerprint, a, b }))}`,
    },
  };
}

/** How much of what the run generated was actually measured — the run's own counters, nothing else. */
export function samplingEvidence(state: LiveDrugRunState): SamplingEvidence {
  const generated = state.candidates.length;
  const docking = state.progress.docking;
  return {
    generated,
    dockingPlanned: docking.planned,
    dockingDone: docking.done,
    identity: {
      source: 'liveExperiment/drugRunState.ts — the run\'s persisted candidates and stage counters',
      labelPl: 'Liczniki przebiegu: wygenerowani kandydaci vs zadokowani',
      identity: `fnv1a:${fnv1a(canonicalJson({ generated, docking, stateHash: state.stateHash }))}`,
    },
  };
}

/**
 * The confounders this run genuinely has NOT controlled for, each derived from a persisted record —
 * not a list of caveats someone remembered to write down. An empty list would mean the run really
 * controlled all of them; on a rigid-receptor Vina docking it never is.
 */
export function confounderEvidence(state: LiveDrugRunState): ConfounderEvidence {
  const confounders: string[] = [];
  const target = state.target;
  if (target && target.receptorPdbqtSha256) {
    confounders.push(`sztywny receptor w jednej konformacji krystalicznej (${target.pdbId}, łańcuch ${target.chain}; jeden receptorPdbqtSha256 ${target.receptorPdbqtSha256.slice(0, 12)}…, brak zapisanego zbioru konformacji)`);
  }
  const engines = [...new Set(state.candidates.map((c) => c.pose?.engine).filter((e): e is string => Boolean(e)))];
  if (engines.length > 0) {
    confounders.push(`empiryczna funkcja oceniająca ${engines.join(', ')}: brak jawnego rozpuszczalnika, brak członu entropowego, brak swobodnej energii wiązania`);
  }
  const hasMd = state.candidates.some((c) => Object.values(c.stages).some((m) => /md|dynamic|openmm/i.test(m?.reason ?? '')));
  if (!hasMd) confounders.push('brak przebiegu dynamiki molekularnej w tym przebiegu (żaden rekord STAGE_RESULT nie wskazuje silnika MD)');
  return {
    confounders,
    identity: {
      source: 'liveExperiment/drugRunState.ts — RECEPTOR_PREPARED, Science Run pose engine, stage records',
      labelPl: 'Czynniki zakłócające wyprowadzone z rekordów przebiegu',
      identity: `fnv1a:${fnv1a(canonicalJson({ confounders, stateHash: state.stateHash }))}`,
    },
  };
}

export function orderingIdentity(state: LiveDrugRunState): EvidenceIdentity {
  return {
    source: 'liveExperiment/drugRunState.ts::orderingOf — the append-only campaign event log',
    labelPl: 'Kolejność zapisu zdarzeń (seq) w dziennik tylko-dopisywalny serwera',
    identity: `fnv1a:${fnv1a(canonicalJson(state.ordering))}`,
  };
}

/** Everything the battery can be fed for this run, assembled once. Pure over the state. */
export function falsificationEvidence(state: LiveDrugRunState): FalsificationEvidence {
  return {
    redock: redockRobustness(state.target?.targetId ?? null),
    contamination: contaminationAgainstBenchmark(state),
    generalization: benchmarkGeneralization(),
    sampling: samplingEvidence(state),
    confounders: confounderEvidence(state),
    ordering: orderingIdentity(state),
  };
}
