import type { AccessAuditEntry } from '../backend/client';
import type { AccessLevel } from './capabilities';
import type { CapabilityDecision } from './decision';
import type { ApprovalRequest, ApprovalSignature } from './approval';

/**
 * AUDIT CONCEPT — what must be written down, shaped for the table that already
 * exists.
 *
 * Genesis already has an audit log: the `access_audit` table in
 * `packages/backend/src/access.mjs`, read through `listProjectAccessAudit()`.
 * This file does NOT open a second one. It defines the entries a governance
 * decision must produce, with field names that line up one-for-one with that
 * table's columns, so persisting them later is a call to the existing endpoint
 * rather than a migration.
 *
 * The mapping, so the alignment is checkable rather than asserted:
 *
 *   action        <- what was attempted, as `capability:<id>` or `approval:<event>`
 *   accessLevel   <- the project's classification at the moment of the attempt
 *   workflow      <- 'governance' plus the stage, so these rows are filterable
 *   sourceIds     <- the approval request id and the signatures involved
 *   resultStatus  <- the decision outcome or the approval state
 *   details       <- the basis, the reason, and the actor
 *
 * ## Two rules about what goes in an entry
 *
 *  1. **A DENY is logged exactly as loudly as an ALLOW.** An audit trail that
 *     only records successes answers the wrong question: the interesting row is
 *     almost always the attempt that did not go through.
 *  2. **No entry ever carries the governed payload.** It records that an
 *     evidence bundle was exported, never the bundle. An audit log that copies
 *     the sensitive thing becomes a second, unclassified copy of it.
 */

/**
 * An entry ready to be written. Every field of the backend row except the ones
 * the server owns (`id`, `userId` from the token, `createdAt` from the server
 * clock) — so a caller cannot forge an identity or backdate a row.
 */
export type GovernanceAuditEntry = Omit<AccessAuditEntry, 'id' | 'userId' | 'createdAt'>;

export const GOVERNANCE_WORKFLOWS = ['governance:capability', 'governance:approval'] as const;
export type GovernanceWorkflow = (typeof GOVERNANCE_WORKFLOWS)[number];

export interface CapabilityAuditInput {
  readonly decision: CapabilityDecision;
  readonly projectId: string;
  readonly actorId: string;
  readonly accessLevel: AccessLevel;
  /** Set when the attempt was made under an approved request. */
  readonly approvalRequestId?: string;
}

/**
 * The entry for one capability decision — written whether the outcome was
 * ALLOW, REQUIRES_APPROVAL or DENY. See rule 1 above.
 */
export function auditCapabilityDecision(input: CapabilityAuditInput): GovernanceAuditEntry {
  return {
    projectId: input.projectId,
    action: `capability:${input.decision.capabilityId}`,
    accessLevel: input.accessLevel,
    workflow: 'governance:capability',
    sourceIds: input.approvalRequestId ? [input.approvalRequestId] : [],
    runId: null,
    resultStatus: input.decision.outcome,
    details: {
      basis: input.decision.basis,
      reason: input.decision.reason,
      actorId: input.actorId,
      // Recorded so a reader of the log knows this row describes what the UI
      // offered, and that the server enforced the real boundary separately.
      advisory: input.decision.advisory,
    },
  };
}

export const APPROVAL_EVENTS = ['opened', 'approved', 'rejected', 'withdrawn', 'expired'] as const;
export type ApprovalEvent = (typeof APPROVAL_EVENTS)[number];

export interface ApprovalAuditInput {
  readonly request: ApprovalRequest;
  readonly event: ApprovalEvent;
  readonly actorId: string;
  readonly accessLevel: AccessLevel;
  /** The signature that caused this event, when there was one. */
  readonly signature?: ApprovalSignature;
}

/**
 * The entry for one approval-workflow transition. The signatures collected so
 * far go into `sourceIds` alongside the request id, because "who signed" is the
 * question an auditor asks first and it must not require joining another table
 * to answer.
 */
export function auditApprovalEvent(input: ApprovalAuditInput): GovernanceAuditEntry {
  const { request } = input;
  return {
    projectId: request.projectId,
    action: `approval:${input.event}:${request.capabilityId}`,
    accessLevel: input.accessLevel,
    workflow: 'governance:approval',
    sourceIds: [request.requestId, ...request.approvals.map((a) => a.actorId)],
    runId: null,
    resultStatus: request.state,
    details: {
      actorId: input.actorId,
      requesterId: request.requesterId,
      justification: request.justification,
      approvalsCollected: request.approvals.length,
      approvalsRequired: request.policy.minimumApprovals,
      ...(input.signature ? { signatureRole: input.signature.role, signatureNote: input.signature.note } : {}),
      ...(request.rejection ? { rejectedBy: request.rejection.actorId, rejectionNote: request.rejection.note } : {}),
    },
  };
}

/**
 * A cheap guard a caller can assert in tests: no governance entry may carry a
 * field that looks like the governed payload. Returns the offending keys.
 *
 * It is intentionally a NAME check, not a content scan — a content scan would
 * have to look at the sensitive data to decide, which is the thing being
 * avoided.
 */
const PAYLOAD_LIKE_KEYS = ['bundle', 'payload', 'measurement', 'measurements', 'rows', 'data', 'contents', 'body', 'token', 'password'];

export function payloadLikeKeys(entry: GovernanceAuditEntry): readonly string[] {
  return Object.keys(entry.details).filter((k) => PAYLOAD_LIKE_KEYS.includes(k.toLowerCase()));
}
