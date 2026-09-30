/**
 * D-152 — endpoint-scoped role classification for GLP-1R assays.
 *
 * D-151 read each assay description as one block of text, so binding language
 * that only recounted how a cell line had been characterised was read as a
 * conflicting endpoint. This pass restricts every signal term to the sentences
 * that say what was MEASURED, and leaves everything else about D-151 alone.
 *
 * Rules frozen BEFORE this file existed:
 * campaign/glp1r-d152-endpoint-scope-prereg.json (fingerprint 32c131b48235a556,
 * committed as c4d6a96). The regexes below are transcribed from that file and
 * must not be tuned against any count.
 */
import { classifyAssayRole } from './glp1rEndpointRole.mjs';

const SENTENCE_SPLIT = /(?<=[.;])\s+/;

const ENDPOINT_SENTENCE_TESTS = [
  /\b(EC50|IC50|Ki|Kd)\b[^.;]{0,80}\b(determination|determined|calculated|measured|values? were)\b/i,
  /\bwas determined (with|using|by)\b/i,
  /\bassessed as\b/i,
  /\bmeasur(e|ed|ing)\b[^.;]{0,40}\b(activity|response|accumulation|production|level|signal)\b/i,
];

/** Sentences that state what was measured, per the frozen definition. */
export function endpointSentences(description) {
  const text = String(description ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return { sentences: [], usedFirstSentenceFallback: false };
  const all = text.split(SENTENCE_SPLIT).filter((s) => s.trim());
  const hits = all.filter((s) => ENDPOINT_SENTENCE_TESTS.some((re) => re.test(s)));
  if (hits.length > 0) return { sentences: hits, usedFirstSentenceFallback: false };
  return { sentences: all.slice(0, 1), usedFirstSentenceFallback: true };
}

/**
 * Re-classifies one assay with signal terms scoped to its endpoint sentences.
 *
 * Species and system flags stay derived from the FULL description: they are
 * context facts about the experiment, not signals about the endpoint.
 *
 * @returns {{role: string, reason: string, evidence: string, speciesStated: boolean,
 *   heterologousSystem: boolean, source: string, scope: object}}
 */
export function classifyAssayRoleScoped({ record, actionType = '' } = {}) {
  const baseline = classifyAssayRole({ record, actionType });
  if (!record || !record.description || !record.description.trim()) {
    return { ...baseline, scope: { applied: false, reason: 'NO_DESCRIPTION' } };
  }

  const { sentences, usedFirstSentenceFallback } = endpointSentences(record.description);
  if (sentences.length === 0) {
    return { ...baseline, scope: { applied: false, reason: 'NO_ENDPOINT_SENTENCE_KEPT_D145_ROLE' } };
  }

  const scopedText = sentences.join(' ');
  const scoped = classifyAssayRole({ record: { ...record, description: scopedText }, actionType });

  return {
    ...scoped,
    // Context flags come from the whole description, never from the excerpt.
    speciesStated: baseline.speciesStated,
    heterologousSystem: baseline.heterologousSystem,
    evidence: scopedText.length > 260 ? `${scopedText.slice(0, 260)}…` : scopedText,
    scope: {
      applied: true,
      usedFirstSentenceFallback,
      endpointSentenceCount: sentences.length,
      changedFromD145: scoped.role !== baseline.role,
      d151Role: baseline.role,
      d151Reason: baseline.reason,
    },
  };
}
