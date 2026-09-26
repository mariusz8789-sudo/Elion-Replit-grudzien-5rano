import { describe, expect, it } from 'vitest';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import { BENCH_ZONES, benchLayoutOf, zoneOf } from '../core/liveExperiment/drugBenchLayout';
import type { CampaignCandidate } from '../core/backend/client';

/**
 * THE FUNNEL AS THE BENCH SHOWS IT. The laboratory must not reduce "100 → 20 → 2" to three numbers:
 * every candidate the backend wrote stands somewhere, and it stands there because of what was
 * persisted about it — never because of an animation timer.
 */

const cand = (id: string, generation: number, smiles: string, status = 'retained', rejectedReason: string | null = null): CampaignCandidate => ({
  id, generation, parentSmiles: null, transformation: 'add-methyl', canonicalSmiles: smiles, valid: true,
  descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: false, status, rejectedReason, runIds: [],
});
let seq = 0;
const ev = (type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation: 1, type, payload, createdAt: 1000 + seq });

const candidates = [
  cand('queued', 1, 'c1ccccc1'),
  cand('analysed', 1, 'Cc1ccccc1'),
  cand('docking', 1, 'CCc1ccccc1'),
  cand('finalistA', 1, 'CCCc1ccccc1'),
  cand('finalistB', 1, 'CCCCc1ccccc1'),
  cand('dropped', 1, 'Oc1ccccc1', 'rejected', 'constraint:lipinski_hbd'),
];
const events = [
  ev('STAGE_RESULT', { stage: 'admet', candidateId: 'analysed', reason: 'ADMET_COMPUTED', keyEndpoints: { AMES: 0.2 } }),
  ev('STAGE_SELECTION', { stage: 'docking', candidateId: 'docking', reason: 'SELECTED_FOR_DOCKING' }),
  ev('STAGE_PROGRESS', { stage: 'docking', candidateId: 'docking', step: 'LIGAND_PREPARED' }),
  ev('STAGE_RESULT', { stage: 'docking', candidateId: 'finalistA', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -9.8, runId: 'rA' }),
  ev('STAGE_RESULT', { stage: 'docking', candidateId: 'finalistB', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -12.4, runId: 'rB' }),
];
const state = projectDrugRun({ events, candidates, maxGenerations: 1, jobRunning: false });

describe('benchLayoutOf — every candidate stands where the record puts it', () => {
  it('places each candidate in the zone its persisted record implies', () => {
    const layout = benchLayoutOf(state);
    expect(layout.samples).toHaveLength(6);
    const zone = (id: string) => layout.samples.find((s) => s.id === id)!.zone;
    expect(zone('queued')).toBe('QUEUE');
    expect(zone('analysed')).toBe('ADMET');
    expect(zone('docking')).toBe('DOCKING');
    expect(zone('finalistA')).toBe('FINALIST');
    expect(zone('finalistB')).toBe('FINALIST');
    expect(zone('dropped')).toBe('DISCARD');
    expect(layout.counts).toEqual({ QUEUE: 1, ADMET: 1, DOCKING: 1, FINALIST: 2, DISCARD: 1 });
    expect(BENCH_ZONES.every((z) => z in layout.counts)).toBe(true);
  });

  it('a dropped candidate carries the recorded reason to the discard tray', () => {
    const dropped = benchLayoutOf(state).samples.find((s) => s.id === 'dropped')!;
    expect(dropped.rejectedReason).toBe('constraint:lipinski_hbd');
    expect(dropped.rank).toBeNull();
    expect(dropped.dockingScore).toBeNull();
  });

  it('finalists are ranked by the MEASURED score, best first, and only they carry a rank', () => {
    const layout = benchLayoutOf(state);
    expect(layout.finalists.map((f) => [f.id, f.rank, f.dockingScore])).toEqual([
      ['finalistB', 1, -12.4],
      ['finalistA', 2, -9.8],
    ]);
    expect(layout.samples.filter((s) => s.rank !== null)).toHaveLength(2);
  });

  it('slots are contiguous per zone, so nothing overlaps on the bench', () => {
    const layout = benchLayoutOf(state);
    for (const z of BENCH_ZONES) {
      const slots = layout.samples.filter((s) => s.zone === z).map((s) => s.slot).sort((a, b) => a - b);
      expect(slots).toEqual(slots.map((_, i) => i));
    }
  });

  it('exactly one sample is the active one — the same candidate the holograms show', () => {
    const layout = benchLayoutOf(state);
    expect(layout.samples.filter((s) => s.active)).toHaveLength(1);
    // focusCandidate takes the first candidate WITH a docking score in the projection's own order
    // (generation, then canonical SMILES by code unit) — here finalistB sorts before finalistA.
    expect(layout.samples.find((s) => s.active)!.id).toBe('finalistB');
  });

  it('is pure: the same state gives the same layout, and no state gives an empty bench', () => {
    expect(benchLayoutOf(state)).toEqual(benchLayoutOf(projectDrugRun({ events, candidates, maxGenerations: 1, jobRunning: false })));
    const empty = benchLayoutOf(null);
    expect(empty.samples).toEqual([]);
    expect(empty.finalists).toEqual([]);
    expect(empty.counts).toEqual({ QUEUE: 0, ADMET: 0, DOCKING: 0, FINALIST: 0, DISCARD: 0 });
  });

  it('a rejected candidate goes to the discard tray even if it had been measured', () => {
    expect(zoneOf({ ...state.candidates[0]!, status: 'rejected', stages: { docking: { status: 'COMPUTED', value: -11, unit: 'kcal/mol', runId: 'r', reason: 'x' } } })).toBe('DISCARD');
  });
});
