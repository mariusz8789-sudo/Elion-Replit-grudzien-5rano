import { describe, expect, it } from 'vitest';
import { orderingOf, projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import { ASTEX_RUNS } from '../core/reviewer/dockingBenchmark';
import {
  benchmarkGeneralization, confounderEvidence, contaminationAgainstBenchmark, currentBenchmarkRun,
  falsificationEvidence, redockRobustness, samplingEvidence,
} from '../core/liveExperiment/falsificationEvidence';
import type { CampaignCandidate } from '../core/backend/client';

/**
 * D-150 — THE EVIDENCE THE BATTERY IS FED. Every record here has to come from something that already
 * exists on disk (the recorded multi-seed redock + control run, the Astex benchmark, the run's own
 * append-only log), carry an identity a reviewer can resolve, and be `null` rather than borrowed when
 * it does not apply to the run in front of it.
 */
const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';

const cand = (id: string, generation: number, smiles: string): CampaignCandidate => ({
  id, generation, parentSmiles: null, transformation: null, canonicalSmiles: smiles, valid: true,
  descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: false, status: 'retained', rejectedReason: null, runIds: [],
});

let seq = 0;
const ev = (type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation: 1, type, payload, createdAt: seq });

const target = { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'ABL1', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' };
const events: CampaignEventRecord[] = [
  ev('GENERATION_COMPLETED', {}),
  ev('STAGE_PROGRESS', { stage: 'docking', step: 'RECEPTOR_PREPARED', ...target }),
  ev('STAGE_SELECTION', { stage: 'docking', candidateId: 'c1', reason: 'SELECTED_FOR_DOCKING' }),
  ev('STAGE_RESULT', { stage: 'docking', candidateId: 'c1', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -12.83, runId: 'r-dock', targetId: 'ABL1_1IEP' }),
];
const dockingRuns = [{ id: 'r-dock', outputs: { poseSha256: 'e'.repeat(64), pose: { atoms: [['C', 1, 2, 3]], bonds: [[0, 1, 1.5]] }, pocket: { residues: ['THR315:A'], atoms: [['C', 0, 0, 0, 0]] } }, provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' } }];
const state = projectDrugRun({ events, candidates: [cand('c0', 0, IMATINIB), cand('c1', 1, `C${IMATINIB}`), cand('c2', 1, `O${IMATINIB}`)], maxGenerations: 1, jobRunning: false, dockingRuns });

describe('the recorded multi-seed redock + control run', () => {
  it('is a real run of dock_worker.py over this target, pinned by the sha256 of its own body', () => {
    const r = redockRobustness('ABL1_1IEP');
    expect(r).not.toBeNull();
    expect(r!.targetId).toBe('ABL1_1IEP');
    // Five (seed, exhaustiveness) settings, all of which produced a pose.
    expect(r!.configurations).toBe(5);
    expect(r!.configurationsDocked).toBe(5);
    // The engines that produced it, on record.
    expect(r!.engines.vina).toBe('1.2.7');
    expect(r!.engines.meeko).toBe('0.8.0');
    // Thresholds come from the frozen protocol, not from this module.
    expect(r!.thresholds.redockSuccessRmsdA).toBe(2);
    expect(r!.thresholds.maxScoreSpreadKcalMol).toBe(1);
    expect(r!.thresholds.minControlSeparationKcalMol).toBe(1);
    expect(r!.identity.identity).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(r!.identity.source).toContain('scripts/finalist-falsification-evidence.py');
    // Real measured numbers, and the limitations the protocol disclosed before the run.
    expect(r!.scoreSpreadKcalMol).toBeGreaterThan(0);
    expect(r!.medianRmsdA).toBeGreaterThan(0);
    expect(r!.rmsdARange![0]).toBeLessThanOrEqual(r!.rmsdARange![1]);
    expect(r!.separationFromWeakestNegativeKcalMol).not.toBeNull();
    expect(r!.limitations.join(' ')).toMatch(/MODEL_ESTIMATE/);
    expect(r!.limitations.join(' ')).toMatch(/not property-matched decoys/);
  });

  it('is NOT transferable to another receptor or to a run with no target', () => {
    expect(redockRobustness('OPRM1_5C1M')).toBeNull();
    expect(redockRobustness(null)).toBeNull();
  });
});

describe('the Astex benchmark as the independent comparison set', () => {
  it('uses the run published under the current preregistered protocol', () => {
    const run = currentBenchmarkRun();
    expect(run).not.toBeNull();
    expect(run).toBe(ASTEX_RUNS[ASTEX_RUNS.length - 1]);
    expect(run!.cases.length).toBe(85);
  });

  it('finds the campaign\'s own seed molecule inside the validation set — reported, not hidden', () => {
    const c = contaminationAgainstBenchmark(state);
    expect(c).not.toBeNull();
    expect(c!.benchmarkCases).toBe(85);
    expect(c!.campaignCandidates).toBe(3);
    // The hero run starts from imatinib, and imatinib is Astex case 1T46.
    expect(c!.overlapCount).toBe(1);
    expect(c!.overlappingSmiles[0]).toContain('1T46');
    expect(c!.identity.identity).toMatch(/^fnv1a:[0-9a-f]+$/);
  });

  it('reports zero overlap for a campaign whose molecules are not in the set', () => {
    const clean = projectDrugRun({ events, candidates: [cand('c1', 1, 'CCO'), cand('c2', 1, 'CCCO')], maxGenerations: 1, jobRunning: false, dockingRuns });
    expect(contaminationAgainstBenchmark(clean)!.overlapCount).toBe(0);
  });

  it('splits the 85 complexes deterministically and compares the two success rates with a two-proportion z-test', () => {
    const g = benchmarkGeneralization()!;
    expect(g.halfA.cases + g.halfB.cases).toBe(85);
    expect(g.halfA.cases).toBeGreaterThan(20);
    expect(g.halfB.cases).toBeGreaterThan(20);
    expect(g.halfA.successes + g.halfB.successes).toBe(currentBenchmarkRun()!.summary.successes);
    expect(g.criticalZ).toBe(1.96);
    expect(g.z).not.toBeNull();
    // Deterministic: the split is a function of the PDB ids, so it does not move between calls.
    expect(benchmarkGeneralization()).toEqual(g);
  });
});

describe('the run\'s own records', () => {
  it('counts how much of what was generated was actually measured', () => {
    const s = samplingEvidence(state);
    expect(s.generated).toBe(3);
    expect(s.dockingDone).toBe(1);
    expect(s.identity.identity).toMatch(/^fnv1a:/);
  });

  it('derives the uncontrolled confounders from the persisted receptor and pose records, not from prose', () => {
    const c = confounderEvidence(state);
    expect(c.confounders.length).toBeGreaterThanOrEqual(3);
    expect(c.confounders.join(' ')).toContain('sztywny receptor');
    expect(c.confounders.join(' ')).toContain('1IEP');
    expect(c.confounders.join(' ')).toContain('AutoDock Vina');
    expect(c.confounders.join(' ')).toContain('dynamiki molekularnej');
    // A run with no receptor on record has fewer derivable confounders, never invented ones.
    const bare = projectDrugRun({ events: [ev('GENERATION_COMPLETED', {})], candidates: [], maxGenerations: 1, jobRunning: false });
    expect(confounderEvidence(bare).confounders.length).toBeLessThan(c.confounders.length);
  });

  it('reads the order the server wrote the events in, and names a breach rather than smoothing it', () => {
    expect(state.ordering.violations).toEqual([]);
    expect(state.ordering.receptorPreparedSeq).toBeGreaterThan(0);
    expect(state.ordering.firstDockingResultSeq).toBeGreaterThan(state.ordering.receptorPreparedSeq);
    // A docking result with no receptor preparation on record is a breach, and it is named.
    const broken = orderingOf([
      { seq: 1, id: 'a', generation: 1, type: 'GENERATION_COMPLETED', payload: {}, createdAt: 1 },
      { seq: 2, id: 'b', generation: 1, type: 'STAGE_RESULT', payload: { stage: 'docking', bestAffinityKcalMol: -1 }, createdAt: 2 },
    ]);
    expect(broken.violations).toHaveLength(1);
    expect(broken.violations[0]).toContain('no RECEPTOR_PREPARED');
    // A result written before the receptor was prepared is a breach too.
    const inverted = orderingOf([
      { seq: 1, id: 'a', generation: 1, type: 'STAGE_RESULT', payload: { stage: 'docking', bestAffinityKcalMol: -1 }, createdAt: 1 },
      { seq: 2, id: 'b', generation: 1, type: 'STAGE_PROGRESS', payload: { stage: 'docking', step: 'RECEPTOR_PREPARED' }, createdAt: 2 },
    ]);
    expect(inverted.violations.join(' ')).toContain('precedes RECEPTOR_PREPARED');
  });
});

describe('the whole bundle', () => {
  it('assembles every record for a run on this target and is pure over the state', () => {
    const a = falsificationEvidence(state);
    expect(falsificationEvidence(state)).toEqual(a);
    expect(a.redock).not.toBeNull();
    expect(a.contamination).not.toBeNull();
    expect(a.generalization).not.toBeNull();
    expect(a.ordering.identity).toMatch(/^fnv1a:/);
    for (const id of [a.sampling.identity, a.confounders.identity, a.ordering, a.contamination!.identity, a.generalization!.identity, a.redock!.identity]) {
      expect(id.source.length).toBeGreaterThan(5);
      expect(id.labelPl.length).toBeGreaterThan(5);
      expect(id.identity.length).toBeGreaterThan(5);
    }
  });
});
