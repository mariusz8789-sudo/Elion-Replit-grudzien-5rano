import type { ProjectAccess, ProjectRole } from '../backend/client';

/**
 * GENESIS SOVEREIGN FOUNDATION — the capability catalogue.
 *
 * This is a FOUNDATION, not a product surface: no UI, no storage, no network,
 * no singleton, no interception of anything. Everything here is a pure value or
 * a pure function, so C3 can wire it without inheriting a runtime.
 *
 * ## What already existed, and is therefore NOT rebuilt here
 *
 * Genesis already has all three of the things a governance layer is usually
 * tempted to reinvent, and every one of them stays exactly where it is:
 *
 *  - **Identity and sessions** — `core/backend/session.ts` + `AccountPanel`.
 *    Nothing in this module authenticates, issues, reads or stores a token.
 *  - **The authoritative policy** — `packages/backend/src/access.mjs`, whose
 *    `canUseAccessLevel(level, role, operation)` decides what a member may do
 *    with a project at a given access level, SERVER-SIDE.
 *  - **The audit log** — the `access_audit` table and
 *    `listProjectAccessAudit()`. `audit.ts` in this folder produces entries
 *    shaped for that table; it does not open a second one.
 *
 * ## What was genuinely missing, and is what this folder adds
 *
 *  1. A NAMED CATALOGUE of the consequential things a person can do in Genesis.
 *     The server rule answers "may this role read or run in this project"; it
 *     has no vocabulary for "admit a real laboratory measurement" versus "run a
 *     simulation", which in a sovereign deployment are not the same act at all.
 *  2. An APPROVAL WORKFLOW (`approval.ts`). The audit table records what
 *     happened; nothing anywhere recorded a request WAITING for a decision, or
 *     enforced that the person who asked is not the person who approves.
 *  3. A typed AUDIT CONCEPT (`audit.ts`) tying a capability decision to the
 *     entry that must be written about it.
 *
 * ## The safety property this module is built around
 *
 * **It can only ever narrow, never widen.** `decision.ts` does not re-derive
 * the server's rule — re-deriving it would be a second policy engine, and a
 * second policy engine eventually disagrees with the first, which is how
 * access-control bugs are born. Instead it takes the SERVER'S OWN VERDICT as an
 * input and ANDs the capability's requirement onto it. A capability can
 * therefore only ever be more restricted than the server already said, and
 * that is enforced by construction rather than by review.
 *
 * Consequently this layer is ADVISORY. It decides what a UI should offer and
 * what must be sent for approval first. It is not, and must never become, the
 * thing that actually protects data — that remains the backend.
 */

export type AccessLevel = ProjectAccess['accessLevel'];

/**
 * The server's operation vocabulary, reused verbatim from `access.mjs` so a
 * capability's operation is always something the server's verdict covers.
 */
export type GovernedOperation = 'read' | 'run';

/**
 * How much a capability costs to get wrong. This is the axis the server rule
 * has no way to express, and the reason the catalogue exists.
 *
 *  - `REVERSIBLE` — undoing it restores the previous state completely.
 *  - `PERSISTENT` — it writes a record that stays, but nothing leaves Genesis
 *    and no claim about the real world is made.
 *  - `LEAVES_THE_SYSTEM` — data crosses the boundary to somewhere this
 *    deployment no longer governs. It cannot be recalled.
 *  - `ASSERTS_REALITY` — it attaches REAL_EXPERIMENTAL or REFERENCE provenance
 *    to a number, so downstream readers will treat it as a measurement of the
 *    world rather than as output of a model. In a regulated deployment this is
 *    the most consequential act available, which is why it is its own tier.
 */
export const CONSEQUENCE_TIERS = ['REVERSIBLE', 'PERSISTENT', 'LEAVES_THE_SYSTEM', 'ASSERTS_REALITY'] as const;
export type ConsequenceTier = (typeof CONSEQUENCE_TIERS)[number];

/** Who may sign off, how many are needed, and whether the asker may be one of them. */
export interface ApprovalPolicy {
  readonly approverRoles: readonly ProjectRole[];
  readonly minimumApprovals: number;
  /**
   * Separation of duties. Always false in this catalogue: a request that its
   * own author can approve is not an approval workflow, it is a delay. The type
   * keeps the field explicit so nobody has to infer the rule from its absence.
   */
  readonly requesterMayApprove: false;
}

export interface GenesisCapability {
  readonly capabilityId: string;
  readonly label: string;
  /** The real code path this capability governs, so a reviewer can go and read it. */
  readonly governs: string;
  readonly operation: GovernedOperation;
  readonly consequence: ConsequenceTier;
  /** Least-privileged role that may do this AT ALL, before the server verdict is applied. */
  readonly minimumRole: ProjectRole;
  /**
   * The most restricted data classification this capability may touch. A
   * capability is refused above its ceiling even when the server would allow
   * the operation — that is the narrowing this catalogue exists to add.
   */
  readonly maximumAccessLevel: AccessLevel;
  /** Null when the act may proceed directly; a policy when someone else must sign off. */
  readonly approval: ApprovalPolicy | null;
  readonly rationale: string;
}

/** Least privilege first — used to compare roles, never to grant one. */
export const ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

/** Least sensitive first. A capability may touch levels up to and including its ceiling. */
export const ACCESS_RANK: Record<AccessLevel, number> = { PUBLIC: 0, RESEARCH: 1, RESTRICTED: 2 };

const twoOfTheSeniors: ApprovalPolicy = { approverRoles: ['owner', 'admin'], minimumApprovals: 2, requesterMayApprove: false };
const oneSenior: ApprovalPolicy = { approverRoles: ['owner', 'admin'], minimumApprovals: 1, requesterMayApprove: false };

/**
 * Every capability here governs a code path that ALREADY EXISTS in this
 * repository. A catalogue of aspirational capabilities would be a design
 * mockup, and the `governs` field is there so that claim stays checkable.
 */
export const GENESIS_CAPABILITIES: readonly GenesisCapability[] = [
  {
    capabilityId: 'evidence.read',
    label: 'Read an Evidence Bundle',
    governs: 'components/visual-simulation/EvidenceShowcaseScreen.tsx',
    operation: 'read',
    consequence: 'REVERSIBLE',
    minimumRole: 'viewer',
    maximumAccessLevel: 'RESTRICTED',
    approval: null,
    rationale: 'Reading an already-sealed bundle changes nothing and is what the audit trail is for.',
  },
  {
    capabilityId: 'evidence.export',
    label: 'Export an Evidence Bundle as a signed file',
    governs: 'EvidenceShowcaseScreen.tsx downloadJson() + core/integrity buildIntegrityEnvelope()',
    operation: 'read',
    consequence: 'LEAVES_THE_SYSTEM',
    minimumRole: 'editor',
    maximumAccessLevel: 'RESEARCH',
    approval: oneSenior,
    rationale: 'The file carries the full record out of the deployment and cannot be recalled. The integrity envelope proves the file was not altered afterwards; it does nothing about where the file went, so the export itself is the control point.',
  },
  {
    capabilityId: 'evidence.admit-real-measurement',
    label: 'Admit a real or cited measurement as REAL_EXPERIMENTAL / REFERENCE',
    governs: 'components/visual-simulation/RealExperimentPipeline.tsx + core/dataProvenance.ts',
    operation: 'run',
    consequence: 'ASSERTS_REALITY',
    minimumRole: 'editor',
    maximumAccessLevel: 'RESTRICTED',
    approval: twoOfTheSeniors,
    rationale: 'This is the one act that moves a number off the SIMULATED axis, and everything downstream — Evidence, Memory, Replay, the Matrix — will then treat it as a fact about the world. Two approvals, because a single mistaken admission is not visibly different from a correct one.',
  },
  {
    capabilityId: 'discovery.run-loop',
    label: 'Run an autonomous Discovery search',
    governs: 'core/agent/worldDiscoverySession.ts runWorldDiscoveryAndRemember()',
    operation: 'run',
    consequence: 'PERSISTENT',
    minimumRole: 'editor',
    maximumAccessLevel: 'RESTRICTED',
    approval: null,
    rationale: 'A search is simulation: it writes a record and asserts nothing about the world. Gating it behind approval would stop the research the system exists to do, and its output is already labelled SIMULATED.',
  },
  {
    capabilityId: 'compute.run-fabric',
    label: 'Run a backend compute job',
    governs: 'core/backend/client.ts runFabricCompute() / runCompute()',
    operation: 'run',
    consequence: 'PERSISTENT',
    minimumRole: 'editor',
    maximumAccessLevel: 'RESEARCH',
    approval: null,
    rationale: 'Consumes shared compute and writes a run record. The server already rate-limits and authorises it; the ceiling here keeps restricted data off a shared executor.',
  },
  {
    capabilityId: 'memory.delete-record',
    label: 'Delete a record from Scientific Memory',
    governs: 'core/scienceMemory.ts',
    operation: 'run',
    consequence: 'PERSISTENT',
    minimumRole: 'admin',
    maximumAccessLevel: 'RESTRICTED',
    approval: twoOfTheSeniors,
    rationale: 'Deleting a record can break a Matrix edge that pointed at it and silently turn a verified prediction into an orphan. Two approvals, and the audit entry is the only remaining trace.',
  },
  {
    capabilityId: 'project.set-access-level',
    label: 'Change a project’s access level',
    governs: 'packages/backend/src/access.mjs setProjectAccess()',
    operation: 'run',
    consequence: 'PERSISTENT',
    minimumRole: 'admin',
    maximumAccessLevel: 'RESTRICTED',
    approval: twoOfTheSeniors,
    rationale: 'This edits the policy itself. Relaxing a classification is the single change that can expose everything else, so it takes two people who could each already do it alone.',
  },
  {
    capabilityId: 'project.add-member',
    label: 'Add a member to a project',
    governs: 'core/backend/client.ts addMember()',
    operation: 'run',
    consequence: 'PERSISTENT',
    minimumRole: 'admin',
    maximumAccessLevel: 'RESTRICTED',
    approval: oneSenior,
    rationale: 'Granting access is how access spreads. One senior sign-off keeps it deliberate without making routine collaboration painful.',
  },
  {
    capabilityId: 'mergeRequest.decide',
    label: 'Accept or reject a merge request',
    governs: 'core/backend/client.ts decideMergeRequest()',
    operation: 'run',
    consequence: 'PERSISTENT',
    minimumRole: 'admin',
    maximumAccessLevel: 'RESTRICTED',
    approval: null,
    rationale: 'Deciding a merge request IS the review step. Requiring approval to approve would be a loop.',
  },
];

export function getCapability(capabilityId: string): GenesisCapability | null {
  return GENESIS_CAPABILITIES.find((c) => c.capabilityId === capabilityId) ?? null;
}

/** Capabilities that can never proceed without someone else signing off. */
export function capabilitiesRequiringApproval(): readonly GenesisCapability[] {
  return GENESIS_CAPABILITIES.filter((c) => c.approval !== null);
}
