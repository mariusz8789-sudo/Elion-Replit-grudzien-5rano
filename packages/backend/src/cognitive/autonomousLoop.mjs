/**
 * Autonomous Discovery Loop (Genesis V4, Phase 5). One call runs the end-to-end loop:
 *   1 fetch new publications → 2 update knowledge graph → 3 find targets → 4 design molecules →
 *   5 docking → 6 ADMET → 7 off-target → 8 MD → 9 MM-GBSA → 10 ranking → 11 report.
 *
 * Steps 4–11 are executed by the real discoveryCampaignV2 pipeline (RDKit/ADMET/off-target/Vina +
 * MD/MM-GBSA capability-gated + Truth/MCRE + provenance knowledge graph). Steps that need live
 * external data (fetch publications, find NEW targets from the literature) are egress-blocked here
 * and honestly report BLOCKED_BY_RUNTIME — the loop then proceeds on the supplied evidence/targets.
 * A multi-agent panel + a laboratory-readiness hand-off + an audience report close the loop.
 *
 * HONESTY: no external data is fetched or fabricated; blocked steps are recorded, not simulated.
 */
import { runDiscoveryCampaignV2 } from './discoveryCampaignV2.mjs';
import { runAgentPanel } from './multiAgent.mjs';
import { buildLaboratoryReadiness } from './laboratoryReadiness.mjs';
import { generateScientificReports } from '../validation/scientificReports.mjs';

export const AUTONOMOUS_LOOP_VERSION = 'genesis-autonomous-loop/1';

export function defaultDeps() {
  return {
    fetchPublications: () => ({ status: 'BLOCKED_BY_RUNTIME', reason: 'live literature retrieval (PubMed/Europe PMC) egress-blocked — supply an offline bundle; nothing fabricated' }),
    findTargets: ({ targetHypotheses }) => (Array.isArray(targetHypotheses) && targetHypotheses.length ? { status: 'SUPPLIED', targets: targetHypotheses.length } : { status: 'BLOCKED_BY_RUNTIME', reason: 'automated target discovery needs live external data (egress-blocked); supply target hypotheses' }),
    runCampaign: (o) => runDiscoveryCampaignV2(o),
    runAgentPanel,
    buildLaboratoryReadiness,
    generateReports: (ctx) => generateScientificReports(ctx),
  };
}

/**
 * Run one full autonomous iteration. opts flow to the campaign; deps are injectable for testing.
 */
export function runAutonomousLoop(opts = {}) {
  const { deps = defaultDeps(), meta = {}, ...campaignOpts } = opts;
  const steps = [];
  const mark = (step, status, detail) => steps.push({ step, status, ...(detail ? { detail } : {}) });

  // 1) Fetch new publications (external — blocked here).
  const pubs = deps.fetchPublications(campaignOpts);
  mark('FETCH_PUBLICATIONS', pubs.status, pubs.reason);

  // 3) Find targets (from supplied hypotheses, or blocked).
  const targets = deps.findTargets(campaignOpts);
  mark('FIND_TARGETS', targets.status, targets.reason ?? `${targets.targets ?? 0} supplied`);

  // 4–11) Design → dock → ADMET → off-target → MD → MM-GBSA → ranking → (2) knowledge graph.
  const campaign = deps.runCampaign(campaignOpts);
  for (const s of campaign.stages ?? []) mark(s.stage, s.status, s.detail);
  if (campaign.status !== 'COMPLETED' || !campaign.dossier) {
    return { version: AUTONOMOUS_LOOP_VERSION, status: campaign.status ?? 'FAILED', steps, dossier: null, didGenesisDiscoverADrug: 'NO' };
  }

  // Multi-agent review of the real dossier.
  const agentPanel = deps.runAgentPanel(campaign.dossier);
  mark('MULTI_AGENT_REVIEW', agentPanel.status, agentPanel.consensus?.verdict);

  // Laboratory-readiness hand-off for the top-ranked candidate.
  const top = campaign.dossier.candidates?.[0];
  const labReadiness = top ? deps.buildLaboratoryReadiness({ smiles: top.structure, admetPredictions: top.admet?.predictions, rationale: top.rationale }) : { status: 'NO_CANDIDATE' };
  mark('LABORATORY_READINESS', labReadiness.status, top ? top.structure : null);

  // 11) Report.
  const report = deps.generateReports({ dossier: campaign.dossier, meta });
  mark('REPORT', 'GENERATED', 'Research/Biotech/Pharma/Grant');

  return {
    version: AUTONOMOUS_LOOP_VERSION, status: 'COMPLETED', steps,
    externalBlocked: steps.filter((s) => s.status === 'BLOCKED_BY_RUNTIME' || s.status === 'BLOCKED_BY_RESOURCES').map((s) => s.step),
    dossier: campaign.dossier, agentPanel, labReadiness, report,
    didGenesisDiscoverADrug: 'NO',
    honesty: 'Executable steps ran on real engines; external-data steps are BLOCKED_BY_RUNTIME (egress) and were not simulated. No drug discovered.',
  };
}
