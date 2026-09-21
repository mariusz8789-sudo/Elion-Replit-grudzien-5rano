/**
 * D-110 — LOWER_HARM (A2) external trial-evidence acceptance gate.
 *
 * WHY THIS EXISTS. `a2OzempicSubstitute.ts`'s real funnel is one observation
 * short for its current TOP2 favourite (Liraglutide: 2 real trial-derived
 * efficacy observations against the frozen `MINIMUM_OBSERVATIONS = 3` in
 * `agent/practicalCandidateGate.ts` — see `docs/DECISIONS.md` D-109's
 * roadmap). External sources (a human, or an agent searching public
 * ClinicalTrials.gov/ChEMBL records) may supply a new trial record for an
 * ALREADY-PINNED, already mechanism-qualified A2 candidate. This module is
 * the HARD, FAIL-CLOSED gate an incoming package must clear before its bytes
 * are ever written into the pipeline's supplemental evidence file — never
 * the base pin, which this module has no path to modify at all.
 *
 * WHAT THIS MODULE DOES NOT DO. It does not compute efficacy, does not
 * decide DIRECT_HEAD_TO_HEAD vs NAIVE_INDIRECT, does not touch
 * `MINIMUM_OBSERVATIONS`, `A2_PREREGISTRATION`, or any Winner Gate rule. All
 * of that stays exactly where it already lives — `a2OzempicSubstitute.ts`'s
 * `extractCandidateEfficacy`/`extractCandidateSafety` run UNMODIFIED over
 * whatever bytes this gate accepts. This module only decides whether the
 * incoming bytes are real, provenanced, on-target, and not already present
 * — never whether they are scientifically favourable.
 *
 * FROZEN VALUES DUPLICATED HERE, ON PURPOSE, WITH A TRIPWIRE. A `.mjs`
 * backend module cannot import a `.ts` frontend module at runtime (same
 * boundary `giprQsar.mjs`'s header describes for `MINIMUM_OBSERVATIONS`).
 * Unlike that case, esbuild-bundling a `.node.ts` facade for two frozen
 * string literals would be more new machinery than the values are worth, so
 * `TRIAL_EVIDENCE_POPULATION` and `REQUIRE_POSTED_RESULTS` are duplicated
 * here as plain constants instead — and
 * `a2TrialEvidenceGate.crossCheck.test.ts` (frontend) parses
 * `a2OzempicSubstitutePreregistration.ts`'s own source TEXT (not its
 * runtime value) to assert these two literals still appear there verbatim,
 * so drift between the two copies fails a test rather than passing silently.
 */

import { createHash } from 'node:crypto';

/** Mirrors A2_PREREGISTRATION.candidateInclusion.trialEvidence.population — see this file's header. */
export const TRIAL_EVIDENCE_POPULATION = ['Type 2 Diabetes', 'Obesity'];
/** Mirrors A2_PREREGISTRATION.candidateInclusion.trialEvidence.requirePostedResults — see this file's header. */
export const REQUIRE_POSTED_RESULTS = true;

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Every rejection this gate can produce, each a DISTINCT code — never a
 * shared "INVALID" bucket a caller would have to string-match to act on.
 */
export const REJECTION_CODES = Object.freeze([
  'MANIFEST_MALFORMED',
  'HASH_MISMATCH',
  'STUDY_JSON_UNPARSEABLE',
  'MISSING_NCT_ID',
  'NCT_ID_MISMATCH',
  'UNKNOWN_CANDIDATE',
  'A1_EVIDENCE_REJECTED',
  'DUPLICATE_OBSERVATION',
  'POPULATION_MISMATCH',
  'RESULTS_NOT_POSTED',
  'NO_USABLE_OUTCOME',
  'MISSING_PROVENANCE',
]);

function fail(code, reason) {
  return Object.freeze({ ok: false, code, reason });
}

/**
 * D-112 — population matching by TOKEN SUBSET, not substring.
 *
 * THE DEFECT THIS REPLACES. The first version asked whether a condition
 * string CONTAINS the population string. ClinicalTrials.gov states
 * conditions in MeSH canonical form — "Diabetes Mellitus, Type 2" — which
 * does not contain the substring "type 2 diabetes", so the gate rejected a
 * real, fully-qualifying type-2-diabetes trial (NCT00318461/LEAD-2) with
 * POPULATION_MISMATCH. That was a false negative against essentially every
 * record that uses standard MeSH naming, i.e. most of ClinicalTrials.gov.
 *
 * WHY THIS IS A REPAIR, NOT A RELAXATION. The preregistered criterion is
 * `population: ['Type 2 Diabetes', 'Obesity']` — a statement about which
 * PATIENT POPULATION qualifies, not about word order in a registry label.
 * The original fetch script never hit this because it delegated matching to
 * ClinicalTrials.gov's own `query.cond` search; this module re-implemented
 * that check locally and re-implemented it more weakly. Requiring every
 * token of the population term to be present keeps the criterion exactly as
 * strict on what it excludes: "Diabetes Mellitus, Type 1" still fails (no
 * "2"), bare "Diabetes" still fails (no "type", no "2"), and an unrelated
 * indication still fails. It only stops failing on word ORDER.
 */
function conditionSatisfiesPopulation(condition, population) {
  const tokens = (text) => new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t !== ''));
  const conditionTokens = tokens(condition);
  return [...tokens(population)].every((t) => conditionTokens.has(t));
}

/**
 * Validates an incoming manifest against every hard criterion. Returns
 * `{ ok: true, nctId, rawStudyJson, sha256 }` only when EVERY check passes;
 * the caller (the CLI script) is responsible for narrowing+writing, so this
 * function has no filesystem access and is fully unit-testable in memory.
 *
 * @param manifest - parsed JSON: { candidateChemblId, nctId, sourceUrl, declaredSha256, retrievedAt, rawStudyJsonText, publicationDoi? }
 * @param context - { knownCandidateIds: Set<string>, a1RejectedNctIds: Set<string>, existingNctIdsForCandidate: Set<string> }
 */
export function validateIncomingTrialPackage(manifest, context) {
  if (manifest === null || typeof manifest !== 'object') return fail('MANIFEST_MALFORMED', 'manifest is not a JSON object');
  const { candidateChemblId, nctId, sourceUrl, declaredSha256, retrievedAt, rawStudyJsonText } = manifest;
  for (const [key, value] of Object.entries({ candidateChemblId, nctId, sourceUrl, declaredSha256, retrievedAt, rawStudyJsonText })) {
    if (typeof value !== 'string' || value.trim() === '') return fail('MISSING_PROVENANCE', `manifest field "${key}" is missing or not a non-empty string`);
  }
  if (!/^[0-9a-f]{64}$/.test(declaredSha256)) return fail('MANIFEST_MALFORMED', 'declaredSha256 is not a 64-hex-char sha256 digest');

  const actualSha256 = sha256Hex(rawStudyJsonText);
  if (actualSha256 !== declaredSha256) return fail('HASH_MISMATCH', `declaredSha256 (${declaredSha256}) does not match sha256 of the supplied rawStudyJsonText (${actualSha256}) — the package is either corrupted or its provenance claim is false`);

  let rawStudyJson;
  try {
    rawStudyJson = JSON.parse(rawStudyJsonText);
  } catch (err) {
    return fail('STUDY_JSON_UNPARSEABLE', `rawStudyJsonText is not valid JSON: ${String(err?.message ?? err)}`);
  }

  const identification = rawStudyJson?.protocolSection?.identificationModule;
  const studyNctId = identification?.nctId;
  if (typeof studyNctId !== 'string' || studyNctId.trim() === '') return fail('MISSING_NCT_ID', 'rawStudyJsonText has no protocolSection.identificationModule.nctId — not a recognizable ClinicalTrials.gov API v2 study record');
  if (studyNctId !== nctId) return fail('NCT_ID_MISMATCH', `manifest declares nctId "${nctId}" but the raw study JSON's own identificationModule.nctId is "${studyNctId}"`);

  if (!context.knownCandidateIds.has(candidateChemblId)) {
    return fail('UNKNOWN_CANDIDATE', `"${candidateChemblId}" is not one of the already-pinned, mechanism-qualified A2 candidates (candidates.json) — this gate accepts new evidence for an EXISTING candidate only, never a new candidate entity`);
  }

  if (context.a1RejectedNctIds.has(studyNctId)) {
    return fail('A1_EVIDENCE_REJECTED', `${studyNctId} is one of A1's own independently-preregistered trial records (a1-glp1/) — reusing it inside A2 would be evidence injected across two separately-preregistered analyses, refused regardless of scientific merit`);
  }

  if (context.existingNctIdsForCandidate.has(studyNctId)) {
    return fail('DUPLICATE_OBSERVATION', `${studyNctId} is already present (base pin or a prior supplement ingestion) for candidate ${candidateChemblId}`);
  }

  const conditions = rawStudyJson?.protocolSection?.conditionsModule?.conditions;
  const conditionList = Array.isArray(conditions) ? conditions : [];
  const populationMatches = conditionList.some((c) => TRIAL_EVIDENCE_POPULATION.some((p) => conditionSatisfiesPopulation(String(c), p)));
  if (!populationMatches) {
    return fail('POPULATION_MISMATCH', `none of the study's declared conditions (${JSON.stringify(conditionList)}) match a preregistered A2 population (${JSON.stringify(TRIAL_EVIDENCE_POPULATION)})`);
  }

  const overallStatus = rawStudyJson?.protocolSection?.statusModule?.overallStatus;
  const hasResultsSection = rawStudyJson?.resultsSection !== undefined && rawStudyJson?.resultsSection !== null;
  if (REQUIRE_POSTED_RESULTS && (overallStatus !== 'COMPLETED' || !hasResultsSection)) {
    return fail('RESULTS_NOT_POSTED', `preregistration requires posted results; overallStatus="${overallStatus ?? 'MISSING'}", resultsSection present=${hasResultsSection}`);
  }

  const outcomes = rawStudyJson?.resultsSection?.outcomeMeasuresModule?.outcomeMeasures;
  const outcomeList = Array.isArray(outcomes) ? outcomes : [];
  const hasHba1cOrWeight = outcomeList.some((o) => /hba1c|glycated haemoglobin|glycosylated hemoglobin|body weight|weight loss|change in weight/i.test(o?.title ?? ''));
  if (!hasHba1cOrWeight) {
    return fail('NO_USABLE_OUTCOME', 'no outcome measure title matches an HbA1c or body-weight pattern — preregistration requires an arm-level HbA1c or weight outcome');
  }

  return Object.freeze({ ok: true, nctId: studyNctId, sha256: actualSha256, rawStudyJson, sourceUrl, retrievedAt, publicationDoi: manifest.publicationDoi ?? null });
}
