import type { WorldState } from '../world/scientificWorldState';
import { captureWorldTimeline, type WorldCaptureTimeline } from '../world/worldCapture';
import { projectCellWorldStates } from '../world/cellWorldAdapter';
import { executePreregisteredHypotheses, preregisterHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS } from '../experimentFabric/hypothesisLoop';
import { DEFAULT_SCENARIO_RUN, runScenario, SCENARIOS, type ScenarioId, type ScenarioRun } from '../simulation/scenarioEngine';
import { runScenarioCounterfactual, type ScenarioCounterfactual } from '../simulation/scenarioCounterfactual';
import { saveScenarioCounterfactualToMemory } from '../scienceMemory';
import type { SavedExperiment } from '../scienceMemory';
import { registerScenarioTimeline, setPendingScenarioTimeline } from '../experimentFabric/worldHandoff';
import { projectEpidemiologyWorldStates } from '../world/epidemiologyWorldAdapter';
import { buildAnchoredSequence, type AnchoredTemporalSequence, type TemporalAnchor } from './anchoredTemporal';
import type { WorldBounds as ScenarioWorldBounds } from './scenarioWorld';
import { buildShotPlan, type ShotPlan } from './shotPlan';
import { compareEpidemicRuns, compareHypothesisRanking, compareWorldModelBranches, type ScenarioComparisonView } from './scenarioComparison';
import { buildExperienceTimeline, type ExperienceTimeline } from './experienceOrchestrator';
import { buildScenarioWorld, type PerspectiveOption, type ScenarioWorld } from './scenarioWorld';
import { PERSPECTIVES, perspectiveRequest, placeCamera, type PerspectiveRequest } from './perspective';
import { DOMAIN_PERSPECTIVE_SOURCE } from './scenarioResolution';
import { setPendingLookingGlassExperience } from './sessionHandoff';
import { parseScenarioRequest, type StructuredScenarioRequest } from './scenarioRequest';
import { resolveScenarioRequest, type ScenarioResolution, type ScenarioRunPlan } from './scenarioResolution';
import {
  buildChemistryExperimentWorld, CHEMISTRY_KINETICS_DOMAIN_ID, CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver,
} from '../worldModel/domains/chemistryKinetics';
import { TemporalBranchRegistry, TemporalEngine } from '../worldModel/temporal/temporalEngine';
import { SolverRouter, type SolverRouteReport } from '../worldModel/solvers/solverRouter';
import { compareBranches, projectToWorldState } from '../worldModel/bridge/worldFrameState';
import { describeMoment, type WorldModelMoment } from './worldModelMoment';

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
  /**
   * A REAL comparison, computed by the same engine that computed the rest of
   * the session — never true merely because the sentence said "compare".
   * Null whenever no second run or ranking was actually produced, whether
   * because the user did not ask, or because the engine itself blocked the
   * comparison (different seed, a tie between candidates, and so on).
   */
  readonly comparison: ScenarioComparisonView | null;
  /**
   * Persists `comparison` into the existing Scientific Memory — the same
   * store the first-person lab session and `ScientificMemoryScreen` already
   * write to and replay from (`saveScenarioCounterfactualToMemory`). This is
   * the real bridge from a Looking Glass session to Genesis's durable,
   * replay-verified scientific record: no second memory, no second replay
   * protocol. Returns `null` when there is no comparison, or when this
   * domain's comparison has no counterfactual artifact behind it to save
   * (see `buildLaboratorySession`) — never a fabricated record.
   */
  readonly commitComparisonToMemory: () => SavedExperiment | null;
  /**
   * Before/after/why for this session's own focal entity, at a tick on this
   * session's own clock — powered by the real C3 bridge
   * (`describeWorldMoment`/`explainEntityChange`, `worldModelMoment.ts`).
   * Null for every domain that does not run on a live `TemporalEngine`
   * (epidemic, laboratory) — never approximated from `states` instead.
   */
  readonly describeEntityMoment: (atTick: number) => WorldModelMoment | null;
}

/**
 * Which perspectives this scenario really offers, and why not for the rest.
 * Read straight off the capability table so a UI cannot advertise a vantage
 * the world has no place to stand in.
 */
function perspectivesFor(kind: Parameters<typeof DOMAIN_PERSPECTIVE_SOURCE>[0]): readonly PerspectiveOption[] {
  return DOMAIN_PERSPECTIVE_SOURCE(kind);
}

/**
 * Where the vantage stands, DERIVED rather than looked up. The old table of
 * hardcoded coordinates per hint string meant each world needed its own
 * positions and each new vantage meant editing a switch; a placement is now
 * computed from the perspective definition and the world's real extent, so
 * the same CITIZEN vantage works in a twelve-metre laboratory and a
 * sixty-metre city without either knowing it exists.
 */
function anchorFor(plan: ScenarioRunPlan, bounds: ScenarioWorldBounds): TemporalAnchor | null {
  const definition = PERSPECTIVES[plan.viewpoint.kind];
  if (definition.eyeHeight === null) return null;

  const target: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1] + definition.eyeHeight,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const placement = placeCamera(perspectiveRequest(plan.viewpoint.kind, target, bounds));
  const [px, , pz] = placement.position;
  return {
    position: placement.position,
    // Face the subject from wherever the placement put us.
    yaw: Math.atan2(target[0] - px, target[2] - pz),
    pitch: definition.elevation * -1,
    eyeHeight: definition.eyeHeight,
    label: plan.viewpoint.anchorHint ?? definition.label.toLowerCase(),
  };
}

/** The request handed to the Graphics Engine camera rig once it exists. */
export function cameraRequestFor(plan: ScenarioRunPlan, bounds: ScenarioWorldBounds): PerspectiveRequest {
  const definition = PERSPECTIVES[plan.viewpoint.kind];
  const target: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    bounds.min[1] + (definition.eyeHeight ?? (bounds.max[1] - bounds.min[1]) * 0.4),
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  return perspectiveRequest(plan.viewpoint.kind, target, bounds);
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
  /** A REAL comparison, only when one was actually computed. */
  readonly comparison: ScenarioComparisonView | null;
  /**
   * The real counterfactual behind `comparison`, when the domain's engine
   * produces a savable one. Kept out of `ScenarioComparisonView` because that
   * type is a plain, domain-independent shape — this is the actual engine
   * artifact underneath it, present only for the epidemic path today.
   */
  readonly counterfactual: ScenarioCounterfactual | null;
  /** Registered handoff id, when this run has a 3D world to be entered. */
  readonly handoffRunId: string | null;
  /** Route that renders this world, or null when none exists yet. */
  readonly worldRoute: string | null;
  /** Pre-registered problem behind `states`, so a lab can run the same one. */
  readonly problemId: string | null;
  /** Extent of the world a perspective can be placed in, in metres. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  /**
   * The live C3 engine and its focal entity, present only for a domain built
   * on `core/worldModel/*` — powers `describeEntityMoment`. Null for
   * scenarioEngine/hypothesisLoop-backed domains, which have no such engine.
   */
  readonly worldModel: { readonly engine: TemporalEngine; readonly focalEntityId: string } | null;
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

  // A real comparison, computed only when the sentence actually asked for
  // one — never assumed from the word "compare" alone. ISOLATION is the
  // model's own canonical intervention: comparing it against BASELINE is
  // "what does isolation change", which is what a bare "compare" without a
  // named second scenario can honestly mean. Both arms go through the SAME
  // counterfactual engine `buildLabCounterfactual` uses and Scientific
  // Memory persists — not a second, Looking-Glass-only pairing of two raw
  // runs — so the comparison also carries a measured divergence day and a
  // fingerprint a saved copy can be replayed against.
  const counterfactual = plan.comparison
    ? runScenarioCounterfactual({
      baselineScenarioId: 'BASELINE',
      variantScenarioId: 'ISOLATION',
      days: plan.ticks,
      stepsPerDay: DEFAULT_SCENARIO_RUN.stepsPerDay,
      baseParams: {},
    })
    : null;
  const comparison = counterfactual ? compareEpidemicRuns(counterfactual) : null;
  // Reuse the counterfactual's own arm instead of running the model a third
  // time when a comparison was already computed.
  const run = counterfactual
    ? (scenarioId === 'ISOLATION' ? counterfactual.variant : counterfactual.baseline)
    : runScenario(scenarioId, { days: plan.ticks });

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
    comparison,
    counterfactual,
    worldModel: null,
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
function buildLaboratorySession(plan: ScenarioRunPlan): SessionBuild {
  const problem = HYPOTHESIS_PROBLEMS.find((candidate) => candidate.modelId === 'biology-logistic') ?? HYPOTHESIS_PROBLEMS[0];
  const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem)));
  const states = projectCellWorldStates(result);
  // The loop already ran every candidate hypothesis — the ranking between
  // them exists whether or not comparison was requested. It is exposed only
  // when the sentence actually asked for it, so `session.comparison` stays a
  // read of intent-matched-to-reality rather than "whatever happened to be
  // lying around".
  const comparison = plan.comparison ? compareHypothesisRanking(problem, result.discrimination) : null;
  return {
    states,
    comparison,
    // The hypothesis ranking has no counterfactual-engine artifact behind it
    // — it is not a saved baseline/variant pair, so there is nothing honest
    // to commit to Scientific Memory. `commitComparisonToMemory` on the
    // session reports this domain as unsupported rather than fabricating one.
    counterfactual: null,
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
    worldModel: null,
  };
}

/**
 * CHEMISTRY / MOLECULAR KINETICS — the real C3 World Model engine. A live
 * `WorldGraph` holding one substance is advanced tick by tick by the real
 * Arrhenius solver (`chemistryKinetics.ts`); each tick's `WorldState` is
 * `projectToWorldState`'d off the SAME graph the engine owns, so the state
 * series and the live engine are always looking at one history, never two.
 * The only thing built here is the wiring: no decay equation, no time
 * integration, no grounding rule is reimplemented.
 */
const CHEMISTRY_INITIAL_TEMPERATURE_K = 750;
/** How far the forked branch's temperature diverges at the fork point — cooling slows decay, giving a real, non-trivial comparison (see worldModelTrinityIntegration.test.ts's own cooled-branch pattern). */
const CHEMISTRY_FORK_TEMPERATURE_DELTA_K = -50;
/** One tick == one real hour, matching this domain's HOUR unit. */
const CHEMISTRY_DT_SECONDS = 3600;

function buildChemistrySession(plan: ScenarioRunPlan): SessionBuild {
  const world = buildChemistryExperimentWorld({ initialTemperatureK: CHEMISTRY_INITIAL_TEMPERATURE_K });
  const registry = new TemporalBranchRegistry();
  const engine = new TemporalEngine(world.graph, { label: 'baseline', registry });
  const router = new SolverRouter();
  router.register(CHEMISTRY_KINETICS_SOLVER_ID, makeChemistryKineticsSolver());
  const worldId = `chemistry:${plan.kind}`;

  // Tick 0: the substance before any solver step — nothing has happened yet,
  // so this state carries no event, honestly.
  const states: WorldState[] = [projectToWorldState(engine.graph, worldId, CHEMISTRY_KINETICS_DOMAIN_ID, 0)];
  for (let hour = 1; hour <= plan.ticks; hour++) {
    const captured: { report: SolverRouteReport | null } = { report: null };
    engine.advance(CHEMISTRY_DT_SECONDS, (graph, dt, tick) => {
      captured.report = router.routeTick(graph, dt, tick);
      return captured.report;
    });
    states.push(projectToWorldState(engine.graph, worldId, CHEMISTRY_KINETICS_DOMAIN_ID, engine.tick, {
      observations: captured.report?.observations ?? [],
      events: captured.report?.events ?? [],
    }));
  }

  // A real fork/counterfactual, only when the sentence actually asked for
  // one: halfway through the run, a second branch diverges by a genuine
  // temperature intervention (not a relabeled clone), then both branches run
  // to the same final tick so `compareBranches` compares like with like.
  let comparison: ScenarioComparisonView | null = null;
  if (plan.comparison && plan.ticks >= 2) {
    const forkTick = Math.floor(plan.ticks / 2);
    const cooled = engine.forkBranch(forkTick, 'cooled', (graph) => {
      const current = graph.getEntity(world.substanceId);
      graph.updateEntity(world.substanceId, {
        physics: { ...current.physics!, temperatureK: (current.physics!.temperatureK ?? CHEMISTRY_INITIAL_TEMPERATURE_K) + CHEMISTRY_FORK_TEMPERATURE_DELTA_K },
      });
    });
    for (let hour = forkTick + 1; hour <= plan.ticks; hour++) {
      cooled.advance(CHEMISTRY_DT_SECONDS, (graph, dt, tick) => router.routeTick(graph, dt, tick));
    }
    const branchComparison = compareBranches(registry, engine.branchId, cooled.branchId, plan.ticks);
    comparison = compareWorldModelBranches(branchComparison, world.substanceId, {
      baseline: `${CHEMISTRY_INITIAL_TEMPERATURE_K}K throughout`,
      variant: `cooled to ${CHEMISTRY_INITIAL_TEMPERATURE_K + CHEMISTRY_FORK_TEMPERATURE_DELTA_K}K at hour ${forkTick}`,
    });
  }

  return {
    states,
    comparison,
    // No ScenarioCounterfactual/Scientific-Memory artifact exists for this
    // engine yet — commitComparisonToMemory honestly reports this domain as
    // unsupported rather than inventing one.
    counterfactual: null,
    producedBy: `worldModel.TemporalEngine(${CHEMISTRY_KINETICS_SOLVER_ID}, ${plan.ticks} ticks)`,
    temporalTicks: states.map((state) => state.tick),
    temporalSource: `worldModel.TemporalEngine.advance(dt=${CHEMISTRY_DT_SECONDS}s)`,
    // No 3D rendering surface exists for this domain yet — that is the
    // Graphics Engine's to build, not Looking Glass's.
    handoffRunId: null,
    worldRoute: null,
    problemId: null,
    // A small lab-scale placement box — there is no renderer to occupy it
    // yet, but a perspective still needs SOME real extent to be placed in.
    bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    worldModel: { engine, focalEntityId: world.substanceId },
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
      comparison: null,
      experience: { requestId: request.requestId, viewpoint: request.viewpoint.kind, shots: [], durationSeconds: 0, anchored: null },
      producedBy: 'none',
      temporalSource: 'none',
      worldRoute: null,
      enterWorld: () => false,
      commitComparisonToMemory: () => null,
      describeEntityMoment: () => null,
    };
  }

  const plan = resolution.plan;
  const built: SessionBuild = plan.binding === 'SCENARIO_ENGINE_EPIDEMIC'
    ? buildEpidemicSession(plan)
    : plan.binding === 'WORLD_MODEL_CHEMISTRY'
      ? buildChemistrySession(plan)
      : buildLaboratorySession(plan);

  const timeline = captureWorldTimeline(null, [...built.states]);
  const shotPlan = buildShotPlan(timeline, plan, { hasComparison: built.comparison !== null });
  const anchor = anchorFor(plan, built.bounds);
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
    comparison: built.comparison,
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
        comparison: built.comparison,
      });
      return built.handoffRunId ? setPendingScenarioTimeline(built.handoffRunId) : true;
    },
    // Writes into Scientific Memory only when a real counterfactual artifact
    // exists behind `comparison` — the same gate `buildSavedScenarioCounterfactual`
    // itself enforces (COMPLETED comparisons only), so this can never persist
    // a blocked or fabricated pair.
    commitComparisonToMemory: () => {
      if (built.counterfactual === null || built.counterfactual.comparison.status !== 'COMPLETED') return null;
      return saveScenarioCounterfactualToMemory(built.counterfactual);
    },
    // Live C3 query, only for a domain that runs on a TemporalEngine. atTick
    // addresses THIS branch's own clock — never a foreign run's tick.
    describeEntityMoment: (atTick) => (built.worldModel
      ? describeMoment(built.worldModel.engine, built.worldModel.focalEntityId, atTick)
      : null),
  };
}
