/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../knowledge/EvidenceLedger.js';
export interface ActionSpec { readonly actionId: string; readonly target: string; readonly op: string; readonly paramsHash: string; readonly preconditions: readonly string[]; status: 'PROPOSED' | 'AUTHORIZED_FOR_HUMAN_EXECUTION'; readonly approvals: readonly string[]; }
export interface GraphStateFlags { readonly criticalNodeCompromised: boolean; readonly supplySurge: boolean; readonly treatyCandidateViolation: boolean; }
export interface ApproveResult { readonly ok: boolean; readonly error?: 'UNKNOWN_ACTION' | 'DUPLICATE_APPROVER' | 'BAD_SIGNATURE' | 'ALREADY_AUTHORIZED'; readonly action?: ActionSpec; }
/** Action-Gate Synthesizer: compiles graph flags into PROPOSED action specs only.
 *  There is deliberately NO execute() — execution happens externally by a human after dual-control. */
export class ActionGateSynthesizer {
  private actions = new Map<string, ActionSpec>();
  private seq = 0;
  constructor(private verifySignature: (approverId: string, actionId: string, sig: string) => boolean) {}
  synthesize(flags: GraphStateFlags): readonly ActionSpec[] {
    const out: ActionSpec[] = [];
    const push = (target: string, op: string, params: unknown, pre: readonly string[]): void => {
      const actionId = 'ACT-' + (++this.seq).toString(36).toUpperCase();
      const spec: ActionSpec = { actionId, target, op, paramsHash: sha256hex(stableStringify(params)), preconditions: pre, status: 'PROPOSED', approvals: [] };
      this.actions.set(actionId, spec); out.push(spec);
    };
    if (flags.criticalNodeCompromised) push('SCADA-SEGMENT-7', 'ISOLATE_SEGMENT', { segment: 7 }, ['dual-control', 'operator-confirm']);
    if (flags.supplySurge) push('PROCUREMENT-DESK', 'FREEZE_PO', { scope: 'COMP-X' }, ['dual-control']);
    if (flags.treatyCandidateViolation) push('DIPLO-CHANNEL', 'NOTIFY_VERIFY', { clause: 'ART-4.2' }, ['dual-control', 'legal-review']);
    return out;
  }
  approve(actionId: string, approverId: string, signature: string): ApproveResult {
    const a = this.actions.get(actionId);
    if (!a) return { ok: false, error: 'UNKNOWN_ACTION' };
    if (a.status === 'AUTHORIZED_FOR_HUMAN_EXECUTION') return { ok: false, error: 'ALREADY_AUTHORIZED' };
    if (a.approvals.includes(approverId)) return { ok: false, error: 'DUPLICATE_APPROVER' };
    if (!this.verifySignature(approverId, actionId, signature)) return { ok: false, error: 'BAD_SIGNATURE' };
    const approvals = [...a.approvals, approverId];
    const status: ActionSpec['status'] = approvals.length >= 2 ? 'AUTHORIZED_FOR_HUMAN_EXECUTION' : 'PROPOSED';
    const next: ActionSpec = { ...a, approvals, status };
    this.actions.set(actionId, next);
    return { ok: true, action: next };
  }
  getActions(): readonly ActionSpec[] { return [...this.actions.values()]; }
}
