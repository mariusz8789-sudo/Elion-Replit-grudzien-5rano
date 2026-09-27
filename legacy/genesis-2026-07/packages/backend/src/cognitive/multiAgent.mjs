/**
 * Multi-Agent Scientific AI (Genesis V4, Phase 4). A panel of domain-expert agents each analyses the
 * REAL campaign data from its perspective and emits a deterministic, evidence-grounded assessment +
 * recommendation. Agents cooperate by contributing to a shared consensus over the same dossier.
 *
 * HONESTY: open-ended LLM reasoning requires a live model, which is not configured here — so the
 * deep-reasoning layer of every agent is CAPABILITY_BLOCKED (recorded, never fabricated). What each
 * agent DOES produce is a rule-based reading of real computed outputs (docking, ADMET, off-target,
 * Truth Engine, MCRE, provenance) — genuine analysis, not invented expert opinion.
 */
export const MULTI_AGENT_VERSION = 'genesis-multi-agent/1';

export const AGENT_ROLES = Object.freeze([
  'MedicinalChemist', 'ComputationalChemist', 'StructuralBiologist', 'Toxicologist',
  'PKPDScientist', 'Bioinformatician', 'ClinicalStrategist', 'RegulatoryExpert', 'GrantWriter', 'ProjectManager',
]);

const num = (x) => (typeof x === 'number' ? x : null);

/** Each agent: (dossier) → { role, assessment, recommendation, concerns, reasoningStatus }. */
const AGENTS = {
  MedicinalChemist: (d) => {
    const alerts = (d.candidates ?? []).filter((c) => (c.structuralAlerts?.length ?? 0) > 0).length;
    const top = d.benchmark?.rankingTop10?.[0];
    return { assessment: `${d.benchmark?.candidatesSurviving ?? 0} survivors; ${alerts} carry structural alerts. Top-ranked ${top?.smiles ?? 'n/a'}.`, recommendation: alerts > 0 ? 'Triage structural alerts (PAINS/BRENK) before synthesis prioritisation.' : 'Proceed to synthesis-feasibility triage of the top survivors.', concerns: alerts > 0 ? ['structural-alert liabilities'] : [] };
  },
  ComputationalChemist: (d) => ({ assessment: `Docking ${d.summaries?.docking?.status ?? 'n/a'} (best ${d.summaries?.docking?.bestAffinityKcalMol ?? 'n/a'} kcal/mol, MODEL_ESTIMATE); MD ${d.summaries?.molecularDynamics?.status ?? 'n/a'}.`, recommendation: d.summaries?.molecularDynamics?.status === 'BLOCKED_BY_RUNTIME' ? 'Install a ligand force field to enable complex MD + MM-GBSA rescoring.' : 'Rescore top poses with MM-GBSA.', concerns: ['docking is an empirical estimate, not measured affinity'] }),
  StructuralBiologist: (d) => ({ assessment: `Binding-site method: ${d.summaries?.docking?.bindingSiteMethod ?? 'n/a'}. Target: ${d.primaryTarget ?? 'n/a'}.`, recommendation: (d.summaries?.docking?.bindingSiteMethod === 'BLIND_WHOLE_PROTEIN') ? 'Acquire a co-crystal structure to replace the blind box with a defined pocket.' : 'Confirm the pocket against an experimental holo structure.', concerns: [] }),
  Toxicologist: (d) => { const rd = d.summaries?.offTarget?.riskDistribution ?? {}; return { assessment: `Off-target risk (MODEL_INFERRED): HIGH ${rd.HIGH ?? 0}, MED ${rd.MEDIUM ?? 0}, LOW ${rd.LOW ?? 0} over ${d.summaries?.offTarget?.panelSize ?? '?'} proteins.`, recommendation: (rd.HIGH ?? 0) > 0 ? 'Counter-screen the HIGH-risk candidates (hERG/DILI/nuclear-receptor panel) before advancing.' : 'Standard tox counter-screen panel.', concerns: (rd.HIGH ?? 0) > 0 ? ['predicted severe toxicity liabilities'] : [] }; },
  PKPDScientist: () => ({ assessment: 'ADMET is MODEL_INFERRED; no measured PK. Metabolic-stability/permeability percentiles available per candidate.', recommendation: 'Measure microsomal stability + permeability for the top survivors to anchor the predictions.', concerns: ['no experimental PK'] }),
  Bioinformatician: (d) => ({ assessment: `Knowledge graph: ${d.knowledgeGraph?.stats?.nodes ?? 0} nodes / ${d.knowledgeGraph?.stats?.edges ?? 0} edges (provenance on every edge: ${d.knowledgeGraph?.stats?.allEdgesHaveProvenance ?? false}). Disease/pathway links require external DBs (egress-blocked).`, recommendation: 'Supply Open Targets / Reactome associations to enrich target-disease context.', concerns: ['no live biological-database access'] }),
  ClinicalStrategist: () => ({ assessment: 'No clinical or experimental validation exists; any clinical framing is a PROPOSAL only.', recommendation: 'Do not advance to clinical planning until preclinical target engagement + safety are experimentally demonstrated.', concerns: ['no validation'] }),
  RegulatoryExpert: (d) => ({ assessment: `Provenance is hash-verifiable; Truth-Engine gate ${d.truthEngineGate?.decision ?? 'n/a'}. GxP audit depth + IND-enabling package are out of scope.`, recommendation: 'Establish a GxP-grade audit trail + provenance signing before any regulatory interaction.', concerns: ['no GxP audit trail'] }),
  GrantWriter: (d) => ({ assessment: `Reproducible, provenance-backed computational pipeline with ${d.benchmark?.candidatesGenerated ?? 0} generated candidates and honest capability blocking.`, recommendation: 'Frame preliminary data around reproducibility + the integrated pipeline; state external dependencies plainly.', concerns: [] }),
  ProjectManager: (d) => { const blocked = d.benchmark?.blockedEngines ?? []; return { assessment: `Pipeline completed to ${d.campaign?.status ?? 'n/a'}. Blocked engines: ${blocked.join(', ') || 'none'}.`, recommendation: blocked.length ? `Prioritise unblocking: ${blocked.join(', ')}.` : 'Advance top survivors to the wet-lab hand-off (Laboratory Readiness).', concerns: blocked.length ? ['blocked capabilities gate progress'] : [] }; },
};

/** Run the multi-agent panel over a real campaign dossier. Reasoning is CAPABILITY_BLOCKED (no model). */
export function runAgentPanel(dossier, { roles = AGENT_ROLES, reasoningAvailable = false } = {}) {
  if (!dossier || typeof dossier !== 'object') return { status: 'INVALID_INPUT', version: MULTI_AGENT_VERSION, reason: 'campaign dossier required' };
  const agents = roles.filter((r) => AGENTS[r]).map((role) => {
    const out = AGENTS[role](dossier);
    return { role, ...out, reasoningStatus: reasoningAvailable ? 'COMPLETED' : 'CAPABILITY_BLOCKED', reasoningNote: reasoningAvailable ? null : 'open-ended reasoning needs a live model (not configured); the above is a rule-based reading of real computed data' };
  });
  const allConcerns = [...new Set(agents.flatMap((a) => a.concerns))];
  const highToxConcern = agents.find((a) => a.role === 'Toxicologist')?.concerns.length > 0;
  const consensus = {
    proceed: !highToxConcern && (num(dossier.benchmark?.candidatesSurviving) ?? 0) > 0,
    verdict: highToxConcern ? 'ADVANCE_WITH_TOX_COUNTERSCREEN' : ((num(dossier.benchmark?.candidatesSurviving) ?? 0) > 0 ? 'ADVANCE_TOP_SURVIVORS_TO_WETLAB' : 'INSUFFICIENT_CANDIDATES'),
    openConcerns: allConcerns,
    nextAction: 'Hand top survivors to Laboratory Readiness; address blocked capabilities + open concerns.',
  };
  return { status: 'COMPLETED', version: MULTI_AGENT_VERSION, reasoningLayer: reasoningAvailable ? 'AVAILABLE' : 'CAPABILITY_BLOCKED', agents, consensus, didGenesisDiscoverADrug: 'NO', honesty: 'Agents produce rule-based analysis of real computed data; open-ended expert reasoning is CAPABILITY_BLOCKED without a live model — never fabricated.' };
}
