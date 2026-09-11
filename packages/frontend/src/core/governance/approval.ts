import type { ProjectRole } from '../backend/client';
import type { ApprovalPolicy, GenesisCapability } from './capabilities';

/**
 * APPROVAL WORKFLOW — the part of sovereign governance Genesis genuinely did
 * not have.
 *
 * The backend's `access_audit` table records what HAPPENED. Nothing anywhere
 * recorded a request that is WAITING for a decision, and nothing enforced that
 * the person who asked is not the person who signs it off. That gap is what
 * this file closes, and nothing more.
 *
 * It is a PURE REDUCER: every function here takes a request and an event and
 * returns a new request. There is no storage, no clock, no network and no
 * singleton — `now` is always passed in, so a test can make a request expire
 * without waiting and two deployments can persist these however they like.
 *
 * ## The rules, and why each one is here
 *
 *  1. **The requester can never approve their own request.** Separation of
 *     duties is the single property that makes an approval workflow worth
 *     having; without it this is a delay, not a control.
 *  2. **One approver, one vote.** Otherwise a single person clears a
 *     two-approval policy by pressing the button twice.
 *  3. **A rejection is decisive.** A rejected request cannot later become
 *     approved by collecting more signatures — that would let a requester shop
 *     for approvers until one agrees.
 *  4. **Terminal is terminal.** Approved, rejected, withdrawn and expired
 *     requests never transition again, so the audit trail cannot be rewritten
 *     by a late event arriving out of order.
 *  5. **Every rejected transition returns a REASON**, because "nothing
 *     happened" is the worst possible response to an attempt to approve
 *     something.
 */

export const APPROVAL_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

const TERMINAL: readonly ApprovalState[] = ['APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'];

export function isTerminal(state: ApprovalState): boolean {
  return TERMINAL.includes(state);
}

export interface ApprovalSignature {
  readonly actorId: string;
  readonly role: ProjectRole;
  readonly at: number;
  readonly note: string;
}

export interface ApprovalRequest {
  readonly requestId: string;
  readonly capabilityId: string;
  readonly projectId: string;
  /** Who asked. Cannot appear in `approvals` — see rule 1. */
  readonly requesterId: string;
  readonly requestedAt: number;
  readonly expiresAt: number;
  readonly policy: ApprovalPolicy;
  readonly state: ApprovalState;
  readonly approvals: readonly ApprovalSignature[];
  readonly rejection: ApprovalSignature | null;
  /** Why the requester says this should be allowed. Recorded verbatim in the audit entry. */
  readonly justification: string;
}

export interface ApprovalTransition {
  readonly request: ApprovalRequest;
  readonly changed: boolean;
  /** Empty when `changed`; otherwise exactly why the event was refused. */
  readonly refusedBecause: string;
}

const unchanged = (request: ApprovalRequest, refusedBecause: string): ApprovalTransition => ({
  request, changed: false, refusedBecause,
});

export interface OpenApprovalInput {
  readonly requestId: string;
  readonly capability: GenesisCapability;
  readonly projectId: string;
  readonly requesterId: string;
  readonly justification: string;
  readonly now: number;
  /** How long the request stays open. The caller owns this policy; there is no default clock here. */
  readonly validForMs: number;
}

/**
 * Opens a request. Throws only for a capability that needs no approval — asking
 * for sign-off on something that does not require it would put a meaningless
 * row in the audit log and teach readers to ignore the log.
 */
export function openApprovalRequest(input: OpenApprovalInput): ApprovalRequest {
  if (input.capability.approval === null) {
    throw new Error(`Capability "${input.capability.capabilityId}" requires no approval; do not open a request for it.`);
  }
  if (input.validForMs <= 0) {
    throw new Error('An approval request must be open for a positive amount of time.');
  }
  if (input.justification.trim().length === 0) {
    throw new Error('An approval request must carry a justification; an unexplained request cannot be audited.');
  }
  return {
    requestId: input.requestId,
    capabilityId: input.capability.capabilityId,
    projectId: input.projectId,
    requesterId: input.requesterId,
    requestedAt: input.now,
    expiresAt: input.now + input.validForMs,
    policy: input.capability.approval,
    state: 'PENDING',
    approvals: [],
    rejection: null,
    justification: input.justification,
  };
}

/** Shared guards for any decision event. */
function guard(request: ApprovalRequest, signature: ApprovalSignature): string {
  if (isTerminal(request.state)) {
    return `This request is already ${request.state.toLowerCase()} and cannot change again.`;
  }
  if (signature.at > request.expiresAt) {
    return 'This request expired before the decision was recorded.';
  }
  if (signature.actorId === request.requesterId) {
    return 'The requester cannot decide their own request — separation of duties.';
  }
  if (!request.policy.approverRoles.includes(signature.role)) {
    return `Role "${signature.role}" is not permitted to decide this request; it needs ${request.policy.approverRoles.join(' or ')}.`;
  }
  return '';
}

export function approve(request: ApprovalRequest, signature: ApprovalSignature): ApprovalTransition {
  const refusal = guard(request, signature);
  if (refusal) return unchanged(request, refusal);
  if (request.approvals.some((a) => a.actorId === signature.actorId)) {
    return unchanged(request, 'This approver has already signed; one approver counts once.');
  }

  const approvals = [...request.approvals, signature];
  const satisfied = approvals.length >= request.policy.minimumApprovals;
  return {
    request: { ...request, approvals, state: satisfied ? 'APPROVED' : 'PENDING' },
    changed: true,
    refusedBecause: '',
  };
}

export function reject(request: ApprovalRequest, signature: ApprovalSignature): ApprovalTransition {
  const refusal = guard(request, signature);
  if (refusal) return unchanged(request, refusal);
  return {
    // Signatures already collected are KEPT: the record of who approved before
    // someone objected is exactly what an auditor needs to see.
    request: { ...request, state: 'REJECTED', rejection: signature },
    changed: true,
    refusedBecause: '',
  };
}

/** The requester withdrawing their own request — the one event only they may fire. */
export function withdraw(request: ApprovalRequest, actorId: string, at: number): ApprovalTransition {
  if (isTerminal(request.state)) return unchanged(request, `This request is already ${request.state.toLowerCase()}.`);
  if (actorId !== request.requesterId) return unchanged(request, 'Only the requester may withdraw a request.');
  return { request: { ...request, state: 'WITHDRAWN' }, changed: true, refusedBecause: `withdrawn at ${at}` };
}

/**
 * Expires a request whose window has closed. The clock is an argument, never
 * `Date.now()`, so this is testable and two callers cannot disagree about the
 * current time.
 */
export function expireIfDue(request: ApprovalRequest, now: number): ApprovalTransition {
  if (isTerminal(request.state)) return unchanged(request, `This request is already ${request.state.toLowerCase()}.`);
  if (now <= request.expiresAt) return unchanged(request, 'This request is still open.');
  return { request: { ...request, state: 'EXPIRED' }, changed: true, refusedBecause: '' };
}

/** How many more signatures are needed. Zero once the policy is satisfied. */
export function approvalsOutstanding(request: ApprovalRequest): number {
  if (request.state !== 'PENDING') return 0;
  return Math.max(0, request.policy.minimumApprovals - request.approvals.length);
}

/**
 * The one question a caller must ask before executing the governed act. It is
 * deliberately not a boolean on the request itself: `state === 'APPROVED'` could
 * drift from the policy if the policy were ever edited underneath a stored
 * request, so the count is re-checked here every time.
 */
export function mayProceed(request: ApprovalRequest): boolean {
  return request.state === 'APPROVED' && request.approvals.length >= request.policy.minimumApprovals;
}
