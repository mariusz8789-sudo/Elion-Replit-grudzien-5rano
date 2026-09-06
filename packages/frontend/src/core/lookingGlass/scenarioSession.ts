import type { WorldState } from '../world/scientificWorldState';
import { captureWorldTimeline, type WorldCaptureTimeline } from '../world/worldCapture';
import { projectCellWorldStates } from '../world/cellWorldAdapter';
import { executePreregisteredHypotheses, preregisterHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS } from '../experimentFabric/hypothesisLoop';
import { runScenario, SCENARIOS, type ScenarioId, type ScenarioRun } from '../simulation/scenarioEngine';
import { registerScenarioTimeline, setPendingScenarioTimeline } from '../experimentFabric/worldHandoff';
import { projectEpidemiologyWorldStates } from '../world/epidemiologyWorldAdapter';
import { buildAnchoredSequence, type AnchoredTemporalSequence, type TemporalAnchor } from './anchoredTemporal';
import { buildShotPlan, type ShotPlan } from './shotPlan';
import { buildExperienceTimeline, type ExperienceTimeline } from './experienceOrchestrator';
import { buildScenarioWorld, type PerspectiveOption, type ScenarioWorld } from './scenarioWorld';
import { DOMAIN_PERSPECTIVE_SOURCE } from './scenarioResolution';
import { setPendingLookingGlassExperience } from './sessionHandoff';
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
  /**
   * The shot plan laid out on a real clock — what the viewer sees at any
   * instant. Empty when the scenario did not resolve.
   */
  readonly experience: ExperienceTimeline;
  /** The engine that produced `states`, for provenance in the UI. */
  readonly producedBy: string;
  /** The engine that produced the temporal progression the anchor plays. */
  readonly temporalSource: string;
  /**
   * The domain-independent view every layer above this one talks to. Null
   * only when the scenario did not resolve.
   */
  readonly world: ScenarioWorld | null;
  /**
   * Route that renders this world, or null when the scenario resolved but no
   * 3D surface exists for it. A caller must hide the entry affordance rather
   * than navigating somewhere that shows a different world.
   */
  readonly worldRoute: string | null;
  /** Arms the world bridge and returns whether a world is now waiting. */
  readonly enterWorld: () => boolean;
}

/**
 * Which perspectives this scenario really offers, and why not for the rest.
 * Read straight off the capability table so a UI cannot advertise a vantage
 * the world has no place to stand in.
 */
function perspectivesFor(kind: Parameters<typeof DOMAIN_PERSPECTIVE_SOURCE>[0]): readonly PerspectiveOption[] {
  return DOMAIN_PERSPECTIVE_SOURCE(kind);
}

/** Anchors are placement, not science: where a person stands to watch. */
const ANCHORS: Readonly<Record<string, TemporalAnchor>> = {
  street: { position: [0, 0, 6], yaw: Math.PI, pitch: -0.05, eyeHeight: 1.7, label: 'street' },
  bench: { position: [2.5, 0, 7], yaw: Math.PI * 0.85, pitch: -0.08, eyeHeight: 1.25, label: 'bench' },
  rooftop: { position: [0, 12, 10], yaw: Math.PI, pitch: -0.35, eyeHeight: 1.7, label: 'rooftop' },
  window: { position: [-4, 3, 8], yaw: Math.PI * 0.9, pitch: -0.15, eyeHeight: 1.6, label: 'window' },
  coast: { position: [0, 1, 14], yaw: Math.PI, pitch: -0.05, eyeHeight: 1.7, label: 'coast' },
  room: { position: [0, 0, 3.3], yaw: 0, pitch: 0, eyeHeight: 1.7, label: 'room' },
  // Seated in a vehicle: lower eye height, and off the pavement centre line.
  car: { position: [1.4, 0, 5.5], yaw: Math.PI * 0.94, pitch: -0.02, eyeHeight: 1.15, label: 'car' },
  vehicle: { position: [-1.2, 0, 5.5], yaw: Math.PI * 1.05, pitch: -0.02, eyeHeight: 1.45, label: 'vehicle' },
};

const DEFAULT_ANCHOR: TemporalAnchor = ANCHORS.room;

function anchorFor(plan: ScenarioRunPlan): TemporalAnchor | null {
  const embodied = plan.viewpoint.kind === 'ANCHORED_HUMAN'
    || plan.viewpoint.kind === 'SCIENTIST_POV'
    || plan.viewpoint.kind === 'OPERATOR_POV'
    || plan.viewpoint.kind === 'RESPONDER_POV'
    || plan.viewpoint.kind === 'DRIVER_POV';
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
  /** Registered handoff id, when this run has a 3D world to be entered. */
  readonly handoffRunId: string | null;
  /** Route that renders this world, or null when none exists yet. */
  readonly worldRoute: string | null;
  /** Pre-registered problem behind `states`, so a lab can run the same one. */
  readonly problemId: string | null;
  /** Extent of the world a perspective can be placed in, in metres. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
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

  // Hand the real day series to the existing world bridge rather than
  // inventing a second channel: `worldHandoff` is already the only road a
  // scenario run travels to the 3D city, and the city screen already listens
  // on it. A run whose model returned no summary is not registered at all —
  // the world then has nothing to show, which is the correct outcome, not a
  // reason to synthesise one.
  const handoffRunId = registerRun(run, `lg:${plan.kind}:${plan.ticks}`);

  return {
    states,
    producedBy: `hypothesisLoop.executePreregisteredHypotheses(${problem.problemId})`,
    temporalTicks: run.series.map((sample) => sample.day),
    temporalSource: `scenarioEngine.runScenario(${scenarioId}, { days: ${plan.ticks} })`,
    handoffRunId,
    worldRoute: handoffRunId ? '#/city3d' : null,
    problemId: problem.problemId,
    // The city grid the epidemic runs on, in metres.
    bounds: { min: [-30, 0, -30], max: [30, 20, 30] },
  };
}

/** Registers a completed scenario run with the existing world bridge. */
function registerRun(run: ScenarioRun, runId: string): string | null {
  const scenarioSummary = run.summary;
  if (scenarioSummary === null || run.resultFingerprint === null) return null;
  registerScenarioTimeline({
    runId,
    runFingerprint: run.resultFingerprint,
    resultOrigin: 'real-engine',
    modelId: 'scenario-timeline',
    scenarioId: run.scenarioId,
    scenarioLabel: SCENARIOS[run.scenarioId].label,
    seed: run.params.seed,
    summary: `Looking Glass: ${run.label}, ${run.series.length} dni.`,
    series: run.series,
    scenarioSummary,
    scenarioRun: run,
    epistemicStatus: 'SIMULATION',
    origin: 'fabric-run',
  });
  return runId;
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
    // The laboratory world is the existing first-person lab, which reads the
    // live experiment itself rather than a handed-off day series.
    handoffRunId: null,
    worldRoute: '#/first-person-lab',
    problemId: problem.problemId,
    // The laboratory hall, in metres — see labScene3D's ROOM.
    bounds: { min: [-6, 0, -13.4], max: [6, 4.6, 4.5] },
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
      world: null,
      experience: { requestId: request.requestId, viewpoint: request.viewpoint.kind, shots: [], durationSeconds: 0, anchored: null },
      producedBy: 'none',
      temporalSource: 'none',
      worldRoute: null,
      enterWorld: () => false,
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

  const experience = buildExperienceTimeline(shotPlan, plan.viewpoint.kind, anchored);

  // The universal contract over what the adapters produced. Every layer
  // above — orchestrator, director, renderer — reads this and never a domain.
  const world = buildScenarioWorld({
    worldId: timeline.worldId,
    domainId: plan.family,
    producedBy: built.producedBy,
    states: built.states,
    timeline,
    viewerTicks: built.temporalTicks,
    unit: plan.unit,
    perspectives: perspectivesFor(plan.kind),
    bounds: built.bounds,
  });

  return {
    request, resolution, states: built.states, timeline, shotPlan, anchored, experience, world,
    producedBy: built.producedBy, temporalSource: built.temporalSource,
    worldRoute: built.worldRoute,
    // Arming is separate from opening so the caller decides when to navigate,
    // and so a world that failed to register cannot be silently entered.
    enterWorld: () => {
      if (built.worldRoute === null) return false;
      // The vantage travels on its own channel: a world that cannot honour
      // it still shows the right run, just from its default viewpoint.
      setPendingLookingGlassExperience({
        requestText: request.sourceText,
        requestId: request.requestId,
        kind: plan.kind,
        viewpoint: plan.viewpoint.kind,
        anchorLabel: anchor?.label ?? null,
        autoPlay: anchored !== null,
        secondsPerStep: anchored?.secondsPerStep ?? 1,
        problemId: built.problemId,
        experience,
        world,
      });
      return built.handoffRunId ? setPendingScenarioTimeline(built.handoffRunId) : true;
    },
  };
}
