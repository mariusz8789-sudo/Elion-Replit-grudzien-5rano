import type { BenchLayout, BenchSample, BenchZone } from './drugBenchLayout';
import type { EpistemicLabel, LabProcedure, ProcedurePhase, ProcedurePhaseId } from './labProcedure';

/**
 * BENCH HANDLING — what the scientist's hands are doing, read from the SAME canonical state.
 *
 * The bench is not a status board: a viewer must see a sample picked up, carried to the right
 * instrument and put into it. This module says WHICH sample, FROM where, INTO what and WHICH part of
 * that movement — and nothing else. It holds no experiment state, starts nothing, measures nothing:
 *   • WHICH TASK exists comes from `LabProcedure` (itself a projection of what the backend persisted);
 *   • WHICH SAMPLE comes from `BenchLayout` (the same vials the rack already stands);
 *   • HOW FAR the movement has got comes from `motion`, a presentation-only 0..1 the renderer advances
 *     on the wall clock and CLAMPS at 1. That is the allowed local presentation state (hand motion,
 *     interpolation) — it can never finish a phase, skip one, or invent a measurement. When `motion`
 *     reaches 1 the hands simply stay at the instrument, working, until the backend says otherwise.
 *
 * TRUTHFULNESS. The handling itself is a SIMULATED LAB STEP: no vial was physically moved, no
 * analyser drawer physically opened — the movement REPRESENTS a computation that really ran. So every
 * task carries two labels: `evidence` = 'SIMULATED' (the gesture) and `represents` = the epistemic
 * label of the phase it stands for (what the number behind it actually is). A viewer is never told
 * that a computed score was measured by an instrument, and the sample always carries its molecular
 * identity, never an anonymous "sample 3".
 */

/** The sub-step of one transfer. Purely the shape of the movement — never a claim about results. */
export type HandAction =
  | 'IDLE'      // hands resting: nothing to do yet, or the pipeline is blocked
  | 'REACH'     // reaching for the sample in the rack
  | 'GRIP'      // closing the fingers on the vial
  | 'CARRY'     // carrying it to the instrument
  | 'PLACE'     // putting it into the instrument's port
  | 'OPERATE'   // standing at the instrument while it works
  | 'OBSERVE'   // looking at what the instrument produced
  | 'RECORD';   // writing the result down at the monitor

/** The instruments of this bench. `RACK` is where the samples stand, not an instrument. */
export type BenchInstrument = 'RACK' | 'ANALYSER' | 'WORKSTATION' | 'POSE_VIEWER' | 'MONITOR';

export interface BenchHandling {
  readonly action: HandAction;
  /** The vial in the hands (the same id the rack uses), or null when the hands are empty. */
  readonly sampleId: string | null;
  /** The sample's identity — its canonical SMILES. A sample without identity is never handled. */
  readonly sampleLabel: string | null;
  readonly fromZone: BenchZone | null;
  /** Where the hands are working right now. */
  readonly instrument: BenchInstrument;
  /** The phase this handling stands for, so the timeline and the hands can never disagree. */
  readonly phaseId: ProcedurePhaseId | null;
  /** The gesture's own honesty label: the handling is always a simulated laboratory step. */
  readonly evidence: 'SIMULATED';
  /** What the phase behind the gesture really is (REAL_ENGINE_OUTPUT, MODEL_ESTIMATE, …). */
  readonly represents: EpistemicLabel;
  /** Plain language, what a visitor would say they can see. */
  readonly note: string;
  /** True while the hands hold the vial (so the renderer parents it to the hand, not to the rack). */
  readonly carrying: boolean;
}

const IDLE_BASE = {
  action: 'IDLE', sampleId: null, sampleLabel: null, fromZone: null, instrument: 'RACK',
  phaseId: null, evidence: 'SIMULATED', represents: 'SIMULATED', carrying: false,
} as const;

function idle(note: string, phaseId: ProcedurePhaseId | null = null, represents: EpistemicLabel = 'SIMULATED'): BenchHandling {
  return { ...IDLE_BASE, note, phaseId, represents };
}

/** Sub-step boundaries of one transfer, in fractions of the movement. Shape only. */
const REACH_UNTIL = 0.22;
const GRIP_UNTIL = 0.38;
const CARRY_UNTIL = 0.74;
const PLACE_UNTIL = 0.9;

function transferAction(motion: number): HandAction {
  const m = Math.min(1, Math.max(0, motion));
  if (m < REACH_UNTIL) return 'REACH';
  if (m < GRIP_UNTIL) return 'GRIP';
  if (m < CARRY_UNTIL) return 'CARRY';
  if (m < PLACE_UNTIL) return 'PLACE';
  return 'OPERATE';
}

/** The vial is in the hands between closing the fingers and letting go at the port. */
function carryingAt(action: HandAction): boolean {
  return action === 'GRIP' || action === 'CARRY' || action === 'PLACE';
}

/**
 * Which sample this task is about. The zone IS the stage, so the sample being handled at an instrument
 * is one the record already places at that stage — the bench's focused candidate when it is the one
 * standing there, otherwise the first vial in that row. Only if the stage row is empty does it fall
 * back to the focused candidate, so the hands never handle a molecule the record does not place here.
 */
function sampleFor(layout: BenchLayout, stageZone: BenchZone): BenchSample | null {
  const inZone = layout.samples.filter((s) => s.zone === stageZone);
  const focused = inZone.find((s) => s.active);
  if (focused) return focused;
  if (inZone.length) return inZone[0]!;
  return layout.samples.find((s) => s.active) ?? layout.samples[0] ?? null;
}

const INSTRUMENT_NAME_PL: Readonly<Record<BenchInstrument, string>> = {
  RACK: 'statywu z próbkami', ANALYSER: 'analizatora ADMET', WORKSTATION: 'stanowiska dokowania',
  POSE_VIEWER: 'podglądu pozy w kieszeni', MONITOR: 'monitora wyników',
};

function transferNote(action: HandAction, instrument: BenchInstrument, sample: BenchSample): string {
  const id = sample.smiles;
  switch (action) {
    case 'REACH': return `sięga po próbkę ${id} w statywie`;
    case 'GRIP': return `chwyta fiolkę z próbką ${id}`;
    case 'CARRY': return `przenosi fiolkę ${id} do ${INSTRUMENT_NAME_PL[instrument]}`;
    case 'PLACE': return `wkłada fiolkę ${id} do ${INSTRUMENT_NAME_PL[instrument]}`;
    default: return `stoi przy ${INSTRUMENT_NAME_PL[instrument]}, aparatura pracuje na próbce ${id}`;
  }
}

function transfer(
  phase: ProcedurePhase, layout: BenchLayout, instrument: BenchInstrument, fromZone: BenchZone, motion: number,
): BenchHandling | null {
  const sample = sampleFor(layout, fromZone);
  if (!sample) return null;
  const action = transferAction(motion);
  return {
    action, sampleId: sample.id, sampleLabel: sample.smiles, fromZone: sample.zone, instrument,
    phaseId: phase.id, evidence: 'SIMULATED', represents: phase.evidence, carrying: carryingAt(action),
    note: transferNote(action, instrument, sample),
  };
}

function atInstrument(
  phase: ProcedurePhase, instrument: BenchInstrument, action: HandAction, note: string, sample: BenchSample | null,
): BenchHandling {
  return {
    action, sampleId: sample?.id ?? null, sampleLabel: sample?.smiles ?? null, fromZone: null, instrument,
    phaseId: phase.id, evidence: 'SIMULATED', represents: phase.evidence, carrying: false, note,
  };
}

/**
 * The hands, read from the procedure and the rack. `motion` is the renderer's presentation-only
 * progress through the CURRENT task (0 = just started, 1 = arrived and working); it is clamped, so a
 * long engine run leaves the hands standing at the instrument instead of looping a fake choreography.
 */
export function benchHandlingOf(procedure: LabProcedure, layout: BenchLayout, motion = 0): BenchHandling {
  const phases = procedure.phases;
  const byId = (id: ProcedurePhaseId) => phases.find((p) => p.id === id) ?? null;
  const blocked = phases.find((p) => p.status === 'BLOCKED') ?? null;
  if (blocked) return idle(`przerwa w pracy: ${blocked.title.toLowerCase()} — ${blocked.detail || 'etap zablokowany'}`, blocked.id, blocked.evidence);

  const active = procedure.activeId ? byId(procedure.activeId) : null;
  const status = (id: ProcedurePhaseId) => byId(id)?.status ?? 'PENDING';

  // Before anything exists there is nothing to hold: the hands wait, and say what for.
  if (!layout.samples.length) {
    const prepare = byId('PREPARE');
    return idle(prepare?.status === 'ACTIVE' ? 'czeka na pierwsze cząsteczki z generatora' : 'stanowisko gotowe, brak próbek', prepare?.id ?? null, prepare?.evidence ?? 'SIMULATED');
  }

  if (active) {
    switch (active.id) {
      case 'PREPARE': {
        const sample = sampleFor(layout, 'QUEUE');
        return atInstrument(active, 'RACK', 'RECORD', sample ? `opisuje i stawia w statywie próbkę ${sample.smiles}` : 'przygotowuje statyw', sample);
      }
      case 'LOAD': {
        const t = transfer(active, layout, 'ANALYSER', 'ADMET', motion);
        if (t) return t;
        break;
      }
      case 'CONFIGURE': {
        const t = transfer(active, layout, 'WORKSTATION', 'DOCKING', motion);
        if (t) return t;
        break;
      }
      case 'EXECUTE': {
        const sample = sampleFor(layout, 'DOCKING');
        return atInstrument(active, 'WORKSTATION', 'OPERATE', sample ? `pracuje przy stanowisku dokowania, próbka ${sample.smiles} w aparaturze` : 'pracuje przy stanowisku dokowania', sample);
      }
      case 'OBSERVE': {
        const sample = sampleFor(layout, 'DOCKING');
        return atInstrument(active, 'POSE_VIEWER', 'OBSERVE', sample ? `obserwuje pozę próbki ${sample.smiles} w kieszeni receptora` : 'obserwuje kieszeń receptora', sample);
      }
      case 'MEASURE': {
        const sample = sampleFor(layout, 'DOCKING');
        return atInstrument(active, 'MONITOR', 'RECORD', sample ? `odczytuje wyniki dla próbki ${sample.smiles}` : 'odczytuje wyniki z aparatury', sample);
      }
      default: {
        const sample = sampleFor(layout, 'FINALIST');
        return atInstrument(active, 'MONITOR', 'RECORD', `zapisuje wynik etapu: ${active.title.toLowerCase()}`, sample);
      }
    }
  }

  // Nothing active: either the run has not reached the bench yet, or every phase is done.
  if (status('REPLAY') === 'DONE' || status('EVIDENCE') === 'DONE') {
    const finalist = layout.finalists[0] ?? null;
    const phase = byId('EVIDENCE')!;
    return atInstrument(phase, 'MONITOR', 'RECORD', finalist ? `zamyka protokół dla finalisty ${finalist.smiles}` : 'zamyka protokół eksperymentu', finalist);
  }
  return idle('czeka na kolejny etap', active?.id ?? null, active?.evidence ?? 'SIMULATED');
}

/**
 * How long one transfer takes on screen, in milliseconds. A presentation constant, not a measurement:
 * long enough to read as a real movement, short enough that a short backend stage still shows the whole
 * gesture rather than cutting it off halfway.
 */
export const TRANSFER_MS = 2600;

/** The clamped presentation progress of the current task. Never loops, never completes a phase. */
export function transferMotion(elapsedMs: number, durationMs = TRANSFER_MS): number {
  if (!(durationMs > 0)) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
