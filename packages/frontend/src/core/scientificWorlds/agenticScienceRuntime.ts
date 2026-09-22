import { sha256HexSync } from '@genesis/core/knowledge/sha256.js';
import { buildTruthResponse, type TruthResponse } from '@genesis/core/knowledge/truthResponse.js';
import type { Observation } from '@genesis/core/cognitive/index.js';
import { SessionEventLog, replaySessionEvents, type FlagshipEvent, type FlagshipSessionState } from '@genesis/core/flagship/sessionEventLog.js';
import { guardWorldMode, type FlagshipEpistemicStatus, type FlagshipMode } from '@genesis/core/flagship/epistemicGuard.js';
import { createMirrorSession, mirrorTransition, type MirrorTwinSession } from '@genesis/core/flagship/mirrorTwin.js';
import { createPortal, openAndTraverse, type PortalSnapshot } from '@genesis/core/flagship/portal.js';
import { configureTimeMachine, type TimeMachineScenario } from '@genesis/core/flagship/timeMachine.js';
import { ingestCosmosObservation, type CosmosObservationInput, type CosmosUpdateResult } from '@genesis/core/flagship/cosmosObserver.js';
import { createCaptureSpec, type CaptureAspect, type CaptureSpec } from '@genesis/core/flagship/capturePreset.js';
import { createHypothesis, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import { canonicalJson, fnv1a } from '../events/hash';
import { AgentController } from './agentController';
import { planActions, type ActionPlan } from './actionPlanner';
import { worldEntitiesOf, type CognitiveWorldBinding, type ScientificWorldsCognitiveCore } from './cognitiveBridge';
import { replayExperimentSession, type ExperimentSession } from './experimentSession';
import { narrateSession } from './narration';
import type { WorldCommand } from './worldCommand';
import type { AgentControllerOptions } from './agentController';

/**
 * AGENTIC SCIENCE RUNTIME (D-130) — the delivered "Agentic Science World OS"
 * loop on the canonical services, no reference doubles:
 *
 *   PERCEPTION      the world's scene graph (stations, twin atlas) — a MODEL of a virtual world, not vision
 *   WORLD MODEL     the cognitive core's WorldModel (bridge.attach)
 *   REASONING       a hypothesis pair from beliefRevision on the scenario's decisive observable
 *   PLAN            planActions over typed WorldCommands (the same planner as the command bar)
 *   ACTION          AgentController stepped headless (walk, reach, execute, observe, report)
 *   EXPERIMENT      ONE ExperimentSession through the kernel provider at the station
 *   FALSIFICATION   each hypothesis against the sealed output, log-odds belief revision
 *   EVIDENCE        the session's ledger hashes (committed by the runner; ids resolved from the ledger)
 *   MEMORY          core.ingestObservation (working + long-term memory)
 *   ANSWER          buildTruthResponse over the ledger — status, evidence, contradictions, unknowns, next tests
 *   CAPTURE         a capture SPEC with captions and the epistemic badge
 *   REPLAY          the hash-chained session log folded back to state; the session replayed MATCH
 *
 * Every experiment needs a named human approver (the same gate as every proposal in the bridge). The
 * flagship journey adds the mirror twin, the circular gate, the time machine and a cosmos observation
 * as labelled state on the same log. Nothing here is a claim about the world: the physics scenario
 * compares two models and says so.
 */

export interface PerceptionFrame { readonly kind: 'SCENE_GRAPH'; readonly summary: string; readonly entities: readonly { readonly id: string; readonly label: string; readonly confidence: 1 }[]; readonly provenance: readonly { readonly sourceId: string; readonly sourceType: 'MODEL' }[]; readonly epistemicStatus: 'MODEL'; }
export interface ReasoningResult { readonly interpretation: string; readonly assumptions: readonly string[]; readonly hypotheses: readonly Hypothesis[]; readonly selectedHypothesisId: string; readonly epistemicStatus: 'HYPOTHESIS'; }
export interface FalsificationResult { readonly status: 'SURVIVED' | 'FALSIFIED' | 'INCONCLUSIVE'; readonly rationale: string; readonly competingPrediction: string; readonly revised: readonly Hypothesis[]; }
export interface AgenticTrace {
  readonly sessionId: string; readonly mode: FlagshipMode; readonly perception: PerceptionFrame; readonly worldModelSummary: string; readonly reasoning: ReasoningResult; readonly plan: { readonly planId: string; readonly steps: readonly string[] };
  readonly actionsExecuted: readonly string[]; readonly session: ExperimentSession; readonly falsification: FalsificationResult; readonly evidenceIds: readonly string[]; readonly answer: TruthResponse; readonly finalAnswer: { readonly text: string; readonly status: FlagshipEpistemicStatus; readonly evidenceIds: readonly string[] }; readonly replayKey: string;
}

export interface AgenticRunInput {
  readonly sessionId: string; readonly binding: CognitiveWorldBinding; readonly bridge: ScientificWorldsCognitiveCore; readonly room: AgentControllerOptions['room']; readonly obstacles: AgentControllerOptions['obstacles']; readonly spawn: AgentControllerOptions['start'];
  readonly userGoal: string; readonly mode: FlagshipMode; readonly approvedBy: string | null; readonly log: SessionEventLog; readonly maxFrames?: number;
}

/** The scenario's decisive observable: in a weak field the Shapiro delay is positive for M > 0 and exactly zero in the flat baseline. */
export function spacetimeHypotheses(prefix: string): readonly Hypothesis[] {
  return [
    createHypothesis(`${prefix}:H-curved`, { metric: 'shapiroDelayS', relation: 'greater-than', expectedValue: 0, rationale: 'curved spacetime (weak field): the photon arrives later than the flat baseline' }, 0.5),
    createHypothesis(`${prefix}:H-flat`, { metric: 'shapiroDelayS', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: 1e-12, rationale: 'flat baseline: no delay beyond geometry' }, 0.5),
  ];
}

export async function runAgenticScience(input: AgenticRunInput): Promise<AgenticTrace> {
  const { binding, bridge, log, sessionId } = input;
  const guard = guardWorldMode(input.mode, 'MODEL');
  const world = worldEntitiesOf(binding);
  const perception: PerceptionFrame = { kind: 'SCENE_GRAPH', summary: `${world.entities.length} entities in ${binding.worldId}`, entities: world.entities.map((e) => ({ id: e.id, label: e.label, confidence: 1 as const })), provenance: [{ sourceId: binding.worldId, sourceType: 'MODEL' }], epistemicStatus: 'MODEL' };
  log.append(sessionId, 'PERCEPTION_OBSERVED', perception);
  await bridge.attach();
  const worldModelSummary = bridge.core.world.summarize();
  log.append(sessionId, 'WORLD_MODEL_UPDATED', { summary: worldModelSummary, entities: bridge.core.world.allEntities().length });
  const hypotheses = spacetimeHypotheses(sessionId);
  const reasoning: ReasoningResult = { interpretation: 'The goal asks whether curvature changes light propagation relative to a flat baseline; the observation window runs the weak-field photon model.', assumptions: ['weak field (b ≫ r_s)', 'first-order Shapiro delay and deflection', 'c is the SI-defined constant'], hypotheses, selectedHypothesisId: hypotheses[0].id, epistemicStatus: 'HYPOTHESIS' };
  log.append(sessionId, 'REASONING_COMPLETED', { ...reasoning, hypotheses: hypotheses.map((h) => ({ id: h.id, criterion: h.criterion, confidence: h.confidence })) });
  const station = binding.stations.find((s) => s.experimentId === 'spacetime-photon');
  if (!station) throw new Error('NO_STATION_RUNS_SPACETIME_PHOTON');
  const lt = 1;
  const cid = (i: number): string => `cmd-${fnv1a(`${sessionId}|${input.userGoal}|agentic|${i}`)}`;
  const commands: WorldCommand[] = [
    { commandId: cid(0), text: input.userGoal, intent: 'NAVIGATE', targetEntityId: station.id, requestedAtLogicalTime: lt },
    { commandId: cid(1), text: input.userGoal, intent: 'RUN_EXPERIMENT', targetEntityId: station.id, parameters: { massKg: 1.989e30, impactParameterM: 6.957e8 }, requestedAtLogicalTime: lt },
    { commandId: cid(2), text: input.userGoal, intent: 'INSPECT', parameters: { provenance: true, result: true }, requestedAtLogicalTime: lt },
  ];
  const plan: ActionPlan = planActions(commands, binding.catalog, null);
  log.append(sessionId, 'PLAN_CREATED', { planId: plan.planId, steps: plan.steps.map((s) => s.kind), rejected: plan.rejected });
  if (!input.approvedBy) throw new Error(`ACTION_REQUIRES_HUMAN_REVIEW:${plan.planId}`);
  bridge.approvals.grant(plan.planId, input.approvedBy);
  const controller = new AgentController({ room: input.room, obstacles: input.obstacles, stations: binding.stations, start: input.spawn, runner: binding.runner, worldId: binding.worldId, defaultSeed: binding.defaultSeed ?? 7 });
  const started = controller.startPlan(plan);
  if (!started.ok) throw new Error(`PLAN_REFUSED:${started.reason}`);
  const actionsExecuted: string[] = []; let session: ExperimentSession | null = null; let report = false; let lastStep: string | null = null;
  for (let i = 0; i < (input.maxFrames ?? 60000) && !report; i++) {
    const u = controller.update(1 / 30);
    if (u.stepKind && u.stepKind !== lastStep) { actionsExecuted.push(u.stepKind); lastStep = u.stepKind; }
    if (u.sessionSealed) { session = u.sessionSealed.session; log.append(sessionId, 'EXPERIMENT_EXECUTED', { sessionId: session.sessionId, experimentId: session.experimentId, stationId: session.stationId, contentHash: session.contentHash, replayFingerprint: session.replayFingerprint, epistemicStatus: session.epistemicStatus, outputs: session.outputs }); }
    if (u.report) report = true;
  }
  if (!session) throw new Error('AGENT_DID_NOT_SEAL_A_SESSION');
  log.append(sessionId, 'ACTION_EXECUTED', { planId: plan.planId, steps: actionsExecuted, final: controller.state });
  const delay = session.outputs.shapiroDelayS;
  const observed = typeof delay === 'number' ? delay : NaN;
  const curvedSurvives = Number.isFinite(observed) && observed > 0; const flatSurvives = Number.isFinite(observed) && Math.abs(observed) <= 1e-12;
  const revised = hypotheses.map((h, i) => updateConfidence(h, (h.id.endsWith('H-curved') ? curvedSurvives : flatSurvives) ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL', 1, `spacetime-photon ${session!.sessionId}: shapiroDelayS=${observed}`, i));
  const falsification: FalsificationResult = { status: !Number.isFinite(observed) ? 'INCONCLUSIVE' : curvedSurvives ? 'SURVIVED' : 'FALSIFIED', rationale: !Number.isFinite(observed) ? 'no delay output' : curvedSurvives ? `the model's delay ${observed} s is positive: the curved-spacetime hypothesis survives; the flat-baseline hypothesis is falsified within the protocol` : `the model's delay is ${observed} s: the curved-spacetime hypothesis is falsified within the protocol`, competingPrediction: 'a coordinate-only effect would leave the invariant arrival-time comparison unchanged under the same protocol', revised };
  log.append(sessionId, 'FALSIFICATION_COMPLETED', { status: falsification.status, rationale: falsification.rationale, revised: revised.map((h) => ({ id: h.id, confidence: h.confidence, status: h.status })) });
  const active = binding.ledger.getActive();
  const evidenceIds = active.filter((r) => session!.evidenceHashes.includes(r.contentHash)).map((r) => r.id);
  for (const id of evidenceIds) log.append(sessionId, 'EVIDENCE_APPENDED', { id, sessionId: session.sessionId });
  await bridge.core.ingestObservation({ id: `obs:${session.sessionId}:shapiroDelayS`, timestamp: lt, subject: 'shapiroDelayS', predicate: 'spacetime-photon:shapiroDelayS', value: Number.isFinite(observed) ? observed : 'n/a', source: 'EXPERIMENT', epistemicStatus: 'MODEL', evidenceRefs: [session.contentHash, ...session.evidenceHashes] } satisfies Observation);
  const answer = buildTruthResponse(binding.ledger, `spacetime photon shapiroDelayS deflectionArcsec model`);
  const headline = narrateSession(session, { level: 'EXPLORER', lang: 'pl', includeProvenance: true }).map((l) => l.text).join(' ');
  const finalStatus: FlagshipEpistemicStatus = input.mode === 'FICTIONAL' ? 'FICTIONAL' : falsification.status === 'FALSIFIED' ? 'FALSIFIED' : guard.status;
  const finalAnswer = { text: `${headline} Wynik dotyczy porównania dwóch modeli, nie pomiaru świata.`, status: finalStatus, evidenceIds };
  log.append(sessionId, 'TRUTH_ANSWERED', { status: answer.status, fingerprint: answer.fingerprint, evidence: answer.evidence.length, contradictions: answer.contradictions.length, nextTests: answer.nextTests.length, finalStatus });
  const withoutKey = { sessionId, mode: input.mode, perception, worldModelSummary, reasoning, plan: { planId: plan.planId, steps: plan.steps.map((s) => s.kind) }, actionsExecuted, session, falsification, evidenceIds, answer, finalAnswer };
  const replayKey = sha256HexSync(canonicalJson({ ...withoutKey, answer: answer.fingerprint }));
  const trace: AgenticTrace = { ...withoutKey, replayKey };
  log.append(sessionId, 'AGENTIC_TRACE_COMMITTED', { replayKey, sessionContentHash: session.contentHash, finalStatus, evidenceIds });
  return trace;
}

/** A deterministic clock for the session log: logical ticks, so two journeys hash alike. */
export function logicalClock(): { now(): number } { let t = 0; return { now: () => ++t }; }

export interface FlagshipJourneyInput extends Omit<AgenticRunInput, 'log'> { readonly log?: SessionEventLog; readonly clock?: { now(): number }; readonly cosmos?: CosmosObservationInput; readonly captureAspect?: CaptureAspect; }
export interface FlagshipJourneyResult {
  readonly trace: AgenticTrace; readonly mirror: MirrorTwinSession; readonly portal: PortalSnapshot; readonly timeMachine: TimeMachineScenario; readonly cosmos: CosmosUpdateResult | null; readonly capture: CaptureSpec;
  readonly events: readonly FlagshipEvent[]; readonly state: FlagshipSessionState; readonly replayed: FlagshipSessionState; readonly replayMatches: boolean; readonly sessionReplay: 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE';
}

/** The flagship journey: session → world → mirror twin (sync, diverge) → circular gate → time machine (scientific) → cosmos observation → the agentic loop → capture → replay equality. */
export async function runFlagshipJourney(input: FlagshipJourneyInput): Promise<FlagshipJourneyResult> {
  const clock = input.clock ?? logicalClock();
  const log = input.log ?? new SessionEventLog(clock);
  const { sessionId, binding } = input;
  log.append(sessionId, 'SESSION_STARTED', { sessionId, mode: input.mode });
  log.append(sessionId, 'WORLD_CREATED', { worldId: binding.worldId, mode: input.mode, stations: binding.stations.map((s) => s.id), epistemicStatus: guardWorldMode(input.mode, 'MODEL').status });
  let mirror = createMirrorSession(sessionId, 'human-explorer');
  for (const e of [{ type: 'ENTER_ZONE' } as const, { type: 'CONSENT_GRANTED' } as const, { type: 'TELEMETRY', payload: { consent: true, containsRawImage: false as const, mode: 'SYNTHETIC_FALLBACK' as const, confidence: 0.8, sentAt: 0, ttlMs: 10_000 } } as const, { type: 'SYNC_TICK', progress: 0.5 } as const, { type: 'SYNC_TICK', progress: 1 } as const, { type: 'DIVERGE', action: 'Twin walks to the gate while the subject raises the left hand' } as const]) mirror = mirrorTransition(mirror, e, 1);
  log.append(sessionId, 'MIRROR_STATE', mirror);
  const portal = openAndTraverse(createPortal({ sessionId, style: 'CIRCULAR_GATE', sourceWorldId: binding.worldId, destinationWorldId: `${binding.worldId}#cosmic-lab`, destinationMode: input.mode, requestedDestinationStatus: 'MODEL', tunnelMode: 'CONCEPTUAL_PHYSICS_MODEL', massKgForVisual: 1.989e30 }));
  log.append(sessionId, 'PORTAL_STATE', portal);
  const timeMachine = configureTimeMachine({ sessionId, mode: 'SCIENTIFIC_MODEL', targetTimeLabel: 'reference proper-time comparison', assumptions: ['weak-field reference only', 'deterministic'], request: { kind: 'CLOCK_COMPARISON', relativeSpeedMps: 7660, gravitationalMassKg: 5.972e24, radiusM: 6.771e6, referenceRadiusM: 6.371e6, coordinateSeconds: 86400 } });
  log.append(sessionId, 'TIME_MACHINE_CONFIGURED', timeMachine);
  let cosmos: CosmosUpdateResult | null = null;
  if (input.cosmos) { cosmos = ingestCosmosObservation(binding.ledger, input.cosmos); log.append(sessionId, 'COSMOS_UPDATED', cosmos); }
  const trace = await runAgenticScience({ ...input, log });
  const capture = createCaptureSpec({ sessionId, title: 'Curved spacetime vs flat baseline', aspect: input.captureAspect ?? '9:16', captions: [{ atS: 0, text: 'Mirror twin diverges' }, { atS: 3, text: 'Circular gate traversal' }, { atS: 6, text: trace.finalAnswer.text.slice(0, 120) }], status: trace.finalAnswer.status, replayKey: trace.replayKey });
  log.append(sessionId, 'CAPTURE_CREATED', { captureId: capture.captureId, aspect: capture.aspect, badge: capture.badge, fingerprint: capture.fingerprint });
  const events = log.read(sessionId);
  const state = replaySessionEvents(events); const replayed = replaySessionEvents(SessionEventLog.fromEvents(clock, events).read(sessionId));
  const sessionReplay = replayExperimentSession(trace.session, binding.runner).status;
  return { trace, mirror, portal, timeMachine, cosmos, capture, events, state, replayed, replayMatches: canonicalJson(state) === canonicalJson(replayed), sessionReplay };
}
