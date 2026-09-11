import { describe, expect, it } from 'vitest';

import type { ProjectRole } from '../core/backend/client';
import {
  ACCESS_RANK,
  approvalsOutstanding,
  approve,
  auditApprovalEvent,
  auditCapabilityDecision,
  capabilitiesRequiringApproval,
  CONSEQUENCE_TIERS,
  evaluateCapability,
  expireIfDue,
  GENESIS_CAPABILITIES,
  getCapability,
  isOfferable,
  isTerminal,
  mayProceed,
  openApprovalRequest,
  payloadLikeKeys,
  reject,
  ROLE_RANK,
  withdraw,
  type AccessLevel,
  type ApprovalSignature,
  type ServerAccessVerdict,
} from '../core/governance';

const ROLES: readonly ProjectRole[] = ['viewer', 'editor', 'admin', 'owner'];
const LEVELS: readonly AccessLevel[] = ['PUBLIC', 'RESEARCH', 'RESTRICTED'];

const verdict = (role: ProjectRole, accessLevel: AccessLevel, canRun: boolean): ServerAccessVerdict => ({ role, accessLevel, canRun });

const sig = (actorId: string, role: ProjectRole, at = 1_000): ApprovalSignature => ({ actorId, role, at, note: 'reviewed' });

describe('the catalogue describes real code paths, not aspirations', () => {
  it('gives every capability a governs pointer, a rationale and a real consequence tier', () => {
    expect(GENESIS_CAPABILITIES.length).toBeGreaterThan(0);
    for (const c of GENESIS_CAPABILITIES) {
      expect(c.governs.length, c.capabilityId).toBeGreaterThan(10);
      expect(c.rationale.length, c.capabilityId).toBeGreaterThan(20);
      expect(CONSEQUENCE_TIERS, c.capabilityId).toContain(c.consequence);
      expect(ROLES, c.capabilityId).toContain(c.minimumRole);
      expect(LEVELS, c.capabilityId).toContain(c.maximumAccessLevel);
    }
  });

  it('uses unique ids and resolves each of them', () => {
    const ids = GENESIS_CAPABILITIES.map((c) => c.capabilityId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getCapability(id)).not.toBeNull();
    expect(getCapability('not.a.capability')).toBeNull();
  });

  it('never lets a requester approve their own request, in any policy', () => {
    for (const c of capabilitiesRequiringApproval()) {
      expect(c.approval!.requesterMayApprove, c.capabilityId).toBe(false);
      expect(c.approval!.minimumApprovals, c.capabilityId).toBeGreaterThan(0);
      expect(c.approval!.approverRoles.length, c.capabilityId).toBeGreaterThan(0);
    }
  });

  it('requires approval for every act that leaves the system or asserts reality', () => {
    for (const c of GENESIS_CAPABILITIES) {
      if (c.consequence === 'LEAVES_THE_SYSTEM' || c.consequence === 'ASSERTS_REALITY') {
        expect(c.approval, `${c.capabilityId} has the highest consequence and must not be self-service`).not.toBeNull();
      }
    }
  });

  it('demands two approvals for admitting a real measurement — the one irreversible claim', () => {
    const admit = getCapability('evidence.admit-real-measurement')!;
    expect(admit.consequence).toBe('ASSERTS_REALITY');
    expect(admit.approval!.minimumApprovals).toBe(2);
  });
});

describe('THE SAFETY PROPERTY: this layer can only narrow, never widen', () => {
  it('never returns anything but DENY for a run capability the server refused — exhaustively', () => {
    let checked = 0;
    for (const c of GENESIS_CAPABILITIES) {
      if (c.operation !== 'run') continue;
      for (const role of ROLES) {
        for (const level of LEVELS) {
          const d = evaluateCapability({ capabilityId: c.capabilityId, actorId: 'u1', server: verdict(role, level, false) });
          expect(d.outcome, `${c.capabilityId}/${role}/${level}`).toBe('DENY');
          expect(d.basis).toBe('SERVER_REFUSED_RUN');
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('never allows a role below the capability’s minimum, at any access level', () => {
    for (const c of GENESIS_CAPABILITIES) {
      for (const role of ROLES) {
        if (ROLE_RANK[role] >= ROLE_RANK[c.minimumRole]) continue;
        for (const level of LEVELS) {
          const d = evaluateCapability({ capabilityId: c.capabilityId, actorId: 'u1', server: verdict(role, level, true) });
          expect(d.outcome, `${c.capabilityId}/${role}/${level}`).toBe('DENY');
        }
      }
    }
  });

  it('never allows a capability above its declared access ceiling, at any role', () => {
    for (const c of GENESIS_CAPABILITIES) {
      for (const level of LEVELS) {
        if (ACCESS_RANK[level] <= ACCESS_RANK[c.maximumAccessLevel]) continue;
        for (const role of ROLES) {
          const d = evaluateCapability({ capabilityId: c.capabilityId, actorId: 'u1', server: verdict(role, level, true) });
          // The property under test is that it is refused, and that holds for
          // every role.
          expect(d.outcome, `${c.capabilityId}/${role}/${level}`).toBe('DENY');
          // The ceiling is only the REASON when the role was otherwise good
          // enough — a role below the minimum is checked first and reported
          // first, which is the more useful message of the two.
          if (ROLE_RANK[role] >= ROLE_RANK[c.minimumRole]) {
            expect(d.basis, `${c.capabilityId}/${role}/${level}`).toBe('ACCESS_LEVEL_ABOVE_CEILING');
          }
        }
      }
    }
  });

  it('fails CLOSED on a capability it has never heard of', () => {
    const d = evaluateCapability({ capabilityId: 'invented.by.a.caller', actorId: 'u1', server: verdict('owner', 'PUBLIC', true) });
    expect(d.outcome).toBe('DENY');
    expect(d.basis).toBe('UNKNOWN_CAPABILITY');
    expect(isOfferable(d)).toBe(false);
  });

  it('marks every decision advisory, so no caller can mistake it for enforcement', () => {
    for (const c of GENESIS_CAPABILITIES) {
      for (const role of ROLES) {
        for (const level of LEVELS) {
          for (const canRun of [true, false]) {
            const d = evaluateCapability({ capabilityId: c.capabilityId, actorId: 'u1', server: verdict(role, level, canRun) });
            expect(d.advisory).toBe(true);
            expect(d.reason.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('capability gating reaches the right verdicts in the ordinary cases', () => {
  it('lets a viewer read an evidence bundle even in a restricted project', () => {
    const d = evaluateCapability({ capabilityId: 'evidence.read', actorId: 'u1', server: verdict('viewer', 'RESTRICTED', false) });
    expect(d.outcome).toBe('ALLOW');
  });

  it('refuses to export a restricted bundle even for the owner — the ceiling binds everyone', () => {
    const d = evaluateCapability({ capabilityId: 'evidence.export', actorId: 'u1', server: verdict('owner', 'RESTRICTED', true) });
    expect(d.outcome).toBe('DENY');
    expect(d.basis).toBe('ACCESS_LEVEL_ABOVE_CEILING');
  });

  it('lets an editor run a discovery search outright — simulation is not gated behind sign-off', () => {
    const d = evaluateCapability({ capabilityId: 'discovery.run-loop', actorId: 'u1', server: verdict('editor', 'RESTRICTED', true) });
    expect(d.outcome).toBe('ALLOW');
  });

  it('sends admitting a real measurement to approval rather than allowing or denying it', () => {
    const d = evaluateCapability({ capabilityId: 'evidence.admit-real-measurement', actorId: 'u1', server: verdict('editor', 'RESTRICTED', true) });
    expect(d.outcome).toBe('REQUIRES_APPROVAL');
    expect(isOfferable(d)).toBe(true);
    expect(d.capability!.approval!.minimumApprovals).toBe(2);
  });
});

describe('the approval workflow enforces separation of duties', () => {
  const capability = getCapability('evidence.admit-real-measurement')!;
  const open = () => openApprovalRequest({
    requestId: 'req-1',
    capability,
    projectId: 'p1',
    requesterId: 'alice',
    justification: 'Titration replicate 3 measured on the bench, notebook p.44.',
    now: 0,
    validForMs: 10_000,
  });

  it('refuses to open a request for something that needs no approval', () => {
    expect(() => openApprovalRequest({
      requestId: 'r', capability: getCapability('discovery.run-loop')!, projectId: 'p1',
      requesterId: 'alice', justification: 'x', now: 0, validForMs: 10,
    })).toThrow(/requires no approval/);
  });

  it('refuses an unjustified request — an unexplained request cannot be audited', () => {
    expect(() => openApprovalRequest({
      requestId: 'r', capability, projectId: 'p1', requesterId: 'alice',
      justification: '   ', now: 0, validForMs: 10,
    })).toThrow(/justification/);
  });

  it('REFUSES the requester’s own signature, and says so', () => {
    const t = approve(open(), sig('alice', 'owner'));
    expect(t.changed).toBe(false);
    expect(t.refusedBecause).toContain('separation of duties');
    expect(t.request.state).toBe('PENDING');
  });

  it('counts one approver once, so a single person cannot clear a two-approval policy', () => {
    let r = open();
    r = approve(r, sig('bob', 'admin')).request;
    expect(r.state).toBe('PENDING');
    const again = approve(r, sig('bob', 'admin', 1_100));
    expect(again.changed).toBe(false);
    expect(again.refusedBecause).toContain('already signed');
    expect(again.request.state).toBe('PENDING');
    expect(approvalsOutstanding(again.request)).toBe(1);
  });

  it('approves only once two DIFFERENT permitted approvers have signed', () => {
    let r = open();
    r = approve(r, sig('bob', 'admin')).request;
    expect(mayProceed(r)).toBe(false);
    r = approve(r, sig('carol', 'owner', 1_200)).request;
    expect(r.state).toBe('APPROVED');
    expect(mayProceed(r)).toBe(true);
    expect(approvalsOutstanding(r)).toBe(0);
  });

  it('refuses a signature from a role the policy does not name', () => {
    const t = approve(open(), sig('dave', 'editor'));
    expect(t.changed).toBe(false);
    expect(t.refusedBecause).toContain('not permitted');
  });

  it('makes a rejection decisive — more signatures cannot revive it', () => {
    let r = open();
    r = approve(r, sig('bob', 'admin')).request;
    r = reject(r, sig('carol', 'owner', 1_200)).request;
    expect(r.state).toBe('REJECTED');
    // The approval already collected is KEPT, because who approved before the
    // objection is exactly what an auditor needs.
    expect(r.approvals).toHaveLength(1);
    const after = approve(r, sig('erin', 'owner', 1_300));
    expect(after.changed).toBe(false);
    expect(after.request.state).toBe('REJECTED');
    expect(mayProceed(after.request)).toBe(false);
  });

  it('expires on a clock the caller supplies, and an expired request is terminal', () => {
    const still = expireIfDue(open(), 9_999);
    expect(still.changed).toBe(false);
    const gone = expireIfDue(open(), 10_001);
    expect(gone.changed).toBe(true);
    expect(gone.request.state).toBe('EXPIRED');
    expect(isTerminal(gone.request.state)).toBe(true);
    expect(approve(gone.request, sig('bob', 'admin', 10_002)).changed).toBe(false);
  });

  it('refuses a signature that arrives after the window closed, even before expiry is recorded', () => {
    const late = approve(open(), sig('bob', 'admin', 10_500));
    expect(late.changed).toBe(false);
    expect(late.refusedBecause).toContain('expired');
  });

  it('lets only the requester withdraw', () => {
    expect(withdraw(open(), 'bob', 500).changed).toBe(false);
    const mine = withdraw(open(), 'alice', 500);
    expect(mine.changed).toBe(true);
    expect(mine.request.state).toBe('WITHDRAWN');
  });

  it('never mutates the request it was given', () => {
    const original = open();
    const snapshot = JSON.stringify(original);
    approve(original, sig('bob', 'admin'));
    reject(original, sig('carol', 'owner'));
    expireIfDue(original, 99_999);
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe('audit entries fit the table that already exists, and log refusals too', () => {
  it('writes an entry for a DENY exactly as it does for an ALLOW', () => {
    const denied = auditCapabilityDecision({
      decision: evaluateCapability({ capabilityId: 'evidence.export', actorId: 'u1', server: verdict('owner', 'RESTRICTED', true) }),
      projectId: 'p1', actorId: 'u1', accessLevel: 'RESTRICTED',
    });
    expect(denied.resultStatus).toBe('DENY');
    expect(denied.action).toBe('capability:evidence.export');
    expect(denied.workflow).toBe('governance:capability');
    expect(denied.details.basis).toBe('ACCESS_LEVEL_ABOVE_CEILING');

    const allowed = auditCapabilityDecision({
      decision: evaluateCapability({ capabilityId: 'evidence.read', actorId: 'u1', server: verdict('viewer', 'RESEARCH', false) }),
      projectId: 'p1', actorId: 'u1', accessLevel: 'RESEARCH',
    });
    expect(allowed.resultStatus).toBe('ALLOW');
    expect(Object.keys(allowed).sort()).toEqual(Object.keys(denied).sort());
  });

  it('records who signed, in sourceIds, so the first audit question needs no join', () => {
    const capability = getCapability('evidence.admit-real-measurement')!;
    let r = openApprovalRequest({
      requestId: 'req-9', capability, projectId: 'p1', requesterId: 'alice',
      justification: 'bench replicate', now: 0, validForMs: 10_000,
    });
    r = approve(r, sig('bob', 'admin')).request;
    r = approve(r, sig('carol', 'owner', 1_200)).request;

    const entry = auditApprovalEvent({ request: r, event: 'approved', actorId: 'carol', accessLevel: 'RESTRICTED' });
    expect(entry.sourceIds).toEqual(['req-9', 'bob', 'carol']);
    expect(entry.resultStatus).toBe('APPROVED');
    expect(entry.details.requesterId).toBe('alice');
    expect(entry.details.approvalsCollected).toBe(2);
    expect(entry.details.approvalsRequired).toBe(2);
  });

  it('carries the justification, and never the governed payload', () => {
    const capability = getCapability('evidence.export')!;
    const r = openApprovalRequest({
      requestId: 'req-3', capability, projectId: 'p1', requesterId: 'alice',
      justification: 'Regulator requested the bundle for file 2026-114.', now: 0, validForMs: 5_000,
    });
    const entry = auditApprovalEvent({ request: r, event: 'opened', actorId: 'alice', accessLevel: 'RESEARCH' });
    expect(entry.details.justification).toContain('2026-114');
    expect(payloadLikeKeys(entry)).toEqual([]);

    const decisionEntry = auditCapabilityDecision({
      decision: evaluateCapability({ capabilityId: 'evidence.export', actorId: 'alice', server: verdict('editor', 'RESEARCH', true) }),
      projectId: 'p1', actorId: 'alice', accessLevel: 'RESEARCH', approvalRequestId: 'req-3',
    });
    expect(payloadLikeKeys(decisionEntry)).toEqual([]);
    expect(decisionEntry.sourceIds).toEqual(['req-3']);
  });

  it('leaves id, userId and createdAt to the server, so a caller cannot forge or backdate', () => {
    const entry = auditCapabilityDecision({
      decision: evaluateCapability({ capabilityId: 'evidence.read', actorId: 'u1', server: verdict('viewer', 'PUBLIC', true) }),
      projectId: 'p1', actorId: 'u1', accessLevel: 'PUBLIC',
    });
    expect('id' in entry).toBe(false);
    expect('userId' in entry).toBe(false);
    expect('createdAt' in entry).toBe(false);
  });
});

describe('the foundation stays a foundation', () => {
  it('imports nothing that authenticates, stores or renders', async () => {
    // The module graph is the contract: if this ever pulls in session state,
    // storage or React, it has stopped being a foundation C3 can wire freely.
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../core/governance/', import.meta.url).pathname;
    for (const file of readdirSync(dir)) {
      const raw = readFileSync(`${dir}${file}`, 'utf8');
      // Strip comments first: these files DISCUSS Date.now() and storage in
      // their doc blocks precisely to explain why they do not use them, and a
      // naive scan would flag the explanation as the violation.
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/session|storage|react|scienceMemory/i);
      }
      // Real clocks and randomness would make the reducer untestable and let two
      // callers disagree about "now".
      expect(src, file).not.toContain('Date.now()');
      expect(src, file).not.toContain('Math.random()');
    }
  });
});
