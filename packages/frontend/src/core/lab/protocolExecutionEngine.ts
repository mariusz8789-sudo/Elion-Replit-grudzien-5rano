import type { ExperimentProtocol } from './experimentProtocol';
import { validateProtocol } from './experimentProtocol';
import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export type ProtocolExecutionState = 'CREATED' | 'VALIDATED' | 'DRY_RUN' | 'READY' | 'ARMED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ABORTED' | 'FAILED';
export interface ExecutionTransition { readonly from: ProtocolExecutionState; readonly to: ProtocolExecutionState; readonly reason: string; readonly sequence: number }

const ALLOWED: Record<ProtocolExecutionState, readonly ProtocolExecutionState[]> = {
  CREATED: ['VALIDATED', 'FAILED'], VALIDATED: ['DRY_RUN', 'FAILED'], DRY_RUN: ['READY', 'FAILED'], READY: ['ARMED', 'ABORTED'],
  ARMED: ['RUNNING', 'ABORTED'], RUNNING: ['PAUSED', 'COMPLETED', 'ABORTED', 'FAILED'], PAUSED: ['RUNNING', 'ABORTED'],
  COMPLETED: [], ABORTED: [], FAILED: [],
};

export class ProtocolExecutionSession {
  private stateValue: ProtocolExecutionState = 'CREATED';
  private readonly transitionsValue: ExecutionTransition[] = [];
  constructor(readonly protocol: ExperimentProtocol, private readonly runtime: LabRuntime) {}
  get state(): ProtocolExecutionState { return this.stateValue; }
  get transitions(): readonly ExecutionTransition[] { return this.transitionsValue; }

  validate(): void {
    const result = validateProtocol(this.protocol);
    if (!result.valid) { this.transition('FAILED', result.errors.join('|')); throw new Error(result.errors.join('|')); }
    this.transition('VALIDATED', 'PROTOCOL_VALID');
    emitLabEvidence(this.runtime, { type: 'PROTOCOL_VALIDATED', modelId: 'D140_PROTOCOL', solverId: 'protocol-v1', input: this.protocol, result, epistemicStatus: 'SIMULATION', evidenceClass: 'DERIVED' });
  }
  transition(to: ProtocolExecutionState, reason: string): void {
    if (!ALLOWED[this.stateValue].includes(to)) throw new Error(`Illegal transition ${this.stateValue}->${to}`);
    const transition = { from: this.stateValue, to, reason, sequence: this.transitionsValue.length };
    this.transitionsValue.push(transition); this.stateValue = to;
    if (to === 'COMPLETED') emitLabEvidence(this.runtime, { type: 'PROTOCOL_EXECUTED', modelId: 'D140_PROTOCOL_EXECUTION', solverId: 'state-machine-v1', input: this.protocol, result: this.transitionsValue, epistemicStatus: 'SIMULATION', evidenceClass: 'DERIVED' });
  }
}
