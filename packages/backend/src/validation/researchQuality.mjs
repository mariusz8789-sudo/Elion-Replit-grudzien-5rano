/**
 * Research Quality validation (Phase 3 / Phase 4). Independently checks that a campaign Discovery
 * Dossier meets research-grade standards: confidence, remaining uncertainty, explainability, and —
 * critically — PROVENANCE INTEGRITY (the dossier's content hash recomputes exactly, every candidate
 * carries provenance). This is a validator, not a generator: it reports pass/fail per dimension and
 * never edits or fabricates the dossier.
 */
import { canonicalHash } from '../provenance.mjs';

export const RESEARCH_QUALITY_VERSION = 'genesis-research-quality/1';

/** Validate a `genesis-discovery-campaign-dossier/2` dossier. Returns { pass, score, checks }. */
export function validateResearchQuality(dossier) {
  const checks = [];
  const add = (dimension, pass, detail) => checks.push({ dimension, pass: Boolean(pass), detail });

  if (!dossier || typeof dossier !== 'object') {
    return { version: RESEARCH_QUALITY_VERSION, pass: false, score: 0, passedChecks: 0, totalChecks: 1, checks: [{ dimension: 'dossier', pass: false, detail: 'no dossier supplied' }] };
  }
  const candidates = Array.isArray(dossier.candidates) ? dossier.candidates
    : (Array.isArray(dossier.dockedCandidates) ? dossier.dockedCandidates : []);

  // 1) Provenance integrity — the content hash must recompute exactly (untampered + deterministic).
  if (dossier.dossierHash) {
    const recomputed = canonicalHash({ ...dossier, dossierHash: undefined, benchmarkExecutionMs: undefined });
    const hashOk = recomputed === dossier.dossierHash;
    add('provenance.integrity', hashOk, hashOk ? 'dossierHash recomputes exactly' : 'dossierHash MISMATCH — content changed or non-deterministic');
  } else add('provenance.integrity', false, 'no dossierHash present');

  // 2) Evidence + candidate provenance.
  add('provenance.evidence', Array.isArray(dossier.evidence?.provenance), `campaign evidence provenance ${Array.isArray(dossier.evidence?.provenance) ? 'present' : 'MISSING'}`);
  const candProv = candidates.length > 0 && candidates.every((c) => c.provenance && typeof c.provenance === 'object');
  add('provenance.candidates', candProv, candProv ? `all ${candidates.length} candidates carry provenance` : 'a candidate lacks provenance');

  // 3) Confidence.
  const confOk = candidates.length > 0 && candidates.every((c) => !Number.isNaN(Number(c.computationalConfidence)));
  add('confidence', confOk, confOk ? 'every candidate has a computationalConfidence' : 'a candidate lacks confidence');

  // 4) Uncertainty.
  const uncOk = Array.isArray(dossier.remainingUncertainty) && dossier.remainingUncertainty.length > 0;
  add('uncertainty', uncOk, uncOk ? `${dossier.remainingUncertainty.length} remaining-uncertainty statements` : 'no remainingUncertainty');

  // 5) Explainability.
  const explOk = candidates.length > 0 && candidates.every((c) => typeof c.rationale === 'string' && c.rationale.length > 0 && typeof c.nextExperiment === 'string' && Array.isArray(c.rejectedAlternatives));
  add('explainability', explOk, explOk ? 'every candidate has rationale + nextExperiment + alternatives' : 'a candidate lacks explainability fields');

  // 6) Honesty markers.
  const honestyOk = dossier.didGenesisDiscoverADrug === 'NO'
    && dossier.summaries?.admet?.epistemicStatus === 'MODEL_INFERRED'
    && dossier.summaries?.docking?.epistemicStatus === 'MODEL_ESTIMATE';
  add('honesty', honestyOk, honestyOk ? 'drug verdict NO; ADMET MODEL_INFERRED; docking MODEL_ESTIMATE' : 'honesty markers missing/incorrect');

  // 7) Experimental handoff.
  const recOk = Array.isArray(dossier.experimentalRecommendations) && dossier.experimentalRecommendations.length > 0;
  add('experimentalRecommendations', recOk, recOk ? `${dossier.experimentalRecommendations.length} recommendations` : 'no experimentalRecommendations');

  const passed = checks.filter((c) => c.pass).length;
  return { version: RESEARCH_QUALITY_VERSION, pass: passed === checks.length, score: +(passed / checks.length).toFixed(4), passedChecks: passed, totalChecks: checks.length, checks };
}
