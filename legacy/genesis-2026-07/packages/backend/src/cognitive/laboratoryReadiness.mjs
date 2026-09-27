/**
 * Laboratory Readiness (Genesis V4, Phase 6). For a chosen best candidate, assembles a lab-facing
 * dossier from REAL computed data: structure, SMILES, InChI + InChIKey (RDKit), mass + physchem
 * properties (RDKit), predicted off-target proteins + risks (ADMET-AI), a computational rationale,
 * and PROPOSED in-vitro / in-vivo assay panels + a clinical-development outline.
 *
 * HONESTY: every experimental element is a PROPOSAL, explicitly labelled, derived deterministically
 * from computational predictions — NOT a validated result, a recommendation to dose humans, or a
 * claim of efficacy/safety. Off-target/ADMET are MODEL_INFERRED. Nothing is fabricated; missing
 * data (e.g. no ADMET) is stated. This is a hand-off for wet-lab scientists to design real studies.
 */
import { canonicalHash } from '../provenance.mjs';
import { predictOffTarget } from './offTarget.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';

export const LAB_READINESS_VERSION = 'genesis-lab-readiness/1';

export function defaultEngines() {
  return {
    rdkitDetect: () => rdkit.detect(),
    descriptors: (s) => rdkit.descriptors(s),
    inchi: (s) => rdkit.inchi(s),
    alerts: (s) => rdkit.structuralAlerts(s),
    predictOffTarget,
  };
}

function proposedInVitro(desc, offTarget) {
  const panel = [
    'Target biochemical / binding assay (SPR or ITC) to measure Kd/IC50 — computational only; binding is unassessed.',
    'Cell viability / cytotoxicity (e.g. MTT) across a dose range.',
    'Solubility (kinetic + thermodynamic) and logD measurement.',
    'Microsomal + hepatocyte metabolic stability (intrinsic clearance).',
    'Caco-2 / PAMPA permeability.',
  ];
  if (offTarget?.status === 'COMPLETED') {
    if (offTarget.toxicity?.some((t) => t.endpoint === 'hERG' && t.flag !== 'NONE')) panel.push('hERG patch-clamp assay (predicted cardiotoxicity liability).');
    for (const o of offTarget.offTargets?.filter((x) => x.flag === 'STRONG').slice(0, 4) ?? []) panel.push(`Counter-screen against ${o.protein} (${o.gene}) — predicted off-target.`);
  }
  if ((desc?.lipinskiViolations ?? 0) > 0) panel.push('Physicochemical profiling to address predicted developability liabilities.');
  return panel;
}

function proposedInVivo(offTarget) {
  const panel = [
    'Rodent single-dose pharmacokinetics (PK): Cmax, AUC, t½, clearance, bioavailability.',
    'Maximum tolerated dose (MTD) / dose-range-finding tolerability study.',
    'Efficacy in a validated disease model (only after in-vitro target engagement is confirmed).',
  ];
  if (offTarget?.risk === 'HIGH' || offTarget?.risk === 'MEDIUM') panel.push('Targeted safety pharmacology (cardiovascular / hepatic) given the predicted off-target/toxicity risk.');
  return panel;
}

/** Build the laboratory-readiness dossier for one candidate. `candidate`: { smiles, admetPredictions?, rationale? } */
export function buildLaboratoryReadiness(candidate, { engines = defaultEngines(), scientificQuestion = null } = {}) {
  if (!engines.rdkitDetect().available) return { status: 'BLOCKED_BY_RUNTIME', version: LAB_READINESS_VERSION, reason: 'RDKit unavailable' };
  const smiles = candidate?.smiles;
  if (!smiles) return { status: 'INVALID_INPUT', version: LAB_READINESS_VERSION, reason: 'candidate SMILES required' };
  const d = engines.descriptors(smiles);
  if (!d.ok) return { status: 'INVALID_STRUCTURE', version: LAB_READINESS_VERSION, reason: d.error };
  const ident = engines.inchi(smiles);
  const alerts = engines.alerts(smiles);
  const offTarget = candidate.admetPredictions ? engines.predictOffTarget(candidate.admetPredictions) : { status: 'BLOCKED_BY_RESOURCES', reason: 'no ADMET predictions supplied' };

  const dossier = {
    schema: 'genesis-laboratory-readiness/1', version: LAB_READINESS_VERSION,
    scientificQuestion,
    proposedStructure: { smiles: d.data.canonicalSmiles, molecularFormula: d.data.molecularFormula },
    identity: { smiles: d.data.canonicalSmiles, inchi: ident.ok ? ident.inchi : null, inchiKey: ident.ok ? ident.inchiKey : null },
    mass: { averageMolWt: d.data.molWt, exactMolWt: d.data.exactMolWt },
    properties: { logP: d.data.crippenLogP, tpsa: d.data.tpsa, hbd: d.data.hbd, hba: d.data.hba, rotatableBonds: d.data.rotatableBonds, aromaticRings: d.data.aromaticRings, fractionCsp3: d.data.fractionCsp3, lipinskiViolations: d.data.lipinskiViolations, lipinskiPass: d.data.lipinskiPass },
    structuralAlerts: alerts.ok ? alerts.alerts : null,
    predictedTargets: offTarget.status === 'COMPLETED'
      ? { epistemicStatus: 'MODEL_INFERRED', offTargetProteins: offTarget.offTargets.filter((o) => o.flag !== 'NONE').map((o) => ({ protein: o.protein, gene: o.gene, probability: o.probability, flag: o.flag })), source: offTarget.evidence?.source }
      : { status: offTarget.status, reason: offTarget.reason },
    risks: offTarget.status === 'COMPLETED'
      ? { overallOffTargetRisk: offTarget.risk, selectivity: offTarget.selectivity, toxicityFlags: offTarget.toxicity.filter((t) => t.flag !== 'NONE').map((t) => ({ liability: t.label, probability: t.probability })), epistemicStatus: 'MODEL_INFERRED' }
      : { status: offTarget.status },
    rationale: candidate.rationale ?? `Computationally prioritised structure (formula ${d.data.molecularFormula}, MW ${d.data.molWt}, ${d.data.lipinskiViolations} Lipinski violation(s), ${alerts.ok ? alerts.nAlerts : '?'} structural alert(s)). Selection is computational.`,
    proposedInVitroTests: proposedInVitro(d.data, offTarget),
    proposedInVivoTests: proposedInVivo(offTarget.status === 'COMPLETED' ? offTarget : {}),
    proposedClinicalPlan: {
      status: 'PROPOSAL_ONLY',
      note: 'A hypothetical development outline for planning discussion ONLY. Not medical advice, not a recommendation to dose humans, and contingent on successful preclinical validation + regulatory approval.',
      outline: ['IND-enabling toxicology + GLP safety package', 'Phase 0/I first-in-human safety + PK (only after preclinical validation)', 'Phase II proof-of-concept efficacy', 'Phase III confirmatory trials'],
    },
    epistemicStatus: 'COMPUTATIONAL_CANDIDATE',
    didGenesisDiscoverADrug: 'NO',
    honesty: 'All experimental items are PROPOSALS derived from computational predictions; no binding, activity, safety, or efficacy has been measured. Not a drug.',
  };
  dossier.readinessHash = canonicalHash({ ...dossier, readinessHash: undefined });
  return { status: 'COMPLETED', version: LAB_READINESS_VERSION, dossier };
}
