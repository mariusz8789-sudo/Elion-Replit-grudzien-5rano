import type { WorldState } from '../world/scientificWorldState';
import { captureWorldTimeline, type WorldCaptureTimeline } from '../world/worldCapture';
import { projectCellWorldStates } from '../world/cellWorldAdapter';
import { executePreregisteredHypotheses, preregisterHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS } from '../experimentFabric/hypothesisLoop';
import { runScenario, type ScenarioId } from '../simulation/scenarioEngine';
import { projectEpidemiologyWorldStates } from '../world/epidemiologyWorldAdapter';
import { buildAnchoredSequence, type AnchoredTemporalSequence, type TemporalAnchor } from './anchoredTemporal';
import { buildShotPlan, type ShotPlan } from './shotPlan';
import { parseScenarioRequest, type StructuredScenarioRequest } from './scenarioRequest';
import { resolveScenarioRequest, type ScenarioResolution, type ScenarioRunPlan } from './scenarioResolution';

/**
 * LOOKING GLASS — THE VERTICAL SLICE.
 *
 * One function takes a sentence and returns something a person can be
 * inside: `openLookingGlass(text)` runs
 *
 *   natural language → structured scenario → real Genesis model → world
 *   states → capture timeline → shot plan → anchored temporal sequence
 *
 * and the only thing it CONTRIBUTES is the wiring. Every scientific value on
 * the way through comes out of a model that already existed: the epidemic
 * path calls `runScenario` (scenarioEngine) and projects through the
 * epidemiology world adapter; the laboratory path runs the real
 * pre-registered hypothesis loop and projects through the cell world
 * adapter. This module contains no solver, no second discovery loop, no
 * second replay protocol, and computes no scientific quantity of its own —
 * if it ever does, the Looking Glass has stopped being a lens and started
 * being a rival engine.
 *
 * WHY ONE MODULE FOR TWO VERY DIFFERENT DOMAINS. That is the whole claim
 * being tested. An epidemic across a city and a culture in a bioreactor
 * share no physics, no units and no geometry — but they produce the same
 * shape of thing to experience: a series of real states, markers worth
 * cutting to, and a place a person can stand while it happens. If a third
 * domain needs a third `open...` function, the abstraction was wrong. It
 * needs a `SessionBuilder` entry below and nothing else.
 */

export interface LookingGlassSession {
  readonly request: StructuredScenarioRequest;
  readonly resolution: ScenarioResolution;
  /** Real world states from the underlying model, in tick order. */
  readonly states: readonly WorldState[];
  readonly timeline: WorldCaptureTimeline;
  readonly shotPlan: ShotPlan;
  /** Present when the viewpoint is one a person occupies. */
  readonly anchored: AnchoredTemporalSequence | null;
  /** The engine that produced `states`, for provenance in the UI. */
  readonly producedBy: string;
  /** The engine that produced the temporal progression the anchor plays. */
  readonly temporalSource: string;
}

/** Anchors are placement, not science: where a person stands to watch. */
const ANCHORS: Readonly<Record<string, TemporalAnchor>> = {
  street: { position: [0, 0, 6], yaw: Math.PI, pitch: -0.05, eyeHeight: 1.7, label: 'street' },
  bench: { position: [2.5, 0, 7], yaw: Math.PI * 0.85, pitch: -0.08, eyeHeight: 1.25, label: 'bench' },
  rooftop: { position: [0, 12, 10], yaw: Math.PI, pitch: -0.35, eyeHeight: 1.7, label: 'rooftop' },
  window: { position: [-4, 3, 8], yaw: Math.PI * 0.9, pitch: -0.15, eyeHeight: 1.6, label: 'window' },
  coast: { position: [0, 1, 14], yaw: Math.PI, pitch: -0.05, eyeHeight: 1.7, label: 'coast' },
  room: { position: [0, 0, 3.3], yaw: 0, pitch: 0, eyeHeight: 1.7, label: 'room' },
};

const DEFAULT_ANCHOR: TemporalAnchor = ANCHORS.room;

function anchorFor(plan: ScenarioRunPlan): TemporalAnchor | null {
  const embodied = plan.viewpoint.kind === 'ANCHORED_HUMAN'
    || plan.viewpoint.kind === 'SCIENTIST_POV'
    || plan.viewpoint.kind === 'OPERATOR_POV'
    || plan.viewpoint.kind === 'RESPONDER_POV';
  if (!embodied) return null;
  const hint = plan.viewpoint.anchorHint;
  return (hint && ANCHORS[hint]) || DEFAULT_ANCHOR;
}

/**
 * What one binding produces. The two series are deliberately distinct and
 * both real, because they answer different questions:
 *
 *  - `states` are canonical `WorldState`s from a domain adapter, one per
 *    experiment run, carrying epistemic status, observations and events.
 *    They are what the shot plan cuts to.
 *  - `temporalTicks` is the world's own step-by-step progression — the 60
 *    days an epidemic actually ran. It is what an anchored viewer watches
 *    pass. Collapsing the two would either give the viewer three frames or
 *    give the shot plan sixty meaningless markers.
 */
interface SessionBuild {
  readonly states: readonly WorldState[];
  readonly producedBy: string;
  readonly temporalTicks: readonly number[];
  readonly temporalSource: string;
}

/**
 * EPIDEMIC — the existing scenario engine, unchanged. `runScenario` computes
 * the compartmental model; the adapter projects its day samples into the
 * canonical WorldState. Neither is modified or reimplemented here.
 */
function buildEpidemicSession(plan: ScenarioRunPlan): SessionBuild {
  // Epistemic states: the real pre-registered loop over the epidemiological
  // problem, projected by the existing adapter.
  const problem = HYPOTHESIS_PROBLEMS.find((candidate) => candidate.modelId === 'scenario-timeline') ?? HYPOTHESIS_PROBLEMS[0];
  const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem)));
  const states = projectEpidemiologyWorldStates(result);

  // Temporal progression: the compartmental model run for exactly the span
  // the user asked for. `days` comes straight from the request, so "60 days"
  // means sixty days the model actually computed — not sixty frames drawn
  // over a shorter run.
  const scenarioId: ScenarioId = plan.kind === 'QUARANTINE' ? 'ISOLATION' : 'BASELINE';
  const run = runScenario(scenarioId, { days: plan.ticks });

  return {
    states,
    producedBy: `hypothesisLoop.executePreregisteredHypotheses(${problem.problemId})`,
    temporalTicks: run.series.map((sample) => sample.day),
    temporalSource: `scenarioEngine.runScenario(${scenarioId}, { days: ${plan.ticks} })`,
  };
}

/**
 * LABORATORY / CELL CULTURE — the real pre-registered hypothesis loop, so
 * the states carry genuine epistemic status (SUPPORTED/FALSIFIED/...) rather
 * than a curve drawn for the camera.
 */
function buildLaboratorySession(): SessionBuild {
  const problem = HYPOTHESIS_PROBLEMS.find((candidate) => candidate.modelId === 'biology-logistic') ?? HYPOTHESIS_PROBLEMS[0];
  const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem)));
  const states = projectCellWorldStates(result);
  return {
    states,
    producedBy: `hypothesisLoop.executePreregisteredHypotheses(${problem.problemId})`,
    // The laboratory world advances per projected state; there is no separate
    // finer series to play through, and inventing one would be fabrication.
    temporalTicks: states.map((state) => state.tick),
    temporalSource: `cellWorldAdapter.projectCellWorldStates(${problem.problemId})`,
  };
}

/**
 * Opens a Looking Glass session from a sentence.
 *
 * Returns a session even when the scenario cannot run: `resolution.status`
 * carries NEEDS_INPUT / NOT_MODELLED / REFUSED with its reasons, and the
 * state-bearing fields are empty. A caller must render the refusal, never
 * silently show an empty world.
 */
export function openLookingGlass(sourceText: string): LookingGlassSession {
  const request = parseScenarioRequest(sourceText);
  const resolution = resolveScenarioRequest(request);

  const emptyTimeline = captureWorldTimeline(null, []);
  if (resolution.status !== 'READY' || !resolution.plan) {
    return {
      request,
      resolution,
      states: [],
      timeline: emptyTimeline,
      shotPlan: { planId: 'sp-none', runId: emptyTimeline.runId, worldId: emptyTimeline.worldId, shots: [], markersUsed: 0, markersAvailable: 0 },
      anchored: null,
      producedBy: 'none',
      temporalSource: 'none',
    };
  }

  const plan = resolution.plan;
  const built: SessionBuild = plan.binding === 'SCENARIO_ENGINE_EPIDEMIC'
    ? buildEpidemicSession(plan)
    : buildLaboratorySession();

  const timeline = captureWorldTimeline(null, [...built.states]);
  const shotPlan = buildShotPlan(timeline, plan);
  const anchor = anchorFor(plan);
  const anchored = anchor
    ? buildAnchoredSequence(anchor, built.temporalTicks, plan.unit, {
      // One real second per world step keeps 60 days at roughly a minute —
      // long enough to watch, short enough to sit through.
      secondsPerStep: 1,
      maxKeyframes: 120,
    })
    : null;

  return {
    request, resolution, states: built.states, timeline, shotPlan, anchored,
    producedBy: built.producedBy, temporalSource: built.temporalSource,
  };
}
