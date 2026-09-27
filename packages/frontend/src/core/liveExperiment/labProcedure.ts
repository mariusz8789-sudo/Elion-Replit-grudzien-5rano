import type { LiveCandidate, LiveDrugRunState } from './drugRunState';

/**
 * LAB PROCEDURE — the laboratory reading of the ONE canonical run state.
 *
 * This is a pure projection of `LiveDrugRunState` (itself a projection of what the backend persisted).
 * It holds no experiment state of its own, starts nothing and measures nothing: it only says which
 * bench phase the persisted facts correspond to, so the scientist, the instruments, the cameras and the
 * timeline in the UI can all be driven from the same source. A phase becomes DONE only when the record
 * that proves it exists (an event, a measurement, a pose), so the scene can never run ahead of the
 * engines.
 *
 * Every phase carries its own epistemic label, because a realistic bench must never suggest that a
 * computed number was measured on a physical instrument:
 *   REAL_ENGINE_OUTPUT — a real computational engine produced this (RDKit, Meeko, AutoDock Vina, PySCF);
 *   MODEL_ESTIMATE     — a trained model predicted it (ADMET-AI);
 *   REFERENCE_DATA     — it comes from a vetted published source (the PDB structure and its pocket);
 *   SIMULATED          — a laboratory step shown for understanding that no engine performed;
 *   DERIVED            — computed from the above by frozen rules (the verdict), no new measurement.
 */

export type ProcedurePhaseId = 'PREPARE' | 'LOAD' | 'CONFIGURE' | 'EXECUTE' | 'OBSERVE' | 'MEASURE' | 'INTERPRET' | 'EVIDENCE' | 'REPLAY';
export type ProcedureStatus = 'PENDING' | 'ACTIVE' | 'DONE' | 'BLOCKED' | 'SKIPPED';
export type EpistemicLabel = 'REAL_ENGINE_OUTPUT' | 'MODEL_ESTIMATE' | 'REFERENCE_DATA' | 'SIMULATED' | 'DERIVED';

/**
 * Where in the lab a phase happens, and what the camera should look at while it is active. 'HANDS' is
 * not a phase's own focus: the bench layer uses it while a sample is actually being handled, so the
 * shot follows the work instead of the furniture.
 */
export type BenchFocus = 'BENCH' | 'SAMPLES' | 'ANALYSER' | 'RECEPTOR' | 'WORKSTATION' | 'POSE' | 'MONITOR' | 'HANDS';

export interface ProcedurePhase {
  readonly id: ProcedurePhaseId;
  /** Plain-language label: a non-technical viewer should follow the experiment from these alone. */
  readonly title: string;
  readonly status: ProcedureStatus;
  /** What the persisted record actually says at this moment (never a guess, empty when nothing yet). */
  readonly detail: string;
  readonly evidence: EpistemicLabel;
  readonly focus: BenchFocus;
}

export interface LabProcedure {
  readonly phases: readonly ProcedurePhase[];
  readonly activeId: ProcedurePhaseId | null;
  /** The candidate the bench is working on, or null before anything was generated. */
  readonly candidate: LiveCandidate | null;
}

/** What the outcome panel knows and the run state does not: the session is sealed and replayed. */
export interface ProcedureOutcomeInput {
  readonly sealed?: boolean;
  readonly verdict?: string | null;
  readonly replay?: 'MATCH' | 'MISMATCH' | 'PENDING' | null;
}

const num = (v: number | null | undefined, unit: string): string => (typeof v === 'number' ? `${v.toFixed(2)} ${unit}` : '—');

function phase(id: ProcedurePhaseId, title: string, evidence: EpistemicLabel, focus: BenchFocus, status: ProcedureStatus, detail: string): ProcedurePhase {
  return { id, title, evidence, focus, status, detail };
}

/**
 * Reads the run state as a bench procedure. `candidate` is the one the bench works on (the focused
 * candidate of the scene), so the instruments and the timeline speak about the same molecule.
 */
export function labProcedureOf(state: LiveDrugRunState | null, candidate: LiveCandidate | null, outcome: ProcedureOutcomeInput = {}): LabProcedure {
  if (!state) {
    return {
      candidate: null,
      activeId: null,
      phases: [
        phase('PREPARE', 'Przygotowanie serii kandydatów', 'REAL_ENGINE_OUTPUT', 'BENCH', 'PENDING', ''),
        phase('LOAD', 'Wprowadzenie próbek do analizatora ADMET', 'MODEL_ESTIMATE', 'SAMPLES', 'PENDING', ''),
        phase('CONFIGURE', 'Przygotowanie receptora i ligandu', 'REAL_ENGINE_OUTPUT', 'RECEPTOR', 'PENDING', ''),
        phase('EXECUTE', 'Dokowanie na stanowisku obliczeniowym', 'REAL_ENGINE_OUTPUT', 'WORKSTATION', 'PENDING', ''),
        phase('OBSERVE', 'Obserwacja pozy w kieszeni wiązania', 'REAL_ENGINE_OUTPUT', 'POSE', 'PENDING', ''),
        phase('MEASURE', 'Odczyt wyników z aparatury', 'REAL_ENGINE_OUTPUT', 'MONITOR', 'PENDING', ''),
        phase('INTERPRET', 'Werdykt wobec zamrożonych kryteriów', 'DERIVED', 'MONITOR', 'PENDING', ''),
        phase('EVIDENCE', 'Zapieczętowanie dowodów', 'DERIVED', 'MONITOR', 'PENDING', ''),
        phase('REPLAY', 'Powtórzenie eksperymentu', 'DERIVED', 'MONITOR', 'PENDING', ''),
      ],
    };
  }

  const retained = state.candidates.filter((c) => c.status === 'retained').length;
  const admet = candidate?.stages.admet ?? null;
  const docking = candidate?.stages.docking ?? null;
  const quantum = candidate?.stages.quantum ?? null;
  const blockedStage = (name: string) => state.blocked.find((b) => b.stage === name) ?? null;
  const finished = state.stage === 'COMPLETED' || state.stage === 'CANCELLED';
  const step = candidate?.dockingStep ?? null;

  // PREPARE — RDKit generated and filtered the analogue series (a computation, never a synthesis).
  const prepareDone = state.candidates.length > 0;
  const prepare = phase('PREPARE', 'Przygotowanie serii kandydatów (przekształcenia obliczeniowe)', 'REAL_ENGINE_OUTPUT', 'BENCH',
    prepareDone ? 'DONE' : 'ACTIVE',
    prepareDone ? `${state.candidates.length} cząsteczek, ${retained} spełnia ograniczenia · generacje ${state.generationsCompleted}/${state.maxGenerations}` : 'RDKit generuje analogi…');

  // LOAD — the candidates go into the ADMET analyser; its numbers are model predictions.
  const admetBlocked = blockedStage('admet');
  const load = phase('LOAD', 'Wprowadzenie próbek do analizatora ADMET', 'MODEL_ESTIMATE', 'SAMPLES',
    admetBlocked ? 'BLOCKED' : admet ? 'DONE' : prepareDone ? 'ACTIVE' : 'PENDING',
    admetBlocked ? `etap zablokowany: ${admetBlocked.blocker}`
      : admet?.endpoints ? Object.entries(admet.endpoints).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')
        : admet ? admet.status : '');

  // CONFIGURE — the vetted protein is prepared (published structure) and the ligand is parameterised.
  const dockBlocked = blockedStage('docking');
  const configureDone = Boolean(state.target) && (step === 'LIGAND_PREPARED' || step === 'VINA_STARTED' || step === 'POSE_SCORED');
  const configure = phase('CONFIGURE', 'Przygotowanie receptora i ligandu', state.target ? 'REFERENCE_DATA' : 'REAL_ENGINE_OUTPUT', 'RECEPTOR',
    dockBlocked ? 'BLOCKED' : configureDone ? 'DONE' : state.target || step === 'SELECTED' ? 'ACTIVE' : 'PENDING',
    dockBlocked ? `etap zablokowany: ${dockBlocked.blocker}`
      : state.target ? `${state.target.protein} · PDB ${state.target.pdbId}:${state.target.chain}, ${state.target.receptorAtoms} atomów; kieszeń [${state.target.center.join(', ')}] Å` : '');

  // EXECUTE — Vina is actually running; the scientist stays at the workstation until it returns.
  const execute = phase('EXECUTE', 'Dokowanie: AutoDock Vina liczy', 'REAL_ENGINE_OUTPUT', 'WORKSTATION',
    dockBlocked ? 'BLOCKED' : step === 'FAILED' ? 'BLOCKED' : step === 'POSE_SCORED' ? 'DONE' : step === 'VINA_STARTED' ? 'ACTIVE' : 'PENDING',
    step === 'VINA_STARTED' ? 'silnik pracuje — wynik pojawi się, gdy skończy' : step === 'POSE_SCORED' ? 'przebieg zakończony' : step === 'FAILED' ? 'dokowanie nie powiodło się' : '');

  // OBSERVE — the pose Vina produced, in the pocket it was docked into.
  const pose = candidate?.pose ?? null;
  const observe = phase('OBSERVE', 'Obserwacja pozy w kieszeni wiązania', 'REAL_ENGINE_OUTPUT', 'POSE',
    pose ? 'DONE' : step === 'POSE_SCORED' ? 'ACTIVE' : 'PENDING',
    pose ? `${pose.atoms.length} atomów ligandu, reszty kieszeni: ${pose.pocketResidues.slice(0, 5).join(', ')}${pose.pocketResidues.length > 5 ? '…' : ''}` : '');

  // MEASURE — the numbers the engines wrote down, on the bench monitor.
  const qmBlocked = blockedStage('quantum');
  const measured = docking?.value != null;
  const measure = phase('MEASURE', 'Odczyt wyników z aparatury', 'REAL_ENGINE_OUTPUT', 'MONITOR',
    measured ? 'DONE' : pose ? 'ACTIVE' : 'PENDING',
    measured
      ? `Vina ${num(docking?.value, 'kcal/mol')} (estymata funkcji oceniającej, nie pomiar) · QM ${qmBlocked ? 'zablokowane' : num(quantum?.value, 'eV')}`
      : '');

  // INTERPRET — the frozen rules decide; no new measurement, no model opinion.
  const interpret = phase('INTERPRET', 'Werdykt wobec zamrożonych kryteriów', 'DERIVED', 'MONITOR',
    outcome.verdict ? 'DONE' : finished ? 'ACTIVE' : 'PENDING',
    outcome.verdict ?? (finished ? 'run zakończony, trwa ocena kryteriów' : ''));

  const evidence = phase('EVIDENCE', 'Zapieczętowanie dowodów', 'DERIVED', 'MONITOR',
    outcome.sealed ? 'DONE' : outcome.verdict ? 'ACTIVE' : 'PENDING',
    outcome.sealed ? 'sesja zapieczętowana z identyfikatorami przebiegów i sumami kontrolnymi' : '');

  const replay = phase('REPLAY', 'Powtórzenie eksperymentu', 'DERIVED', 'MONITOR',
    outcome.replay === 'MATCH' ? 'DONE' : outcome.replay === 'MISMATCH' ? 'BLOCKED' : outcome.replay === 'PENDING' ? 'ACTIVE' : outcome.sealed ? 'PENDING' : 'PENDING',
    outcome.replay === 'MATCH' ? 'powtórka odtworzyła ten sam wynik' : outcome.replay === 'MISMATCH' ? 'powtórka dała inny wynik' : '');

  const phases = [prepare, load, configure, execute, observe, measure, interpret, evidence, replay];
  // The bench looks at the furthest phase actually under way; if nothing is, at what is blocking it.
  const active = [...phases].reverse().find((p) => p.status === 'ACTIVE') ?? phases.find((p) => p.status === 'BLOCKED') ?? null;
  return { phases, activeId: active?.id ?? null, candidate };
}
