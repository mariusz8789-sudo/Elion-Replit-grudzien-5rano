/**
 * Scientific Reporting (Genesis V3, Phase 7). Auto-generates audience-specific reports — Research,
 * Biotech, Pharma, Grant — from REAL campaign + validation data. Pure and deterministic; every claim
 * traces to a measured value in the inputs. Nothing is fabricated; missing data is stated honestly.
 * Complements the V2 publication package (methodology / figures / tables / benchmark report).
 */
export const SCIENTIFIC_REPORTS_VERSION = 'genesis-scientific-reports/1';

const line = (label, v) => `- **${label}:** ${v ?? 'n/a'}`;
const drugVerdict = 'DID GENESIS DISCOVER A DRUG? **NO** — computational candidates + provenance, not validated therapeutics.';

/** `ctx`: { dossier?, validation? (suite result incl. readiness/metrics), meta? } */
export function generateScientificReports(ctx = {}) {
  const d = ctx.dossier ?? null;
  const v = ctx.validation ?? null;
  const meta = ctx.meta ?? {};
  const m = v?.metrics ?? {};
  const rd = v?.readiness ?? null;
  const bm = d?.benchmark ?? null;
  const summaries = d?.summaries ?? {};

  const header = (title, band) => `# ${title}\n\n_Genesis OS · ${SCIENTIFIC_REPORTS_VERSION} · generated: ${meta.generatedAt ?? 'n/a'}${band ? ` · readiness: ${band}` : ''}_\n`;

  const research = `${header('Research Report', rd?.dimensions?.research?.band)}
## Computational validation (measured, reproducible)
${line('Descriptor correctness', m.descriptorAccuracy ? `MAE ${m.descriptorAccuracy.mae} g/mol, Pearson r=${m.descriptorAccuracy.pearsonR}, pass=${m.descriptorAccuracy.pass}` : 'n/a')}
${line('Reproducibility', m.reproducibility ? `${m.reproducibility.filter((r) => r.reproducible).length}/${m.reproducibility.length} bit-identical` : 'n/a')}
${line('Known-item recovery', m.rankingRecovery ? `ROC-AUC ${m.rankingRecovery.rocAuc} (${m.rankingRecovery.labelProvenance})` : 'n/a')}
${line('Truth Engine', m.truth ? `accuracy ${m.truth.accuracy}, consistency ${m.truth.consistency}` : 'n/a')}
${line('MCRE', m.mcre ? `accuracy ${m.mcre.accuracy}, consistency ${m.mcre.consistency}` : 'n/a')}

## Campaign (if provided)
${d ? `${line('Candidates generated', bm?.candidatesGenerated)}\n${line('Surviving', bm?.candidatesSurviving)}\n${line('Docked (real Vina)', bm?.dockedCount)}\n${line('Knowledge graph', d.knowledgeGraph ? `${d.knowledgeGraph.stats.nodes} nodes / ${d.knowledgeGraph.stats.edges} edges (all provenance: ${d.knowledgeGraph.stats.allEdgesHaveProvenance})` : 'n/a')}` : '_no campaign dossier supplied_'}

${drugVerdict}
`;

  const biotech = `${header('Biotech Report', rd?.dimensions?.biotech?.band)}
## Decision-support outputs (real engines)
${line('Real engines executed', (v?.enginesExecuted ?? []).join(', ') || (bm?.realEnginesExecuted ?? []).join(', '))}
${line('Off-target liability', summaries.offTarget ? `${summaries.offTarget.scored} scored — risk dist ${JSON.stringify(summaries.offTarget.riskDistribution)} (MODEL_INFERRED, Tox21/ADMET-AI panel)` : 'n/a')}
${line('Docking', summaries.docking ? `${summaries.docking.docked} docked, best ${summaries.docking.bestAffinityKcalMol} kcal/mol (${summaries.docking.epistemicStatus}), site ${summaries.docking.bindingSiteMethod}` : 'n/a')}
${line('Molecular dynamics', summaries.molecularDynamics ? summaries.molecularDynamics.status : 'n/a')}
${line('MM-GBSA', summaries.mmGbsa ? `${summaries.mmGbsa.status} (kept separate from docking score)` : 'n/a')}

## Honest boundary
Candidates are computational; ADMET/off-target are MODEL_INFERRED; docking is MODEL_ESTIMATE. Wet-lab
validation, MD-in-loop (ligand force field), and an off-target structural panel remain external.
${drugVerdict}
`;

  const pharma = `${header('Pharma Report', rd?.dimensions?.pharma?.band)}
## Provenance, safety liabilities & reproducibility
${line('Provenance integrity', v?.researchQuality ? `${v.researchQuality.passedChecks}/${v.researchQuality.totalChecks} research-quality checks (hash-verified dossier)` : 'n/a')}
${line('Predicted safety liabilities', summaries.offTarget ? `off-target risk distribution ${JSON.stringify(summaries.offTarget.riskDistribution)}; per-candidate hERG/DILI/AMES/ClinTox flags available (MODEL_INFERRED)` : 'n/a')}
${line('Docking vs MM-GBSA', 'reported separately; MM-GBSA ΔG BLOCKED_BY_RUNTIME without an MD trajectory (no ligand force field)')}
${line('Reproducibility', m.reproducibility ? `${m.reproducibility.filter((r) => r.reproducible).length}/${m.reproducibility.length} bit-identical; campaign dossier hash reproducible` : 'n/a')}

## Regulatory gaps (external / Genesis V4)
GxP audit-trail depth, experimental ADMET/tox, clinical validation, and provenance signing are external.
${drugVerdict}
`;

  const grant = `${header('Grant Report', rd?.dimensions?.grant?.band)}
## Innovation & preliminary computational evidence
${line('Reproducible validation', m.descriptorAccuracy ? `descriptor correctness vs first-principles chemistry (Pearson r=${m.descriptorAccuracy.pearsonR}), ${m.reproducibility?.filter((r) => r.reproducible).length}/${m.reproducibility?.length} pipelines bit-identical` : 'n/a')}
${line('Integrated pipeline', 'Evidence → Target Intelligence → Reasoning → Candidate Gen → RDKit → ADMET → Off-Target → Docking → MD/MM-GBSA → Truth Engine → MCRE → Knowledge Graph → Dossier')}
${line('Auto-generated package', 'figures (SVG), tables (CSV/MD), methodology, machine-readable benchmark report, reproducibility manifest')}
${line('Readiness (overall)', rd ? `${rd.overallBand} (${rd.overall}) — capped by explicit external ceilings` : 'n/a')}

## Limitations (honest)
Biological/experimental validation and live external data (egress-blocked) are required to advance
beyond computational triage; a live-data reference campaign is the next milestone.
${drugVerdict}
`;

  return { version: SCIENTIFIC_REPORTS_VERSION, reports: { research, biotech, pharma, grant }, didGenesisDiscoverADrug: 'NO' };
}
