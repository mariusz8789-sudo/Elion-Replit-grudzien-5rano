import { describe, expect, it } from 'vitest';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import type { CampaignCandidate } from '../core/backend/client';

const cand = (id: string, generation: number, smiles: string, parent: string | null, transformation: string | null, status = 'retained'): CampaignCandidate => ({
  id, generation, parentSmiles: parent, transformation, canonicalSmiles: smiles, valid: true,
  descriptors: { mw: 78.1 }, objectiveVector: {}, constraintViolations: [], pareto: generation === 1, status, rejectedReason: status === 'rejected' ? 'constraint:mw' : null, runIds: [],
});
let seq = 0;
const ev = (type: string, generation: number, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation, type, payload, createdAt: 1000 + seq });

const candidates = [cand('c0', 0, 'c1ccccc1', null, null), cand('c1', 1, 'Cc1ccccc1', 'c1ccccc1', 'add-methyl'), cand('c2', 1, 'Oc1ccccc1', 'c1ccccc1', 'add-hydroxyl', 'rejected')];
const events = [
  ev('OBJECTIVE_RECEIVED', 0, {}),
  ev('GENERATION_COMPLETED', 1, {}),
  ev('STOPPING_CONDITION_REACHED', 1, { stopReason: 'BUDGET_EXHAUSTED' }),
  ev('STAGE_RESULT', 1, { stage: 'admet', candidateId: 'c1', reason: 'ADMET_COMPUTED', admetRunId: 'r-admet' }),
  ev('STAGE_SELECTION', 1, { stage: 'docking', candidateId: 'c1', reason: 'SELECTED_FOR_DOCKING' }),
  ev('STAGE_RESULT', 1, { stage: 'docking', candidateId: 'c1', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -5.4, runId: 'r-dock' }),
  ev('STAGE_BLOCKED', 1, { stage: 'quantum', blocker: 'BLOCKED_BY_RUNTIME' }),
];

describe('projectDrugRun — one read model of the live drug run', () => {
  it('copies persisted facts and computes nothing scientific', () => {
    const s = projectDrugRun({ events, candidates, maxGenerations: 2, jobRunning: false });
    expect(s.stage).toBe('COMPLETED');
    expect(s.generationsCompleted).toBe(1);
    expect(s.lastSeq).toBe(events.at(-1)!.seq);
    const c1 = s.candidates.find((c) => c.id === 'c1')!;
    expect(c1.stages.docking).toEqual({ status: 'COMPUTED', value: -5.4, unit: 'kcal/mol', runId: 'r-dock', reason: 'DOCKING_RESULT_RETAINED' });
    expect(c1.stages.admet?.runId).toBe('r-admet');
    expect(s.blocked).toEqual([{ stage: 'quantum', blocker: 'BLOCKED_BY_RUNTIME' }]);
    expect(s.lineage).toEqual([
      { parent: 'c1ccccc1', transformation: 'add-methyl', product: 'Cc1ccccc1', status: 'retained' },
      { parent: 'c1ccccc1', transformation: 'add-hydroxyl', product: 'Oc1ccccc1', status: 'rejected' },
    ]);
    expect(s.progress.docking).toEqual({ done: 1, planned: 1 });
  });

  it('mid-run: the stage follows the latest persisted activity, and a new event changes the state hash', () => {
    const partial = projectDrugRun({ events: events.slice(0, 5), candidates, maxGenerations: 2, jobRunning: true });
    expect(partial.stage).toBe('DOCKING');
    expect(partial.progress.docking).toEqual({ done: 0, planned: 1 });
    const later = projectDrugRun({ events: events.slice(0, 6), candidates, maxGenerations: 2, jobRunning: true });
    expect(later.stateHash).not.toBe(partial.stateHash);
  });

  it('is deterministic and order-independent in its inputs', () => {
    const a = projectDrugRun({ events, candidates, maxGenerations: 2, jobRunning: false });
    const b = projectDrugRun({ events: [...events].reverse(), candidates: [...candidates].reverse(), maxGenerations: 2, jobRunning: false });
    expect(b.stateHash).toBe(a.stateHash);
  });
});

describe('projectDrugRun — the real protein docking steps and pose', () => {
  const dockEvents: CampaignEventRecord[] = [
    ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'RECEPTOR_PREPARED', targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'ABL1', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' }),
    ev('STAGE_SELECTION', 1, { stage: 'docking', candidateId: 'c1', reason: 'SELECTED_FOR_DOCKING' }),
    ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'LIGAND_PREPARED', candidateId: 'c1', ligandPdbqtSha256: 'd'.repeat(64), atoms: 68 }),
    ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'VINA_STARTED', candidateId: 'c1', targetId: 'ABL1_1IEP', exhaustiveness: 8, seed: 42 }),
    ev('STAGE_RESULT', 1, { stage: 'docking', candidateId: 'c1', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -11.4, runId: 'r-dock', targetId: 'ABL1_1IEP', poseSha256: 'e'.repeat(64) }),
  ];
  const dockingRuns = [{
    id: 'r-dock',
    outputs: { poseSha256: 'e'.repeat(64), pose: { atoms: [['C', 1, 2, 3], ['N', 2, 3, 4]], bonds: [[0, 1, 1.5]] }, pocket: { residues: ['TYR253:A'], atoms: [['C', 0, 0, 0, 0]] } },
    provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' },
  }];

  it('carries the prepared target, the latest docking step and the pose from the Science Run', () => {
    const s = projectDrugRun({ events: dockEvents, candidates, maxGenerations: 1, jobRunning: false, dockingRuns });
    expect(s.target).toEqual({ targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'ABL1', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' });
    const c1 = s.candidates.find((c) => c.id === 'c1')!;
    expect(c1.dockingStep).toBe('POSE_SCORED');
    expect(c1.pose).toEqual({ runId: 'r-dock', poseSha256: 'e'.repeat(64), atoms: [['C', 1, 2, 3], ['N', 2, 3, 4]], bonds: [[0, 1, 1.5]], pocketResidues: ['TYR253:A'], pocketAtoms: [['C', 0, 0, 0, 0]], engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' });
  });

  it('the step only moves forward, and without the Science Run there is no pose to show', () => {
    const midRun = projectDrugRun({ events: dockEvents.slice(0, 4), candidates, maxGenerations: 1, jobRunning: true, dockingRuns: [] });
    const c1 = midRun.candidates.find((c) => c.id === 'c1')!;
    expect(c1.dockingStep).toBe('VINA_STARTED');
    expect(c1.pose).toBeNull();
    const noRun = projectDrugRun({ events: dockEvents, candidates, maxGenerations: 1, jobRunning: false, dockingRuns: [] });
    expect(noRun.candidates.find((c) => c.id === 'c1')!.pose).toBeNull();
    expect(noRun.stateHash).not.toBe(projectDrugRun({ events: dockEvents, candidates, maxGenerations: 1, jobRunning: false, dockingRuns }).stateHash);
  });
});
