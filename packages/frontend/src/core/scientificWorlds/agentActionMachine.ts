/**
 * SCIENTIFIC WORLDS — THE AGENT'S ACTION STATE MACHINE.
 *
 * Pure: no timers, no THREE, no world access. The character controller
 * feeds it events (a waypoint reached, the reach pose finished, the
 * experiment session sealed) and reads the resulting state to decide what
 * the rig should be doing. Every transition is explicit; an illegal event
 * is refused with a reason instead of being silently absorbed, so a test
 * (or the HUD) can tell "the arm never reached" from "nothing happened".
 */

export type AgentActionState =
  | 'IDLE'
  | 'MOVING_TO_TARGET'
  | 'ARRIVED'
  | 'ALIGNING'
  | 'REACHING'
  | 'INTERACTING'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'REPORTING'
  | 'RETURNING'
  | 'BLOCKED';

export type AgentActionEvent =
  | { readonly type: 'PLAN_STARTED'; readonly targetId: string }
  | { readonly type: 'WAYPOINT_REACHED'; readonly remaining: number }
  | { readonly type: 'ALIGN_STARTED' }
  | { readonly type: 'ALIGNED' }
  | { readonly type: 'REACHED' }
  | { readonly type: 'INTERACTION_DONE' }
  | { readonly type: 'EXECUTION_DONE'; readonly sessionId: string }
  | { readonly type: 'OBSERVATION_DONE' }
  | { readonly type: 'REPORT_DONE' }
  | { readonly type: 'RETURN_STARTED' }
  | { readonly type: 'RETURN_DONE' }
  | { readonly type: 'BLOCKED'; readonly reason: string }
  | { readonly type: 'RESET' };

export interface AgentActionContext {
  readonly state: AgentActionState;
  readonly targetId: string | null;
  readonly sessionId: string | null;
  readonly blockedReason: string | null;
  /** Number of accepted transitions so far — a cheap, deterministic clock for tests and HUD. */
  readonly step: number;
}

export type TransitionResult =
  | { readonly ok: true; readonly context: AgentActionContext }
  | { readonly ok: false; readonly reason: string; readonly context: AgentActionContext };

export const INITIAL_AGENT_CONTEXT: AgentActionContext = { state: 'IDLE', targetId: null, sessionId: null, blockedReason: null, step: 0 };

const ORDER: readonly AgentActionState[] = ['IDLE', 'MOVING_TO_TARGET', 'ARRIVED', 'ALIGNING', 'REACHING', 'INTERACTING', 'EXECUTING', 'OBSERVING', 'REPORTING', 'RETURNING', 'BLOCKED'];

function accept(context: AgentActionContext, patch: Partial<AgentActionContext>): TransitionResult {
  return { ok: true, context: { ...context, ...patch, step: context.step + 1 } };
}

function refuse(context: AgentActionContext, reason: string): TransitionResult {
  return { ok: false, reason, context };
}

export function transitionAgent(context: AgentActionContext, event: AgentActionEvent): TransitionResult {
  const s = context.state;
  switch (event.type) {
    case 'RESET':
      return accept(context, { state: 'IDLE', targetId: null, sessionId: null, blockedReason: null });
    case 'BLOCKED':
      return accept(context, { state: 'BLOCKED', blockedReason: event.reason });
    case 'PLAN_STARTED':
      if (s !== 'IDLE' && s !== 'REPORTING' && s !== 'ARRIVED') return refuse(context, `cannot start a plan while ${s}`);
      return accept(context, { state: 'MOVING_TO_TARGET', targetId: event.targetId, sessionId: null, blockedReason: null });
    case 'WAYPOINT_REACHED':
      if (s !== 'MOVING_TO_TARGET') return refuse(context, `waypoint reported while ${s}`);
      return event.remaining <= 0 ? accept(context, { state: 'ARRIVED' }) : accept(context, {});
    case 'ALIGN_STARTED':
      if (s !== 'ARRIVED') return refuse(context, `cannot align while ${s}`);
      return accept(context, { state: 'ALIGNING' });
    case 'ALIGNED':
      if (s !== 'ALIGNING') return refuse(context, `aligned reported while ${s}`);
      return accept(context, { state: 'REACHING' });
    case 'REACHED':
      if (s !== 'REACHING') return refuse(context, `reached reported while ${s}`);
      return accept(context, { state: 'INTERACTING' });
    case 'INTERACTION_DONE':
      if (s !== 'INTERACTING') return refuse(context, `interaction reported while ${s}`);
      return accept(context, { state: 'EXECUTING' });
    case 'EXECUTION_DONE':
      if (s !== 'EXECUTING') return refuse(context, `execution reported while ${s}`);
      return accept(context, { state: 'OBSERVING', sessionId: event.sessionId });
    case 'OBSERVATION_DONE':
      if (s !== 'OBSERVING') return refuse(context, `observation reported while ${s}`);
      return accept(context, { state: 'REPORTING' });
    case 'REPORT_DONE':
      if (s !== 'REPORTING') return refuse(context, `report reported while ${s}`);
      return accept(context, { state: 'IDLE', targetId: null });
    case 'RETURN_STARTED':
      if (s !== 'REPORTING' && s !== 'IDLE' && s !== 'ARRIVED') return refuse(context, `cannot return while ${s}`);
      return accept(context, { state: 'RETURNING' });
    case 'RETURN_DONE':
      if (s !== 'RETURNING') return refuse(context, `return reported while ${s}`);
      return accept(context, { state: 'IDLE', targetId: null });
    default:
      return refuse(context, 'unknown event');
  }
}

/** True while the rig should play the walk cycle. */
export function isMoving(state: AgentActionState): boolean { return state === 'MOVING_TO_TARGET' || state === 'RETURNING'; }
/** True while the right arm should be extended toward the console. */
export function isReaching(state: AgentActionState): boolean { return state === 'REACHING' || state === 'INTERACTING' || state === 'EXECUTING'; }
/** True while the agent is busy and must refuse a new plan. */
export function isBusy(state: AgentActionState): boolean { return state !== 'IDLE' && state !== 'BLOCKED' && state !== 'ARRIVED' && state !== 'REPORTING'; }
export function stateIndex(state: AgentActionState): number { return ORDER.indexOf(state); }

export const AGENT_STATE_LABEL_PL: Readonly<Record<AgentActionState, string>> = {
  IDLE: 'bezczynny', MOVING_TO_TARGET: 'idzie do stanowiska', ARRIVED: 'na miejscu', ALIGNING: 'ustawia się', REACHING: 'sięga do konsoli',
  INTERACTING: 'obsługuje konsolę', EXECUTING: 'wykonuje eksperyment', OBSERVING: 'obserwuje wynik', REPORTING: 'raportuje', RETURNING: 'wraca', BLOCKED: 'zablokowany',
};
