import type { LiveCandidate, LiveDrugRunState } from './drugRunState';

/**
 * WHERE EVERY CANDIDATE STANDS ON THE BENCH — a pure function of the canonical run state.
 *
 * The laboratory must show the funnel happening, not only report its numbers: a sample enters the
 * queue when the generator writes it, moves to the analyser when ADMET measures it, to the docking
 * station when it is selected for docking, onto the finalists stand when a pose and a score exist, and
 * into the discard tray when the pipeline rejected it — carrying the recorded reason.
 *
 * Every zone below is decided ONLY by what the backend persisted for that candidate (status,
 * rejectedReason, stage measurements, docking step, pose). Nothing here animates a step that did not
 * happen, and no candidate is placed that the backend has not written.
 */

/** The candidate the bench looks at: docked first, then the best retained of the latest generation, then the seed. */
export function focusCandidate(state: LiveDrugRunState): LiveCandidate | null {
  const docked = state.candidates.find((c) => c.stages.docking && c.stages.docking.value !== null);
  if (docked) return docked;
  const retained = state.candidates.filter((c) => c.status === 'retained');
  if (retained.length) return retained.reduce((a, b) => (b.generation > a.generation || (b.generation === a.generation && b.pareto && !a.pareto) ? b : a));
  return state.candidates[0] ?? null;
}

export type BenchZone = 'QUEUE' | 'ADMET' | 'DOCKING' | 'FINALIST' | 'DISCARD';

export const BENCH_ZONES: readonly BenchZone[] = ['QUEUE', 'ADMET', 'DOCKING', 'FINALIST', 'DISCARD'];

export interface BenchSample {
  readonly id: string;
  readonly smiles: string;
  readonly generation: number;
  readonly zone: BenchZone;
  /** Position within the zone, 0-based, stable while the state does not change. */
  readonly slot: number;
  /** The Vina score in kcal/mol when one was measured for this candidate, else null. */
  readonly dockingScore: number | null;
  /** Rank among the finalists, 1 = best measured score. Null outside the finalists stand. */
  readonly rank: number | null;
  readonly rejectedReason: string | null;
  /** The candidate the bench is currently looking at (the same one the holograms show). */
  readonly active: boolean;
}

export interface BenchLayout {
  readonly samples: readonly BenchSample[];
  /** Finalists ordered best score first — what the scientist compares at the end. */
  readonly finalists: readonly BenchSample[];
  readonly counts: Readonly<Record<BenchZone, number>>;
}

/** Which station a candidate is standing at, from its persisted record alone. */
export function zoneOf(c: LiveCandidate): BenchZone {
  if (c.status === 'rejected') return 'DISCARD';
  const docking = c.stages.docking;
  if (docking && docking.value !== null) return 'FINALIST';
  if (c.dockingStep !== null || docking) return 'DOCKING';
  if (c.stages.admet) return 'ADMET';
  return 'QUEUE';
}

export function benchLayoutOf(state: LiveDrugRunState | null): BenchLayout {
  const empty = Object.fromEntries(BENCH_ZONES.map((z) => [z, 0])) as Record<BenchZone, number>;
  if (!state) return { samples: [], finalists: [], counts: empty };
  const focus = focusCandidate(state);
  // Finalists are ranked by the MEASURED score (more negative binds better in Vina's estimate); a tie
  // keeps the order the backend wrote the candidates in, so the ranking is deterministic.
  const scored = state.candidates
    .filter((c) => c.status !== 'rejected' && c.stages.docking?.value != null)
    .map((c, index) => ({ c, index }))
    .sort((a, b) => (a.c.stages.docking!.value! - b.c.stages.docking!.value!) || (a.index - b.index));
  const rankById = new Map(scored.map(({ c }, i) => [c.id, i + 1]));
  const counts = { ...empty };
  const samples = state.candidates.map((c): BenchSample => {
    const zone = zoneOf(c);
    const slot = counts[zone];
    counts[zone] += 1;
    return {
      id: c.id, smiles: c.smiles, generation: c.generation, zone, slot,
      dockingScore: c.stages.docking?.value ?? null,
      rank: zone === 'FINALIST' ? rankById.get(c.id) ?? null : null,
      rejectedReason: c.rejectedReason,
      active: focus !== null && c.id === focus.id,
    };
  });
  const finalists = samples.filter((s) => s.rank !== null).sort((a, b) => a.rank! - b.rank!);
  return { samples, finalists, counts };
}
