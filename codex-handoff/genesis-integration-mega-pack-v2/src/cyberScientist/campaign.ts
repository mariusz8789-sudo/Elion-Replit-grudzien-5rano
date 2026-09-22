import type {
  CyberEvidencePort,
  CyberMatrixPort,
  DefensiveAnalyzerPort,
  RepoInventoryPort,
  SecurityReportPort,
  ThreatModelPort
} from "./ports.js";
import type { SecurityCampaignBudget, SecurityCampaignState, SecurityReport } from "./types.js";
import { assertScopeSafe } from "./scope.js";

export interface CyberCampaignDeps {
  inventory: RepoInventoryPort;
  threatModel: ThreatModelPort;
  analyzers: DefensiveAnalyzerPort[];
  matrix: CyberMatrixPort;
  evidence: CyberEvidencePort;
  reports: SecurityReportPort;
}

/** Unchanged control flow from V1 (audit found the FIND/VALIDATE shape sound;
 * `maxHypotheses`/`maxAnalyzerRuns` were already correctly enforced here). The
 * `maxPatchProposals` gap the audit found is in the FIX stage, not here — see
 * remediation.ts. */
export class GenesisCyberScientist {
  constructor(private readonly deps: CyberCampaignDeps) {}

  async run(state: SecurityCampaignState, budget: SecurityCampaignBudget): Promise<SecurityReport> {
    assertScopeSafe(state.scope);
    await this.deps.evidence.append({ type: "CYBER_CAMPAIGN_STARTED", campaignId: state.campaignId, payload: state.scope });

    const inventory = await this.deps.inventory.inventory(state.scope);
    await this.deps.matrix.record({
      nodes: inventory.components.map((id) => ({ id, type: "COMPONENT", labels: [] })),
      edges: []
    });

    if (state.hypotheses.length === 0) {
      const proposed = await this.deps.threatModel.propose({
        scope: state.scope,
        inventory,
        existingFindings: state.findings
      });
      for (const h of proposed.slice(0, budget.maxHypotheses)) {
        state.hypotheses.push(h);
        await this.deps.evidence.append({ type: "CYBER_HYPOTHESIS_CREATED", campaignId: state.campaignId, payload: h });
      }
    }

    for (const hypothesis of state.hypotheses) {
      if (state.analyzerRuns >= budget.maxAnalyzerRuns) break;
      const analyzer = this.deps.analyzers.find((a) => a.supports(hypothesis));
      if (!analyzer) {
        hypothesis.status = "INCONCLUSIVE";
        continue;
      }

      const result = await analyzer.run({ scope: state.scope, hypothesis });
      state.analyzerRuns += 1;
      hypothesis.status = result.hypothesisStatus;
      hypothesis.evidenceRefs.push(...result.evidence.map((e) => e.id));

      await this.deps.evidence.append({
        type: "CYBER_ANALYZER_RUN",
        campaignId: state.campaignId,
        payload: { analyzerId: analyzer.id, hypothesisId: hypothesis.id, evidence: result.evidence }
      });

      if (result.finding) {
        state.findings.push(result.finding);
        await this.deps.evidence.append({
          type: "CYBER_FINDING_RECORDED",
          campaignId: state.campaignId,
          payload: result.finding
        });
      }
    }

    state.status = "COMPLETE";
    const report: SecurityReport = {
      campaignId: state.campaignId,
      findings: structuredClone(state.findings),
      hypotheses: structuredClone(state.hypotheses),
      summary: `Defensive campaign completed with ${state.findings.length} findings and ${state.analyzerRuns} analyzer runs.`,
      evidenceRefs: [...new Set(state.findings.flatMap((x) => x.evidenceRefs))]
    };
    await this.deps.reports.publish(report);
    await this.deps.evidence.append({ type: "CYBER_CAMPAIGN_COMPLETED", campaignId: state.campaignId, payload: report });
    return report;
  }
}
