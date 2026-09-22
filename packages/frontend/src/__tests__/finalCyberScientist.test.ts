import { describe, expect, it } from 'vitest';
import {
  advanceFindingStatus,
  assertApprovalBeforePatch,
  assertAuthorizedScope,
  checkCyberBudget,
  isAuthorizedScope,
  PatchNotApprovedError,
  type CyberBudgetUsage,
  type CyberCampaignBudget,
  type CyberFindingStatus,
  type RemediationAction,
} from '../core/agent/cyberInvestigation';
import { selectNextTest, type CyberTestCandidate } from '../core/agent/cyberTestPlanner';
import type { HypothesisAssessment } from '../core/experimentFabric/scientificDiscovery';

describe('cyber scope allowlist', () => {
  it('accepts exactly the three allowed scopes', () => {
    for (const scope of ['REPOSITORY_ONLY', 'SANDBOX_RANGE', 'CI_EPHEMERAL']) {
      expect(isAuthorizedScope(scope)).toBe(true);
      expect(assertAuthorizedScope(scope).ok).toBe(true);
    }
  });

  it('rejects any scope outside the allowlist, never widening it', () => {
    for (const scope of ['INTERNET_WIDE', 'PRODUCTION', 'ANY']) {
      expect(isAuthorizedScope(scope)).toBe(false);
      expect(assertAuthorizedScope(scope).ok).toBe(false);
    }
  });
});

describe('cyber budget enforcement', () => {
  const budget: CyberCampaignBudget = { maxHypotheses: 3, maxAnalyzerRuns: 5, maxPatchProposals: 2 };

  it('reports ok when under every limit', () => {
    const usage: CyberBudgetUsage = { hypothesesGenerated: 1, analyzerRunsExecuted: 1, patchProposalsCreated: 0 };
    expect(checkCyberBudget(usage, budget).ok).toBe(true);
  });

  it('reports the exact exceeded dimensions, never a generic failure', () => {
    const usage: CyberBudgetUsage = { hypothesesGenerated: 3, analyzerRunsExecuted: 1, patchProposalsCreated: 2 };
    const result = checkCyberBudget(usage, budget);
    expect(result.ok).toBe(false);
    expect(result.exceeded).toContain('maxHypotheses');
    expect(result.exceeded).toContain('maxPatchProposals');
    expect(result.exceeded).not.toContain('maxAnalyzerRuns');
  });
});

describe('cyber test planner — budget-aware selection (Work Item 5), backward compatible', () => {
  const candidates: CyberTestCandidate[] = [
    { hypothesisId: 'h1', discriminationPower: 0.8, safety: 'SAFE', cost: 0.1, downstreamValue: 0.9, identityKind: 'NEW', priorAttempts: 0 },
    { hypothesisId: 'h2', discriminationPower: 0.5, safety: 'SAFE', cost: 0.1, downstreamValue: 0.3, identityKind: 'NEW', priorAttempts: 0 },
  ];
  const assessments = new Map<string, HypothesisAssessment>([
    ['h1', 'CANDIDATE'],
    ['h2', 'CANDIDATE'],
  ]);

  it('the existing 2-argument call still works unchanged (no budgetContext)', () => {
    const selection = selectNextTest(candidates, assessments);
    expect(selection.selectedHypothesisId).toBe('h1');
  });

  it('selects normally when under budget', () => {
    const budgetContext = { budget: { maxHypotheses: 5, maxAnalyzerRuns: 5, maxPatchProposals: 5 }, usage: { hypothesesGenerated: 1, analyzerRunsExecuted: 0, patchProposalsCreated: 0 } };
    const selection = selectNextTest(candidates, assessments, budgetContext);
    expect(selection.selectedHypothesisId).toBe('h1');
  });

  it('refuses to select a NEW hypothesis once maxHypotheses is reached', () => {
    const budgetContext = { budget: { maxHypotheses: 1, maxAnalyzerRuns: 5, maxPatchProposals: 5 }, usage: { hypothesesGenerated: 1, analyzerRunsExecuted: 0, patchProposalsCreated: 0 } };
    const selection = selectNextTest(candidates, assessments, budgetContext);
    expect(selection.selectedHypothesisId).toBeNull();
    expect(selection.whySelected).toMatch(/budżet maxHypotheses/);
  });

  it('still allows a REPEAT/replication of an already-started hypothesis past the maxHypotheses cap', () => {
    const inProgress: CyberTestCandidate[] = [
      { hypothesisId: 'h1', discriminationPower: 0.8, safety: 'SAFE', cost: 0.15, downstreamValue: 0.9, identityKind: 'INDEPENDENT_REPLICATION', priorAttempts: 1 },
    ];
    const budgetContext = { budget: { maxHypotheses: 1, maxAnalyzerRuns: 5, maxPatchProposals: 5 }, usage: { hypothesesGenerated: 1, analyzerRunsExecuted: 0, patchProposalsCreated: 0 } };
    const selection = selectNextTest(inProgress, new Map([['h1', 'SUPPORTED_WITHIN_PROTOCOL' as HypothesisAssessment]]), budgetContext);
    expect(selection.selectedHypothesisId).toBe('h1');
  });
});

const remediation: RemediationAction = { remediationId: 'rem-1', targetAssetId: 'asset-1', description: 'fix auth check' };

describe('assertApprovalBeforePatch — no patch application before approval', () => {
  it('throws PatchNotApprovedError when there is no approval record at all', () => {
    expect(() => assertApprovalBeforePatch(remediation, null)).toThrow(PatchNotApprovedError);
  });

  it('throws when the approval decision is REJECTED', () => {
    const approval = { remediationId: 'rem-1', decidedBy: 'reviewer-1', decidedAt: '2026-01-01T00:00:00Z', decision: 'REJECTED' as const };
    expect(() => assertApprovalBeforePatch(remediation, approval)).toThrow(PatchNotApprovedError);
  });

  it('throws when the approval names a different remediationId — the exact mismatch bug this file already warns about elsewhere', () => {
    const approval = { remediationId: 'rem-999', decidedBy: 'reviewer-1', decidedAt: '2026-01-01T00:00:00Z', decision: 'APPROVED' as const };
    expect(() => assertApprovalBeforePatch(remediation, approval)).toThrow(PatchNotApprovedError);
  });

  it('does not throw for a matching, APPROVED record', () => {
    const approval = { remediationId: 'rem-1', decidedBy: 'reviewer-1', decidedAt: '2026-01-01T00:00:00Z', decision: 'APPROVED' as const };
    expect(() => assertApprovalBeforePatch(remediation, approval)).not.toThrow();
  });
});

describe('advanceFindingStatus — finding lifecycle state machine', () => {
  it('allows OPEN -> PATCH_PROPOSED', () => {
    const t = advanceFindingStatus('OPEN', 'PATCH_PROPOSED');
    expect(t.ok).toBe(true);
    expect(t.next).toBe('PATCH_PROPOSED');
  });

  it('allows PATCH_PROPOSED -> RETEST_PASS and PATCH_PROPOSED -> RETEST_FAIL', () => {
    expect(advanceFindingStatus('PATCH_PROPOSED', 'RETEST_PASS').ok).toBe(true);
    expect(advanceFindingStatus('PATCH_PROPOSED', 'RETEST_FAIL').ok).toBe(true);
  });

  it('allows RETEST_FAIL -> PATCH_PROPOSED (a second attempt)', () => {
    expect(advanceFindingStatus('RETEST_FAIL', 'PATCH_PROPOSED').ok).toBe(true);
  });

  it('rejects OPEN -> RETEST_PASS — skipping the patch step entirely', () => {
    const t = advanceFindingStatus('OPEN', 'RETEST_PASS');
    expect(t.ok).toBe(false);
    expect(t.next).toBeNull();
    expect(t.reason).toContain('OPEN -> RETEST_PASS');
  });

  it('rejects any transition out of the terminal RETEST_PASS state', () => {
    const terminal: CyberFindingStatus = 'RETEST_PASS';
    for (const next of ['OPEN', 'PATCH_PROPOSED', 'RETEST_FAIL'] as const) {
      expect(advanceFindingStatus(terminal, next).ok).toBe(false);
    }
  });
});
