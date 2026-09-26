/**
 * Drug Discovery Scientific Integration (Work Item 4) — thin coordinator over
 * the EXISTING campaign/compute pipeline. It adds no second molecular
 * engine, no second persistence layer, no second executor.
 *
 * Audit before writing anything (per instruction): `campaign/multiFidelity.mjs`
 * already implements the full CHEAP -> DOCKING -> QM -> ADMET staged
 * pipeline on real engines (RDKit, AutoDock Vina + Meeko, PySCF, ADMET-AI),
 * each fail-closed via `toolchain.mjs::capabilityAvailable` (BLOCKED_BY_RUNTIME,
 * never a fabricated result); `evidenceClass: 'COMPUTATIONAL'|'MODEL_ESTIMATE'`
 * already classifies evidence; `detectDescriptorDockingConflict` already
 * detects and persists real cross-engine `MODEL_CONFLICT`s (conflicting
 * evidence); `admetToxicityStage` already rejects candidates on a real
 * `TOXICITY_FILTER_REJECTED`/`ADMET_FILTER_REJECTED` threshold violation
 * (a real safety veto — D-069's own rule is that predictions may only
 * reject a candidate, never rank one in); `validationGate.mjs` already
 * provides a frozen, tamper-detecting research gate; `buildScientificComputeReport`
 * already assembles a per-campaign candidate/run/replay report. None of that
 * is reimplemented here.
 *
 * What was genuinely missing, and is the only thing this file adds:
 *  1. `candidateIdentityGuard` — an EXPLICIT, reusable pre-check (the same
 *     RDKit-backed `drugAdapter.mjs::canonicalize` every generated candidate
 *     already goes through inside `orchestrator.mjs::makeCandidateRecord`,
 *     just not exposed as its own named guard a caller can run before a
 *     candidate ever reaches persistence).
 *  2. `researchGateVerdict` / `buildCandidateResearchMatrix` — a synthesis,
 *     read entirely from ALREADY-persisted campaign events (never
 *     recomputed), of whether a specific candidate may be granted research
 *     priority: DENIED on any safety veto or ADMET rejection, HELD on an
 *     unresolved cross-engine conflict, ELIGIBLE only when none of those
 *     apply AND safety was actually assessed. This is the "candidate
 *     matrix" + "research gate" Work Item 4 asks for, built on top of
 *     `buildScientificComputeReport` rather than beside it.
 */
import * as store from './persistence.mjs';
import * as adapter from './drugAdapter.mjs';
import { buildScientificComputeReport } from './multiFidelity.mjs';
import { loadValidationGate } from './validationGate.mjs';

export const SCIENTIFIC_INTEGRATION_CONTRACT_VERSION = '1.0.0';

/**
 * Real, minimal identity guard. BLOCKED (never a thrown exception for an
 * expected bad-input case) when a candidate declares no structural identity
 * at all, or declares a SMILES string that the existing RDKit-backed
 * `canonicalize()` cannot parse. This is the SAME canonicalization every
 * generated candidate already passes through inside
 * `orchestrator.mjs::makeCandidateRecord` — no new chemistry, no new parser.
 */
export function candidateIdentityGuard(candidate) {
  if (!candidate || (typeof candidate.smiles !== 'string' && typeof candidate.formula !== 'string')) {
    return { ok: false, status: 'BLOCKED', reason: 'IDENTITY_MISSING', message: 'Candidate declares neither smiles nor formula.' };
  }
  if (typeof candidate.smiles === 'string' && candidate.smiles.trim() !== '') {
    let canon;
    try {
      canon = adapter.canonicalize(candidate.smiles);
    } catch (err) {
      return { ok: false, status: 'FAILED', reason: 'IDENTITY_GUARD_ENGINE_ERROR', message: String(err?.message ?? err) };
    }
    if (!canon.ok) {
      return { ok: false, status: 'BLOCKED', reason: 'IDENTITY_UNPARSEABLE', message: `SMILES does not canonicalize: ${canon.reason ?? canon.error}` };
    }
    return { ok: true, status: 'OK', canonicalSmiles: canon.canonicalSmiles };
  }
  return { ok: true, status: 'OK', canonicalSmiles: null };
}

const SAFETY_STAGE_TYPES = new Set(['STAGE_SELECTION', 'STAGE_RESULT']);

/**
 * Real research-gate synthesis over ALREADY-persisted campaign events for
 * one candidate — no recomputation, no new engine call. Every branch names
 * a real, disclosed reason; there is no default "eligible" outcome reached
 * without an explicit check.
 */
export function researchGateVerdict(db, campaignId, candidateId) {
  const events = store.listEvents(db, campaignId).filter((e) => SAFETY_STAGE_TYPES.has(e.type) && e.payload?.candidateId === candidateId);
  const toxicityRejections = events.filter((e) => e.payload?.reason === 'TOXICITY_FILTER_REJECTED');
  const admetRejections = events.filter((e) => e.payload?.reason === 'ADMET_FILTER_REJECTED');
  const admetExecuted = events.some((e) => e.payload?.reason === 'ADMET_COMPUTED');
  const conflicts = store.listEvents(db, campaignId).filter((e) => e.type === 'MODEL_CONFLICT' && e.payload?.candidateId === candidateId);

  if (toxicityRejections.length > 0) {
    return {
      verdict: 'RESEARCH_PRIORITY_DENIED', reason: 'SAFETY_VETO',
      message: 'A toxicity endpoint threshold was violated for this candidate — research priority withheld regardless of every other score.',
      events: toxicityRejections,
    };
  }
  if (!admetExecuted) {
    return {
      verdict: 'RESEARCH_PRIORITY_DENIED', reason: 'SAFETY_UNASSESSED',
      message: 'ADMET/toxicity has not been executed for this candidate — safety is unassessed, so research priority cannot be granted.',
      events: [],
    };
  }
  if (conflicts.length > 0) {
    return {
      verdict: 'RESEARCH_PRIORITY_HELD', reason: 'UNRESOLVED_MODEL_CONFLICT',
      message: 'A cross-engine MODEL_CONFLICT was recorded for this candidate and has not been resolved by additional computation.',
      events: conflicts,
    };
  }
  if (admetRejections.length > 0) {
    return {
      verdict: 'RESEARCH_PRIORITY_DENIED', reason: 'ADMET_FILTER_REJECTED',
      message: 'An ADMET threshold was violated for this candidate.',
      events: admetRejections,
    };
  }
  return {
    verdict: 'RESEARCH_PRIORITY_ELIGIBLE', reason: 'NO_SAFETY_BLOCKER_FOUND',
    message: 'No safety veto, unresolved conflict, or ADMET rejection was found in the persisted campaign record for this candidate. This is a computational research-priority ranking only — never an efficacy or safety claim.',
    events: [],
  };
}

/**
 * The candidate matrix: the existing per-campaign scientific-compute report
 * (`multiFidelity.mjs::buildScientificComputeReport`, unchanged) plus one
 * `researchGateVerdict` per candidate — the one synthesis this file adds.
 */
export function buildCandidateResearchMatrix(db, campaignId) {
  const report = buildScientificComputeReport(db, campaignId);
  if (!report) return null;
  const researchGate = report.candidateIds.map((candidateId) => ({ candidateId, gate: researchGateVerdict(db, campaignId, candidateId) }));
  return { ...report, contractVersion: SCIENTIFIC_INTEGRATION_CONTRACT_VERSION, researchGate };
}

/**
 * Optional frozen validation-gate check — delegates entirely to the existing
 * `validationGate.mjs::loadValidationGate` (fail-closed, tamper-detecting).
 * Never fabricates a pass when no gate file is configured; callers that do
 * not need a frozen gate simply do not call this.
 */
export function checkResearchValidationGate(gatePath, options) {
  return loadValidationGate(gatePath, options);
}
