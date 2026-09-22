import type { ApprovalPort, CyberEvidencePort, PatchProposalPort, RetestPort } from "./ports.js";
import type { AuthorizedScope, SecurityCampaignBudget, SecurityCampaignState, SecurityFinding } from "./types.js";

export interface RemediationDeps {
  patches: PatchProposalPort;
  approvals: ApprovalPort;
  retest: RetestPort;
  evidence: CyberEvidencePort;
}

export class DefensiveRemediationLoop {
  constructor(private readonly deps: RemediationDeps) {}

  /**
   * FIX (red-team finding): V1 declared `SecurityCampaignBudget.maxPatchProposals` and
   * `SecurityCampaignState.patchProposals` but never read, checked, or incremented
   * either anywhere in src/ — the "bounded autonomous campaigns" claim did not actually
   * bound patch proposals. This method now requires the campaign `state` and `budget`,
   * checks the budget BEFORE proposing a patch, and increments `state.patchProposals`
   * on every real proposal, emitting `CYBER_PATCH_BUDGET_EXCEEDED` evidence and
   * returning `blocked:true` instead of proposing once the budget is exhausted.
   */
  async fixRetest(input: {
    campaignId: string;
    finding: SecurityFinding;
    scope: AuthorizedScope;
    state: SecurityCampaignState;
    budget: SecurityCampaignBudget;
  }): Promise<{ approved: boolean; blocked?: boolean; patchId?: string; retest?: "PASS" | "FAIL" }> {
    if (input.state.patchProposals >= input.budget.maxPatchProposals) {
      await this.deps.evidence.append({
        type: "CYBER_PATCH_BUDGET_EXCEEDED",
        campaignId: input.campaignId,
        payload: { findingId: input.finding.id, maxPatchProposals: input.budget.maxPatchProposals }
      });
      return { approved: false, blocked: true };
    }

    const proposal = await this.deps.patches.propose({ finding: input.finding, scope: input.scope });
    input.state.patchProposals += 1;
    await this.deps.evidence.append({ type: "CYBER_PATCH_PROPOSED", campaignId: input.campaignId, payload: proposal });

    const approved = await this.deps.approvals.approved({
      action: "APPLY_SECURITY_PATCH_IN_AUTHORIZED_WORKTREE",
      artifactId: proposal.patchId,
      scopeId: input.scope.scopeId
    });
    if (!approved) return { approved: false };

    const result = await this.deps.retest.retest({
      finding: input.finding,
      patchId: proposal.patchId,
      scope: input.scope
    });

    await this.deps.evidence.append({
      type: "CYBER_RETEST_COMPLETED",
      campaignId: input.campaignId,
      payload: { findingId: input.finding.id, patchId: proposal.patchId, result }
    });

    return { approved: true, patchId: proposal.patchId, retest: result.status };
  }
}
