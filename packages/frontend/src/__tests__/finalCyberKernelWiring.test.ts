import { describe, expect, it } from 'vitest';
import { runAdaptiveInvestigation, ToyVulnerableApp } from '../core/agent/cyberReasoningKernel';
import { PatchNotApprovedError, type CyberCampaignBudget, type HumanApprovalRecord } from '../core/agent/cyberInvestigation';

/**
 * D-141/Cyber Task 7: proves the three primitives (scope, budget, approval) are wired into the
 * REAL `runAdaptiveInvestigation` call sites in `cyberReasoningKernel.ts`, not just available as
 * unused library code — and that every existing 1-2 positional-arg call site keeps behaving
 * exactly as before (backward compatibility, the whole point of trailing optional parameters).
 */
describe('runAdaptiveInvestigation — backward compatibility (existing call sites unaffected)', () => {
  it('runs with zero new args exactly as before (no scope/budget/approval gate)', () => {
    const result = runAdaptiveInvestigation(new ToyVulnerableApp());
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it('runs with only maxSteps (the one existing 2-arg call site) exactly as before', () => {
    const result = runAdaptiveInvestigation(new ToyVulnerableApp(), 3);
    expect(result.steps.length).toBeLessThanOrEqual(3);
  });
});

describe('runAdaptiveInvestigation — scope gate is live', () => {
  it('accepts an authorized scope and runs normally', () => {
    expect(() => runAdaptiveInvestigation(new ToyVulnerableApp(), 5, 'REPOSITORY_ONLY')).not.toThrow();
  });

  it('throws immediately, before any observation, for an unauthorized scope', () => {
    expect(() => runAdaptiveInvestigation(new ToyVulnerableApp(), 5, 'INTERNET_WIDE')).toThrow(/nie jest na liście dozwolonych/);
  });
});

describe('runAdaptiveInvestigation — budget gate is live', () => {
  it('a very tight maxHypotheses cap measurably changes real kernel behavior (fewer hypotheses started)', () => {
    const unbounded = runAdaptiveInvestigation(new ToyVulnerableApp(), 20);
    const tightBudget: CyberCampaignBudget = { maxHypotheses: 1, maxAnalyzerRuns: 100, maxPatchProposals: 100 };
    const bounded = runAdaptiveInvestigation(new ToyVulnerableApp(), 20, undefined, tightBudget);

    const uniqueHypothesesUnbounded = new Set(unbounded.steps.map((s) => s.hypothesisId).filter(Boolean)).size;
    const uniqueHypothesesBounded = new Set(bounded.steps.map((s) => s.hypothesisId).filter(Boolean)).size;
    expect(uniqueHypothesesBounded).toBeLessThan(uniqueHypothesesUnbounded);
  });

  it('a generous budget behaves identically to no budget at all', () => {
    const generousBudget: CyberCampaignBudget = { maxHypotheses: 1000, maxAnalyzerRuns: 1000, maxPatchProposals: 1000 };
    const withBudget = runAdaptiveInvestigation(new ToyVulnerableApp(), 20, undefined, generousBudget);
    const withoutBudget = runAdaptiveInvestigation(new ToyVulnerableApp(), 20);
    expect(withBudget.steps.length).toBe(withoutBudget.steps.length);
    expect(withBudget.stopReason).toBe(withoutBudget.stopReason);
  });
});

describe('runAdaptiveInvestigation — human-approval gate is live', () => {
  it('with no approvals map supplied, remediation still applies immediately (unchanged default)', () => {
    const result = runAdaptiveInvestigation(new ToyVulnerableApp(), 20);
    const remediated = result.steps.some((s) => s.remediation !== null);
    expect(remediated).toBe(true);
  });

  it('with an approvals map supplied but the specific remediation missing from it, the kernel throws PatchNotApprovedError', () => {
    const emptyApprovals = new Map<string, HumanApprovalRecord>();
    expect(() => runAdaptiveInvestigation(new ToyVulnerableApp(), 20, undefined, undefined, emptyApprovals)).toThrow(PatchNotApprovedError);
  });

  it('a REJECTED approval record for the exact remediation still blocks it', () => {
    // Run once, unbounded, to discover the real remediationId this kernel actually produces.
    const probe = runAdaptiveInvestigation(new ToyVulnerableApp(), 20);
    const realRemediation = probe.steps.map((s) => s.remediation).find((r) => r !== null);
    expect(realRemediation).toBeTruthy();
    const rejecting = new Map<string, HumanApprovalRecord>([
      [realRemediation!.remediationId, { remediationId: realRemediation!.remediationId, decidedBy: 'reviewer-1', decidedAt: '2026-01-01T00:00:00Z', decision: 'REJECTED' }],
    ]);
    expect(() => runAdaptiveInvestigation(new ToyVulnerableApp(), 20, undefined, undefined, rejecting)).toThrow(PatchNotApprovedError);
  });

  it('a real APPROVED record for the exact remediationId lets the kernel apply it and complete', () => {
    const probe = runAdaptiveInvestigation(new ToyVulnerableApp(), 20);
    const realRemediation = probe.steps.map((s) => s.remediation).find((r) => r !== null);
    expect(realRemediation).toBeTruthy();
    const approving = new Map<string, HumanApprovalRecord>([
      [realRemediation!.remediationId, { remediationId: realRemediation!.remediationId, decidedBy: 'reviewer-1', decidedAt: '2026-01-01T00:00:00Z', decision: 'APPROVED' }],
    ]);
    const result = runAdaptiveInvestigation(new ToyVulnerableApp(), 20, undefined, undefined, approving);
    expect(result.steps.some((s) => s.remediation !== null)).toBe(true);
  });
});
