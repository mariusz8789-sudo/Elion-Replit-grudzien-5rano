import type { ProjectRole } from '../backend/client';
import {
  ACCESS_RANK,
  getCapability,
  ROLE_RANK,
  type AccessLevel,
  type GenesisCapability,
} from './capabilities';

/**
 * CAPABILITY GATING — one pure function, and the reason it is shaped this way.
 *
 * The obvious way to write this would be to re-implement the server's
 * `canUseAccessLevel(level, role, operation)` here so the UI can decide
 * offline. That would be a SECOND POLICY ENGINE, and two policy engines
 * eventually disagree — the moment they do, one of them is granting access the
 * other refuses, and nobody finds out from a passing test suite.
 *
 * So this function never re-derives the server's answer. It TAKES the server's
 * verdict as an input and ANDs the capability's own requirement onto it. The
 * result is that a decision here is always a subset of what the server already
 * permitted: the layer can narrow, and has no expressible way to widen.
 *
 * That is the whole security argument, and `governance.test.ts` checks it
 * exhaustively over every capability and every (role, level, verdict) triple
 * rather than trusting this comment.
 */

/**
 * What the SERVER said, verbatim — `ProjectAccess` as returned by
 * `getProjectAccess()`. This is the authority. Nothing in this module produces
 * one of these; it can only be received.
 */
export interface ServerAccessVerdict {
  readonly accessLevel: AccessLevel;
  readonly role: ProjectRole;
  /** The server's own answer to "may this member run things here". */
  readonly canRun: boolean;
}

export interface CapabilityRequest {
  readonly capabilityId: string;
  /** Who is asking. Used for separation of duties in `approval.ts`, never to grant anything. */
  readonly actorId: string;
  readonly server: ServerAccessVerdict;
}

export const CAPABILITY_OUTCOMES = ['ALLOW', 'REQUIRES_APPROVAL', 'DENY'] as const;
export type CapabilityOutcome = (typeof CAPABILITY_OUTCOMES)[number];

/**
 * Which rule decided, named explicitly. A decision a caller cannot explain is a
 * decision a caller cannot audit, and `audit.ts` writes this straight into the
 * entry.
 */
export const DECISION_BASES = [
  'UNKNOWN_CAPABILITY',
  'SERVER_REFUSED_RUN',
  'ROLE_BELOW_MINIMUM',
  'ACCESS_LEVEL_ABOVE_CEILING',
  'APPROVAL_REQUIRED',
  'PERMITTED',
] as const;
export type DecisionBasis = (typeof DECISION_BASES)[number];

export interface CapabilityDecision {
  readonly capabilityId: string;
  readonly outcome: CapabilityOutcome;
  readonly basis: DecisionBasis;
  /** Plain-language reason, safe to show a person. */
  readonly reason: string;
  /** Present only when the outcome is REQUIRES_APPROVAL. */
  readonly capability: GenesisCapability | null;
  /**
   * Always true, and stated in the value rather than only in prose: this
   * decision governs what a UI offers. It is never the thing protecting data.
   */
  readonly advisory: true;
}

const deny = (capabilityId: string, basis: DecisionBasis, reason: string, capability: GenesisCapability | null = null): CapabilityDecision => ({
  capabilityId, outcome: 'DENY', basis, reason, capability, advisory: true,
});

/**
 * Evaluates one capability for one actor in one project context.
 *
 * Order matters and is deliberate: the SERVER'S refusal is checked before
 * anything this module knows, so a server "no" is never reached past. An
 * unknown capability is denied rather than waved through — a catalogue that
 * fails open is worse than no catalogue.
 */
export function evaluateCapability(request: CapabilityRequest): CapabilityDecision {
  const capability = getCapability(request.capabilityId);
  if (capability === null) {
    return deny(
      request.capabilityId,
      'UNKNOWN_CAPABILITY',
      'This capability is not in the Genesis catalogue. Unknown capabilities are refused rather than assumed harmless.',
    );
  }

  // The server's word first, and it is final in the refusing direction.
  if (capability.operation === 'run' && !request.server.canRun) {
    return deny(
      capability.capabilityId,
      'SERVER_REFUSED_RUN',
      'The server already refused this member permission to run in this project. Nothing in the capability catalogue can restore it.',
      capability,
    );
  }

  if (ROLE_RANK[request.server.role] < ROLE_RANK[capability.minimumRole]) {
    return deny(
      capability.capabilityId,
      'ROLE_BELOW_MINIMUM',
      `Requires the ${capability.minimumRole} role or above; this member is ${request.server.role}.`,
      capability,
    );
  }

  if (ACCESS_RANK[request.server.accessLevel] > ACCESS_RANK[capability.maximumAccessLevel]) {
    return deny(
      capability.capabilityId,
      'ACCESS_LEVEL_ABOVE_CEILING',
      `This project is classified ${request.server.accessLevel}, above the ${capability.maximumAccessLevel} ceiling declared for "${capability.label}".`,
      capability,
    );
  }

  if (capability.approval !== null) {
    return {
      capabilityId: capability.capabilityId,
      outcome: 'REQUIRES_APPROVAL',
      basis: 'APPROVAL_REQUIRED',
      reason: `Permitted, but ${capability.approval.minimumApprovals} approval${capability.approval.minimumApprovals === 1 ? '' : 's'} from ${capability.approval.approverRoles.join(' or ')} must be recorded first. The requester cannot be one of them.`,
      capability,
      advisory: true,
    };
  }

  return {
    capabilityId: capability.capabilityId,
    outcome: 'ALLOW',
    basis: 'PERMITTED',
    reason: `Permitted for ${request.server.role} in a ${request.server.accessLevel} project.`,
    capability,
    advisory: true,
  };
}

/** Convenience for a UI: may this be offered at all, in any form? */
export function isOfferable(decision: CapabilityDecision): boolean {
  return decision.outcome !== 'DENY';
}
