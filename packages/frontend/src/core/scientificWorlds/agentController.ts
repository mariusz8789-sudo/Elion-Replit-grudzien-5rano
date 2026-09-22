import type { Obstacle, RoomBounds, Vec2 } from '../three/firstPersonController';
import type { ActionPlan, ActionStep } from './actionPlanner';
import { INITIAL_AGENT_CONTEXT, transitionAgent, type AgentActionContext, type AgentActionEvent, type AgentActionState } from './agentActionMachine';
import type { ExperimentRunner, ExperimentSession, SessionWithArtifact } from './experimentSession';
import { createExperimentSession } from './experimentSession';
import { approachPoint, planPath, type NavigationPlan } from './navigationPlanner';
import type { LabStation } from './labWorld';

/**
 * SCIENTIFIC WORLDS — THE AUTONOMOUS CHARACTER CONTROLLER (pure).
 *
 * Executes an ActionPlan step by step: walks the navigation plan at a human
 * pace, turns to face the console, reaches, interacts, EXECUTES the
 * experiment exactly once (as an ExperimentSession, through the runner),
 * observes and reports. No THREE, no timers: `update(dt)` is the only clock,
 * so a test can drive the whole plan deterministically and the renderer
 * only reads the pose. Timings are fixed durations, never random.
 */

export interface AgentPose {
  readonly position: Vec2;
  /** Yaw in radians around Y (0 = looking down +Z, matching the rig's facing). */
  readonly facing: number;
  /** Increasing while walking; drives the rig's slide-free walk cycle. */
  readonly gait: number;
  /** 0..1 normalised walking speed. */
  readonly speed: number;
  /** 0..1 how far the right arm is extended toward the console. */
  readonly reach: number;
  /** Head pitch in radians (down is positive) — the operator looks at the console when working. */
  readonly headPitch: number;
}

export interface AgentReport {
  readonly planId: string;
  readonly session: ExperimentSession | null;
  readonly includeProvenance: boolean;
  readonly includeResult: boolean;
  readonly deferred: readonly Extract<ActionStep, { kind: 'DEFER' }>[];
  readonly rejected: ActionPlan['rejected'];
}

export interface AgentControllerOptions {
  readonly room: RoomBounds;
  readonly obstacles: readonly Obstacle[];
  readonly stations: readonly LabStation[];
  readonly start: { readonly position: Vec2; readonly facing: number };
  readonly runner: ExperimentRunner;
  readonly worldId: string;
  readonly walkSpeed?: number;
  readonly turnSpeed?: number;
  readonly reachSeconds?: number;
  readonly interactSeconds?: number;
  readonly observeSeconds?: number;
  readonly reportSeconds?: number;
  /** Seed for every experiment this agent runs, unless the command carries its own. */
  readonly defaultSeed?: number;
}

export interface AgentUpdate {
  readonly state: AgentActionState;
  readonly stepIndex: number;
  readonly stepKind: ActionStep['kind'] | null;
  readonly stationId: string | null;
  /** Emitted once, on the frame the report is produced. */
  readonly report: AgentReport | null;
  /** Emitted once, on the frame the session is sealed. */
  readonly sessionSealed: SessionWithArtifact | null;
  readonly blockedReason: string | null;
  readonly progress: number;
  /** Emitted once, on the frame an INTERACT step completes: what the hands did at which console (e.g. an anatomy view change). */
  readonly interaction: { readonly stationId: string; readonly parameters: Readonly<Record<string, string | number | boolean>> } | null;
}

export interface AgentTimingDiagnostics {
  readonly updateCount: number;
  readonly simulationSeconds: number;
  readonly lastDeltaSeconds: number;
  readonly state: AgentActionState;
  readonly stepIndex: number;
  readonly stepKind: ActionStep['kind'] | null;
  readonly targetId: string | null;
  readonly stationId: string | null;
  readonly progress: number;
  readonly timerSeconds: number;
  readonly remainingWaypoints: number;
  readonly blockedReason: string | null;
  readonly transitionCondition: string;
}

const TWO_PI = Math.PI * 2;
const wrap = (a: number): number => ((a + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;

export class AgentController {
  private context: AgentActionContext = INITIAL_AGENT_CONTEXT;
  private plan: ActionPlan | null = null;
  private stepIndex = -1;
  private position: Vec2;
  private facing: number;
  private gait = 0;
  private speed = 0;
  private reach = 0;
  private headPitch = 0;
  private waypoints: Vec2[] = [];
  private nav: NavigationPlan | null = null;
  private timer = 0;
  private targetFacing = 0;
  private currentStationId: string | null = null;
  private sealed: SessionWithArtifact | null = null;
  private lastSession: ExperimentSession | null = null;
  private logicalTime = 0;
  private readonly walkSpeed: number;
  private readonly turnSpeed: number;
  private readonly reachSeconds: number;
  private readonly interactSeconds: number;
  private readonly observeSeconds: number;
  private readonly reportSeconds: number;
  private updateCount = 0;
  private simulationSeconds = 0;
  private lastDeltaSeconds = 0;
  private lastProgress = 0;

  constructor(private readonly options: AgentControllerOptions) {
    this.position = { ...options.start.position };
    this.facing = options.start.facing;
    this.targetFacing = options.start.facing;
    this.walkSpeed = options.walkSpeed ?? 1.35;
    this.turnSpeed = options.turnSpeed ?? 3.2;
    this.reachSeconds = options.reachSeconds ?? 0.9;
    this.interactSeconds = options.interactSeconds ?? 0.8;
    this.observeSeconds = options.observeSeconds ?? 1.4;
    this.reportSeconds = options.reportSeconds ?? 0.6;
  }

  get state(): AgentActionState { return this.context.state; }
  get pose(): AgentPose { return { position: { ...this.position }, facing: this.facing, gait: this.gait, speed: this.speed, reach: this.reach, headPitch: this.headPitch }; }
  get activePlan(): ActionPlan | null { return this.plan; }
  get station(): string | null { return this.currentStationId; }
  get session(): ExperimentSession | null { return this.lastSession; }
  get navigation(): NavigationPlan | null { return this.nav; }

  getDiagnostics(): AgentTimingDiagnostics {
    const kind = this.currentStep()?.kind ?? null;
    const condition = kind === 'NAVIGATE' ? 'remainingWaypoints = 0' : kind === 'ALIGN' ? '|targetFacing - facing| < 0.03 rad'
      : kind === 'REACH' ? `timer >= ${this.reachSeconds}s` : kind === 'INTERACT' ? `timer >= ${this.interactSeconds}s`
      : kind === 'OBSERVE' ? `timer >= ${this.observeSeconds}s` : kind === 'REPORT' ? `timer >= ${this.reportSeconds}s`
      : kind === 'EXECUTE' ? 'sealed session announced on next update' : 'no timed transition';
    return { updateCount: this.updateCount, simulationSeconds: this.simulationSeconds, lastDeltaSeconds: this.lastDeltaSeconds,
      state: this.context.state, stepIndex: this.stepIndex, stepKind: kind, targetId: this.context.targetId, stationId: this.currentStationId,
      progress: this.lastProgress, timerSeconds: this.timer, remainingWaypoints: this.waypoints.length, blockedReason: this.context.blockedReason, transitionCondition: condition };
  }

  /** Accepts a plan only when idle (or between plans); returns the refusal otherwise. */
  startPlan(plan: ActionPlan): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
    if (this.context.state !== 'IDLE' && this.context.state !== 'BLOCKED' && this.context.state !== 'ARRIVED') return { ok: false, reason: `agent is ${this.context.state}` };
    if (plan.steps.length === 0) return { ok: false, reason: plan.rejected[0]?.reason ?? 'plan has no steps' };
    this.context = INITIAL_AGENT_CONTEXT;
    this.plan = plan;
    this.stepIndex = -1;
    this.sealed = null;
    this.advanceStep();
    return { ok: true };
  }

  reset(): void {
    this.context = INITIAL_AGENT_CONTEXT; this.plan = null; this.stepIndex = -1; this.waypoints = []; this.nav = null; this.timer = 0; this.reach = 0; this.speed = 0; this.headPitch = 0;
  }

  private apply(event: AgentActionEvent): void {
    const r = transitionAgent(this.context, event);
    this.context = r.context;
    if (!r.ok) { this.context = transitionAgent(this.context, { type: 'BLOCKED', reason: r.reason }).context; }
  }

  private currentStep(): ActionStep | null {
    if (!this.plan) return null;
    return this.plan.steps[this.stepIndex] ?? null;
  }

  private stationFor(step: ActionStep): LabStation | null {
    if (!('stationId' in step)) return null;
    return this.options.stations.find((s) => s.id === step.stationId) ?? null;
  }

  /** Moves to the next step and primes the state machine for it. */
  private advanceStep(): void {
    this.stepIndex++;
    this.timer = 0;
    const step = this.currentStep();
    // A view-only interaction ends with the hands back at the console (ARRIVED), so the next step can align, walk or report.
    if (this.context.state === 'INTERACTING' && (!step || step.kind !== 'EXECUTE')) this.apply({ type: 'INTERACTION_SETTLED' });
    // An observation followed by more work (another station, another run) closes as observed-and-noted; the body may leave the console.
    if (this.context.state === 'OBSERVING' && step && step.kind !== 'REPORT' && step.kind !== 'OBSERVE') this.apply({ type: 'OBSERVATION_DONE' });
    if (!step) { if (this.context.state === 'REPORTING') this.apply({ type: 'REPORT_DONE' }); else if (this.context.state === 'ARRIVED') this.apply({ type: 'RESET' }); this.plan = null; return; }
    switch (step.kind) {
      case 'NAVIGATE': {
        const station = this.stationFor(step);
        if (!station) { this.apply({ type: 'BLOCKED', reason: `unknown station ${step.stationId}` }); return; }
        const goal = approachPoint(station.position, station.facing, station.standoff);
        const nav = planPath(this.position, goal, this.options.room, this.options.obstacles);
        this.nav = nav;
        if (!nav.reachable) { this.apply({ type: 'BLOCKED', reason: `no path to ${station.label}: ${nav.reason ?? 'unreachable'}` }); return; }
        this.waypoints = [...nav.waypoints];
        this.apply({ type: 'PLAN_STARTED', targetId: station.id });
        this.currentStationId = null;
        break;
      }
      case 'ALIGN': {
        const station = this.stationFor(step);
        if (!station) { this.apply({ type: 'BLOCKED', reason: `unknown station ${step.stationId}` }); return; }
        // The operator faces the console: opposite of the station's own facing.
        this.targetFacing = wrap(station.facing + Math.PI);
        // An observed run can be followed by another run at this same station.
        // No NAVIGATE step exists to leave REPORTING, so settle the completed
        // observation before starting the next alignment through the normal events.
        if (this.context.state === 'REPORTING') this.apply({ type: 'REPORT_DONE' });
        if (this.context.state === 'IDLE') this.apply({ type: 'PLAN_STARTED', targetId: station.id });
        if (this.context.state === 'MOVING_TO_TARGET') this.apply({ type: 'WAYPOINT_REACHED', remaining: 0 });
        this.apply({ type: 'ALIGN_STARTED' });
        break;
      }
      case 'REACH': this.apply({ type: 'ALIGNED' }); break;
      case 'INTERACT': this.apply({ type: 'REACHED' }); break;
      case 'EXECUTE': {
        this.apply({ type: 'INTERACTION_DONE' });
        if (this.context.state !== 'EXECUTING') return;
        const seed = typeof step.inputs.seed === 'number' ? step.inputs.seed : (this.options.defaultSeed ?? 7);
        const { seed: _omit, ...inputs } = step.inputs;
        void _omit;
        try {
          this.logicalTime++;
          const sealed = createExperimentSession({ worldId: this.options.worldId, stationId: step.stationId, experimentId: step.experimentId, seed, inputs, logicalTime: this.logicalTime }, this.options.runner);
          this.sealed = sealed;
          this.lastSession = sealed.session;
          this.apply({ type: 'EXECUTION_DONE', sessionId: sealed.session.sessionId });
        } catch (e) {
          this.lastSession = null;
          this.apply({ type: 'BLOCKED', reason: e instanceof Error ? e.message : String(e) });
        }
        break;
      }
      case 'OBSERVE': if (this.context.state === 'EXECUTING') this.apply({ type: 'EXECUTION_DONE', sessionId: this.lastSession?.sessionId ?? 'none' }); break;
      case 'REPORT': if (this.context.state === 'OBSERVING') this.apply({ type: 'OBSERVATION_DONE' }); else if (this.context.state === 'IDLE' || this.context.state === 'ARRIVED') { /* report-only plan: no body work */ } break;
      case 'DEFER': break;
    }
  }

  update(dt: number): AgentUpdate {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.updateCount++;
    this.simulationSeconds += dt;
    this.lastDeltaSeconds = dt;
    const step = this.currentStep();
    let report: AgentReport | null = null;
    let sessionSealed: SessionWithArtifact | null = null;
    let interaction: AgentUpdate['interaction'] = null;
    const s = this.context.state;
    // Pose easing that is independent of the step: arm and head follow the state.
    const wantReach = s === 'REACHING' || s === 'INTERACTING' || s === 'EXECUTING' ? 1 : s === 'OBSERVING' ? 0.35 : 0;
    this.reach += (wantReach - this.reach) * Math.min(1, dt * 4);
    const wantPitch = s === 'REACHING' || s === 'INTERACTING' || s === 'EXECUTING' ? 0.52 : s === 'OBSERVING' ? 0.34 : 0;
    this.headPitch += (wantPitch - this.headPitch) * Math.min(1, dt * 3);
    let progress = 0;
    if (step && this.plan) {
      switch (step.kind) {
        case 'NAVIGATE': {
          if (s === 'MOVING_TO_TARGET' && this.waypoints.length) {
            const w = this.waypoints[0];
            const dx = w.x - this.position.x; const dz = w.z - this.position.z;
            const dist = Math.hypot(dx, dz);
            const desired = Math.atan2(dx, dz);
            this.facing = wrap(this.facing + wrap(desired - this.facing) * Math.min(1, dt * this.turnSpeed));
            const stepLen = Math.min(dist, this.walkSpeed * dt);
            if (dist > 1e-6) { this.position = { x: this.position.x + (dx / dist) * stepLen, z: this.position.z + (dz / dist) * stepLen }; }
            this.speed = 1; this.gait += dt * 2.0;
            if (dist <= this.walkSpeed * dt + 1e-3) {
              this.position = { ...w };
              this.waypoints.shift();
              this.apply({ type: 'WAYPOINT_REACHED', remaining: this.waypoints.length });
              if (this.waypoints.length === 0) { this.speed = 0; this.currentStationId = step.stationId; this.advanceStep(); }
            }
            const total = this.nav?.lengthM ?? 1;
            const remaining = this.waypoints.reduce((acc, p, i) => { const prev = i === 0 ? this.position : this.waypoints[i - 1]; return acc + Math.hypot(p.x - prev.x, p.z - prev.z); }, 0);
            progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 1;
          } else if (s !== 'MOVING_TO_TARGET') { this.speed = 0; }
          break;
        }
        case 'ALIGN': {
          this.speed = 0;
          const delta = wrap(this.targetFacing - this.facing);
          this.facing = wrap(this.facing + delta * Math.min(1, dt * this.turnSpeed));
          progress = 1 - Math.min(1, Math.abs(delta) / Math.PI);
          if (Math.abs(delta) < 0.03) { this.facing = this.targetFacing; this.currentStationId = step.stationId; this.advanceStep(); }
          break;
        }
        case 'REACH': this.timer += dt; progress = Math.min(1, this.timer / this.reachSeconds); if (this.timer >= this.reachSeconds) this.advanceStep(); break;
        case 'INTERACT': {
          this.timer += dt; progress = Math.min(1, this.timer / this.interactSeconds);
          if (this.timer >= this.interactSeconds) { interaction = { stationId: step.stationId, parameters: step.parameters ?? {} }; this.advanceStep(); }
          break;
        }
        case 'EXECUTE': {
          // Sealed on entry (advanceStep); one frame later the artifact is announced and we move on.
          sessionSealed = this.sealed; this.sealed = null; progress = 1;
          if (s === 'OBSERVING' || s === 'BLOCKED') this.advanceStep();
          break;
        }
        case 'OBSERVE': this.timer += dt; progress = Math.min(1, this.timer / this.observeSeconds); if (this.timer >= this.observeSeconds) this.advanceStep(); break;
        case 'REPORT': {
          this.timer += dt; progress = Math.min(1, this.timer / this.reportSeconds);
          if (this.timer >= this.reportSeconds) {
            report = { planId: this.plan.planId, session: this.lastSession, includeProvenance: step.includeProvenance, includeResult: step.includeResult, deferred: this.plan.steps.filter((x): x is Extract<ActionStep, { kind: 'DEFER' }> => x.kind === 'DEFER'), rejected: this.plan.rejected };
            if (this.context.state === 'REPORTING') this.apply({ type: 'REPORT_DONE' });
            else if (this.context.state === 'ARRIVED') this.apply({ type: 'RESET' });
            this.plan = null; this.stepIndex = -1;
          }
          break;
        }
        case 'DEFER': {
          // Nothing for the body to do; the deferred intents ride out with the next report, or as a report of their own.
          const rest = this.plan.steps.slice(this.stepIndex + 1);
          if (!rest.some((x) => x.kind !== 'DEFER')) {
            report = { planId: this.plan.planId, session: null, includeProvenance: false, includeResult: false, deferred: this.plan.steps.filter((x): x is Extract<ActionStep, { kind: 'DEFER' }> => x.kind === 'DEFER'), rejected: this.plan.rejected };
            this.plan = null; this.stepIndex = -1;
          } else this.advanceStep();
          break;
        }
      }
    } else { this.speed = 0; }
    this.lastProgress = progress;
    return { state: this.context.state, stepIndex: this.stepIndex, stepKind: this.currentStep()?.kind ?? null, stationId: this.currentStationId, report, sessionSealed, blockedReason: this.context.blockedReason, progress, interaction };
  }
}
