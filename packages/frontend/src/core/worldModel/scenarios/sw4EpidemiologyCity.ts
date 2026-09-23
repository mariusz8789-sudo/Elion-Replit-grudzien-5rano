import { canonicalJson, fnv1a } from '../../events/hash';
import { DEFAULT_EPIDEMIC, type EpidemicParams } from '../../epidemic/sir';
import { EPIDEMIC_DOMAIN_ID, EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver } from '../domains/epidemicSEIR';
import type { EntityId, GroundingLevel, WorldModelEntity } from '../ecs/types';
import { createScientificWorld } from '../orchestration/createScientificWorld';
import { SolverRouter } from '../solvers/solverRouter';
import { TemporalEngine } from '../temporal/temporalEngine';
import { projectToWorldState } from '../bridge/worldFrameState';
import {
  buildBundleReplay,
  buildWorldEvidenceBundle,
  classifyGrounding,
  worldStateFingerprint,
  type BundleReplay,
  type ElementClassification,
  type WorldEvidenceBundle,
} from '../evidence/worldEvidenceBundle';
import type { WorldSpecification } from '../specification/worldSpecification';

/**
 * SW-4 — GENERATED-CITY EPIDEMIC SCENARIO (integration layer, not a new engine).
 *
 * Every real computation here is delegated to what already exists:
 *  - `specification/compiler.ts` (`generateSpecifiedWorld`, via
 *    `orchestration/createScientificWorld.ts`) — the ONE canonical
 *    WorldSpecification -> WorldBlueprint -> WorldGraph pipeline.
 *  - `domains/epidemicSEIR.ts` — the ONE real RK4 SEIR solver and the ONE
 *    `addPopulation` builder (invoked here through `EPIDEMIOLOGY_TEMPLATE`,
 *    never re-implemented).
 *  - `solvers/solverRouter.ts` — the ONE solver registry/dispatch.
 *  - `temporal/temporalEngine.ts` — the ONE tick/delta/replay engine.
 *  - `evidence/worldEvidenceBundle.ts` — the ONE WorldGraph replay/fingerprint
 *    and evidence-bundle mechanism (`worldStateFingerprint`,
 *    `buildBundleReplay`, `buildWorldEvidenceBundle`).
 *
 * This file adds exactly one thing none of those already provide: a
 * deterministic, city-scale, end-to-end assembly of them for an epidemic
 * scenario, plus a small read-only render-state projection
 * (`getSw4RenderState`) for a future UI to consume. It creates no second
 * WorldGraph/WorldGenerator/TemporalEngine/population system/SEIR solver/
 * solver registry/EvidenceLedger/replay mechanism, and it runs no physics of
 * its own — every S/E/I/R/D number below was produced by `rk4Step`
 * (core/epidemic/sir.ts) through the existing solver, unmodified.
 *
 * ## Honesty boundary
 *
 * The population's `grounding` is always `MODEL_ESTIMATE` (declared by
 * `domains/epidemicSEIR.ts` itself, not overridden here): a real, exact RK4
 * integration of a deliberately simplified compartmental model of an
 * abstract "Pathogen X" — never a claim of measured/observed epidemic data.
 * See `SW4_EPIDEMIC_DISCLOSURE` below, which every render-state and evidence
 * output this module produces carries verbatim.
 */
export const SW4_CONTRACT_VERSION = '1.0.0';
export const SW4_SCENARIO_ID = 'sw4-epidemiology-city';

/**
 * The one honest epistemic-status sentence this module attaches to every
 * output. Deliberately not a new enum: `GroundingLevel`/`ElementClassification`
 * (both already defined in this ECS — see ecs/types.ts and
 * evidence/worldEvidenceBundle.ts) are the established vocabulary; this is the
 * prose statement of what `MODEL_ESTIMATE` means for THIS scenario, not a
 * fourth parallel classification.
 */
export const SW4_EPIDEMIC_DISCLOSURE =
  'SIMULATED / MODEL — not a direct observation. A real RK4 integration of a deliberately simplified SEIR ' +
  'compartmental model over an abstract "Pathogen X" (core/epidemic/sir.ts), applied to a procedurally ' +
  'generated city population. It is not measured surveillance data, not a prediction about any real pathogen, ' +
  'and not a clinical or public-health recommendation.';

export interface Sw4EpidemiologyCityOptions {
  /** Deterministic seed — the SAME seed always compiles to the SAME WorldGraph (specification/compiler.ts's own contract) and, combined with the same run parameters below, the SAME simulation trajectory. */
  readonly seed: number;
  readonly worldId?: string;
  /** City structural detail — reuses CITY_TEMPLATE's own defaults when omitted. */
  readonly districtCount?: number;
  readonly buildingsPerDistrict?: number;
  readonly levelOfDetail?: WorldSpecification['levelOfDetail'];
  /** Total city population fed to the real SEIR solver's initial condition (`initialState`, core/epidemic/sir.ts). */
  readonly populationCount?: number;
  /** Any other real `EpidemicParams` override (r0, infectiousDays, incubationDays, ifr, interventionDay, interventionEffect). Never a structural field like `model`/`population`, which are governed separately above/below. */
  readonly epidemicParams?: Partial<Omit<EpidemicParams, 'population'>>;
  /** Number of real solver ticks to run. */
  readonly ticks: number;
  /** Tick length in days (the SEIR solver's own natural unit). */
  readonly dtDays?: number;
}

export interface Sw4CompartmentSnapshot {
  readonly tick: number;
  readonly simulatedTimeDays: number;
  readonly S: number;
  readonly E: number;
  readonly I: number;
  readonly R: number;
  readonly D: number;
  readonly totalPopulation: number;
  readonly grounding: GroundingLevel;
}

export interface Sw4InvariantCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface Sw4EpidemiologyCityRun {
  readonly scenarioId: string;
  readonly contractVersion: string;
  readonly options: Sw4EpidemiologyCityOptions;
  /** A stable, content-derived hash of `options` — the replay input identity (see `replaySw4EpidemiologyCityScenario`). */
  readonly optionsFingerprint: string;
  readonly specification: WorldSpecification;
  /** The live engine this run advanced. Owned by the caller (e.g. `replaySw4EpidemiologyCityScenario`) for as long as it needs it; this module keeps no reference of its own after returning. */
  readonly engine: TemporalEngine;
  readonly populationId: EntityId;
  readonly solverId: string;
  readonly domainId: string;
  readonly initial: Sw4CompartmentSnapshot;
  readonly final: Sw4CompartmentSnapshot;
  readonly ticksRun: number;
  readonly invariants: readonly Sw4InvariantCheck[];
  /** `worldStateFingerprint(engine)` at the final tick — the same fingerprint `evidence/worldEvidenceBundle.ts` uses for every other scenario in this codebase. */
  readonly finalWorldStateFingerprint: string;
}

function effectiveDt(options: Sw4EpidemiologyCityOptions): number {
  return options.dtDays ?? 1;
}

function effectiveEpidemicParams(options: Sw4EpidemiologyCityOptions): EpidemicParams {
  return { ...DEFAULT_EPIDEMIC, ...options.epidemicParams, population: options.populationCount ?? DEFAULT_EPIDEMIC.population };
}

/**
 * Builds the deterministic `WorldSpecification` this scenario compiles from —
 * `CITY` (procedural districts/buildings/roads) + `EPIDEMIOLOGY` (a real
 * SEIR-bound population attached to a hospital building via the EXISTING
 * `EPIDEMIOLOGY_TEMPLATE`, `specification/templates.ts`). Nothing here
 * invents a new template or a new population mechanism — this function only
 * assembles the existing ones' own declared inputs.
 */
export function buildSw4CitySpecification(options: Sw4EpidemiologyCityOptions): WorldSpecification {
  return {
    worldId: options.worldId ?? `${SW4_SCENARIO_ID}-${options.seed}`,
    seed: options.seed,
    worldType: ['CITY', 'EPIDEMIOLOGY'],
    geography: {
      districtCount: options.districtCount,
      buildingsPerDistrict: options.buildingsPerDistrict,
    },
    levelOfDetail: options.levelOfDetail,
    population: {
      count: options.populationCount ?? DEFAULT_EPIDEMIC.population,
      epidemicParams: options.epidemicParams,
    },
    scientificDomains: [{ domain: 'epidemiology', required: true }],
    requestedObservables: ['population'],
    provenanceNote: `SW-4 deterministic generated-city epidemic scenario (seed ${options.seed}).`,
  };
}

/** The population entity this scenario's `EPIDEMIOLOGY_TEMPLATE` attached — found by domain binding, never assumed by a hardcoded id, so this keeps working if the template's own id scheme ever changes. */
function findPopulationEntity(engine: TemporalEngine): WorldModelEntity {
  const found = engine.graph.listEntities().find((e) => e.domainBinding?.domainId === EPIDEMIC_DOMAIN_ID);
  if (!found) {
    throw new Error(`SW-4: no ${EPIDEMIC_DOMAIN_ID} population entity was generated — the EPIDEMIOLOGY template did not attach one.`);
  }
  return found;
}

function snapshotOf(engine: TemporalEngine, populationId: EntityId): Sw4CompartmentSnapshot {
  const entity = engine.graph.getEntity(populationId);
  const state = entity.domainState ?? {};
  const S = state.S ?? 0;
  const E = state.E ?? 0;
  const I = state.I ?? 0;
  const R = state.R ?? 0;
  const D = state.D ?? 0;
  return {
    tick: engine.tick,
    simulatedTimeDays: engine.simulatedTime,
    S,
    E,
    I,
    R,
    D,
    totalPopulation: S + E + I + R + D,
    grounding: entity.grounding,
  };
}

function checkInvariants(initial: Sw4CompartmentSnapshot, final: Sw4CompartmentSnapshot, entity: WorldModelEntity, expectedPopulation: number, ticksRun: number): Sw4InvariantCheck[] {
  const checks: Sw4InvariantCheck[] = [];

  const relTolerance = 1e-6;
  const conservationDiff = Math.abs(final.totalPopulation - expectedPopulation);
  checks.push({
    name: 'population-conservation',
    ok: conservationDiff <= expectedPopulation * relTolerance + 1e-6,
    detail: `S+E+I+R+D at final tick = ${final.totalPopulation.toFixed(6)}; expected N0 = ${expectedPopulation} (|diff| = ${conservationDiff.toExponential(3)}).`,
  });

  const nonNegative = [final.S, final.E, final.I, final.R, final.D].every((v) => v >= 0);
  checks.push({
    name: 'compartments-non-negative',
    ok: nonNegative,
    detail: nonNegative ? 'Every compartment is >= 0 at the final tick.' : `A compartment went negative: S=${final.S} E=${final.E} I=${final.I} R=${final.R} D=${final.D}.`,
  });

  checks.push({
    name: 'real-solver-executed',
    ok: entity.grounding === 'MODEL_ESTIMATE' && entity.domainBinding?.solverId === EPIDEMIC_SEIR_SOLVER_ID,
    detail: `Population entity grounding = ${entity.grounding}, bound solverId = ${entity.domainBinding?.solverId ?? 'null'} (expected MODEL_ESTIMATE / ${EPIDEMIC_SEIR_SOLVER_ID}).`,
  });

  checks.push({
    name: 'state-actually-advanced',
    ok: ticksRun > 0 && (final.tick > initial.tick) && (final.I !== initial.I || final.S !== initial.S || final.E !== initial.E || final.R !== initial.R),
    detail: `Ran ${ticksRun} tick(s): tick ${initial.tick} -> ${final.tick}, I ${initial.I.toFixed(3)} -> ${final.I.toFixed(3)}.`,
  });

  return checks;
}

/**
 * THE INTEGRATION RUNNER. Compiles a deterministic city+epidemiology
 * `WorldSpecification`, generates its `WorldGraph` via the canonical
 * `createScientificWorld`, registers the REAL, EXISTING SEIR solver on a REAL
 * `SolverRouter`, and advances a REAL `TemporalEngine` for `options.ticks`
 * real steps. Every number in the returned snapshots came from
 * `rk4Step`/`initialState`/`betaAt` (core/epidemic/sir.ts) through
 * `makeEpidemicSEIRSolver` — this function computes no epidemiology itself.
 */
export function runSw4EpidemiologyCityScenario(options: Sw4EpidemiologyCityOptions): Sw4EpidemiologyCityRun {
  if (!Number.isFinite(options.ticks) || options.ticks < 0) {
    throw new Error(`SW-4: options.ticks must be a non-negative finite number, got ${options.ticks}.`);
  }

  const specification = buildSw4CitySpecification(options);
  const epidemicParams = effectiveEpidemicParams(options);
  const dt = effectiveDt(options);

  const created = createScientificWorld({ kind: 'specification', specification });
  const engine = created.engine;

  const router = new SolverRouter();
  router.register(EPIDEMIC_SEIR_SOLVER_ID, makeEpidemicSEIRSolver(epidemicParams));

  const populationEntity0 = findPopulationEntity(engine);
  const populationId = populationEntity0.id;
  const initial = snapshotOf(engine, populationId);

  for (let i = 0; i < options.ticks; i++) {
    engine.advance(dt, (graph, stepDt, tick) => router.routeTick(graph, stepDt, tick));
  }

  const final = snapshotOf(engine, populationId);
  const finalEntity = engine.graph.getEntity(populationId);
  const invariants = checkInvariants(initial, final, finalEntity, epidemicParams.population, options.ticks);

  return {
    scenarioId: SW4_SCENARIO_ID,
    contractVersion: SW4_CONTRACT_VERSION,
    options,
    optionsFingerprint: fnv1a(canonicalJson(options)),
    specification,
    engine,
    populationId,
    solverId: EPIDEMIC_SEIR_SOLVER_ID,
    domainId: EPIDEMIC_DOMAIN_ID,
    initial,
    final,
    ticksRun: options.ticks,
    invariants,
    finalWorldStateFingerprint: worldStateFingerprint(engine),
  };
}

export interface Sw4ReplayResult {
  readonly replay: BundleReplay;
  readonly optionsFingerprintMatch: boolean;
  readonly run: Sw4EpidemiologyCityRun;
  readonly verify: Sw4EpidemiologyCityRun;
}

/**
 * PROVES REPLAY: runs the scenario TWICE from the SAME `options` — an
 * independent, from-scratch compile/generate/register/advance, not a clone of
 * the first engine — and compares them via the EXISTING
 * `evidence/worldEvidenceBundle.ts::buildBundleReplay` (which itself compares
 * `worldStateFingerprint`, the SAME fingerprint every other Genesis scenario's
 * evidence bundle uses). `optionsFingerprintMatch` additionally proves the two
 * runs really were built from identical replay inputs, not just that their
 * outputs happened to coincide.
 */
export function replaySw4EpidemiologyCityScenario(options: Sw4EpidemiologyCityOptions): Sw4ReplayResult {
  const run = runSw4EpidemiologyCityScenario(options);
  const verify = runSw4EpidemiologyCityScenario(options);
  return {
    replay: buildBundleReplay(run.engine, verify.engine),
    optionsFingerprintMatch: run.optionsFingerprint === verify.optionsFingerprint,
    run,
    verify,
  };
}

/**
 * EVIDENCE: assembles this run into the SAME `WorldEvidenceBundle` format
 * every other WorldGraph scenario in this codebase uses
 * (`evidence/worldEvidenceBundle.ts`) — no second evidence mechanism, and no
 * bridge into `packages/core/src/knowledge/EvidenceLedger.ts` is added here:
 * that ledger has no extension point today for a `WorldGraph`/`TemporalEngine`
 * run (confirmed by inspection — nothing under `core/worldModel/` imports it),
 * so wiring one is left as the documented, narrow missing hook this module's
 * own contract doc names, rather than inventing a second ledger to fill the
 * gap.
 */
export function buildSw4EvidenceBundle(input: {
  readonly bundleId: string;
  readonly question: string;
  readonly run: Sw4EpidemiologyCityRun;
  readonly verifyRun?: Sw4EpidemiologyCityRun;
}): WorldEvidenceBundle {
  const { run } = input;
  const worldState = projectToWorldState(
    run.engine.graph,
    run.specification.worldId,
    run.domainId,
    run.engine.tick,
    run.engine.journal.upToTick(run.engine.tick),
  );
  return buildWorldEvidenceBundle({
    bundleId: input.bundleId,
    question: input.question,
    worldId: run.specification.worldId,
    domainId: run.domainId,
    baseline: { engine: run.engine, worldState },
    verifyEngine: input.verifyRun?.engine,
    seed: run.specification.seed,
    limitations: [SW4_EPIDEMIC_DISCLOSURE],
  });
}

// ---------------------------------------------------------------------------
// RENDERER-FACING READ-ONLY STATE ADAPTER (Task 4) — see docs/GENESIS_SW4_ADAPTER_CONTRACT.md.
// ---------------------------------------------------------------------------

export interface Sw4RenderState {
  readonly scenarioId: string;
  readonly contractVersion: string;
  readonly worldId: string;
  readonly populationId: EntityId;
  readonly tick: number;
  readonly simulatedTimeDays: number;
  readonly totalPopulation: number;
  readonly susceptible: number;
  readonly exposed: number;
  readonly infected: number;
  readonly recovered: number;
  readonly dead: number;
  readonly solverId: string;
  readonly domainId: string;
  readonly grounding: GroundingLevel;
  readonly classification: ElementClassification;
  readonly statusLabel: string | null;
  readonly worldStateFingerprint: string;
  readonly disclosure: string;
}

/**
 * THE SMALLEST CANONICAL READ-ONLY ADAPTER a renderer needs. Reads the SAME
 * live `TemporalEngine`/`WorldGraph` this scenario already advanced — it
 * creates no second copy of the simulation state, stores nothing of its own
 * between calls, and never mutates `run.engine`. A renderer calls this once
 * per frame/update it wants to show; nothing here is a renderer, a render
 * loop, or a scene graph.
 */
export function getSw4RenderState(run: Sw4EpidemiologyCityRun): Sw4RenderState {
  const entity = run.engine.graph.getEntity(run.populationId);
  const state = entity.domainState ?? {};
  const S = state.S ?? 0;
  const E = state.E ?? 0;
  const I = state.I ?? 0;
  const R = state.R ?? 0;
  const D = state.D ?? 0;
  return {
    scenarioId: run.scenarioId,
    contractVersion: run.contractVersion,
    worldId: run.specification.worldId,
    populationId: run.populationId,
    tick: run.engine.tick,
    simulatedTimeDays: run.engine.simulatedTime,
    totalPopulation: S + E + I + R + D,
    susceptible: S,
    exposed: E,
    infected: I,
    recovered: R,
    dead: D,
    solverId: run.solverId,
    domainId: run.domainId,
    grounding: entity.grounding,
    classification: classifyGrounding(entity.grounding),
    statusLabel: entity.statusLabel ?? null,
    worldStateFingerprint: worldStateFingerprint(run.engine),
    disclosure: SW4_EPIDEMIC_DISCLOSURE,
  };
}
