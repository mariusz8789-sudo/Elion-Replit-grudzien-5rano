/**
 * KNOWLEDGE CHAT RETRIEVAL — answers a small, fixed set of natural-language
 * questions FROM the ingested knowledge packs (Pack #5, Pack #6) and the
 * GABA-A candidate pool, always with provenance, never from a canned string.
 *
 * This is deliberately NOT a general natural-language query engine: it is a
 * thin, honest lookup layer over Scientific Memory-shaped data (the same
 * records the Mechanistic Match Score/reasoning loop already consume), built
 * to answer exactly the questions Mission E2 asks Genesis to prove it can
 * answer post-ingestion:
 *   - "What do you know about <compound>?"
 *   - "What conflicts exist for <compound>?"
 *   - "Which natural compounds have benzodiazepine-site GABA-A data?"
 *   - "What experiment should I run next to shrink the current UNKNOWN?"
 * The last one is answered by wrapping the EXISTING, already-computed
 * `explainUnknown` / `SubstituteChallengeReport.nextExperiment` output — it
 * is never a hand-typed recommendation.
 */
import { GABA_BENZODIAZEPINE_CANDIDATE_POOL } from './gabaBenzodiazepineCandidatePool';
import { KNOWLEDGE_PACK_5_RECORDS, knowledgePack5RecordsFor, type KnowledgePack5Record } from './knowledgePack5';
import {
  KNOWLEDGE_PACK_6_NATURAL_OCCURRENCE,
  KNOWLEDGE_PACK_6_RECORDS,
  KNOWLEDGE_PACK_6_UNIDENTIFIED_LEADS,
  knowledgePack6NaturalOccurrenceFor,
  knowledgePack6NegativeEvidenceFor,
  type KnowledgePack6NegativeEvidenceRecord,
  type KnowledgePack6Record,
  type UnidentifiedLead,
} from './knowledgePack6';
import type { UnknownExplanation } from '../epistemicEngine';
import type { SubstituteChallengeReport } from './pharmacologicalSubstituteChallenge';

export interface ChatRetrievalAnswer {
  query: string;
  answer: string;
  provenance: readonly string[];
  recordCount: number;
}

function pack6MatchesName(r: KnowledgePack6Record, wanted: string): boolean {
  return r.compound.toLowerCase() === wanted || r.compound.toLowerCase().includes(wanted) || r.aliases.some((a) => a.toLowerCase() === wanted);
}

/** "What do you know about <compound>?" — gathers everything Genesis has ingested about a named compound, from every source that mentions it. */
export function answerAboutCompound(compoundName: string): ChatRetrievalAnswer {
  const wanted = compoundName.toLowerCase();
  const pack5Records: readonly KnowledgePack5Record[] = knowledgePack5RecordsFor(compoundName);
  const pack6Records: readonly KnowledgePack6Record[] = KNOWLEDGE_PACK_6_RECORDS.filter((r) => pack6MatchesName(r, wanted));
  const negativeEvidence: readonly KnowledgePack6NegativeEvidenceRecord[] = knowledgePack6NegativeEvidenceFor(compoundName);
  const naturalOccurrence = knowledgePack6NaturalOccurrenceFor(compoundName)
    ?? KNOWLEDGE_PACK_6_NATURAL_OCCURRENCE.find((r) => r.compound.toLowerCase().includes(wanted)) ?? null;
  const unidentifiedLead: UnidentifiedLead | undefined = KNOWLEDGE_PACK_6_UNIDENTIFIED_LEADS.find((l) => l.label.toLowerCase().includes(wanted));
  const poolCandidate = GABA_BENZODIAZEPINE_CANDIDATE_POOL.find((c) => c.candidateKey.toLowerCase() === wanted || c.compoundName.toLowerCase() === wanted);

  const lines: string[] = [];
  const provenance: string[] = [];

  if (naturalOccurrence !== null) {
    lines.push(`Natural occurrence: ${naturalOccurrence.organism}${naturalOccurrence.part !== null ? ` (${naturalOccurrence.part})` : ''}.`);
  }

  for (const r of pack6Records) {
    lines.push(`${r.measurementType}=${r.value} ${r.unit} at ${r.targetSubtype} ${r.bindingSite} (${r.assayType}, ${r.assaySystem}, ${r.species ?? 'species unspecified'}), reported comparability ${r.comparability}${r.conflictStatus === 'CONFLICTING' ? ' [CONFLICTING with another source]' : ''}. Source: ${r.sourceTitle}${r.journal !== null ? `, ${r.journal} ${r.year}` : ''}.`);
    provenance.push(r.pmid !== null ? `pmid:${r.pmid}` : (r.doi !== null ? `doi:${r.doi}` : `kimi-pack6:${r.compound}`));
    if (r.supersedes !== null) lines.push(`NOTE: ${r.supersedes}`);
  }

  for (const r of pack5Records) {
    lines.push(`(Pack #5, weaker provenance — ${r.validationReason}) ${r.measurementType}=${r.value ?? 'n/a'} ${r.unit ?? ''} vs ${r.referenceCompound}, reported comparability ${r.reportedComparability}.`);
    provenance.push(`kimi-pack5:${r.compound}`);
  }

  for (const n of negativeEvidence) {
    lines.push(`NEGATIVE EVIDENCE: ${n.finding} (${n.source}) — ${n.implication}`);
    provenance.push(`negative-evidence:${n.compound}:${n.source}`);
  }

  if (unidentifiedLead !== undefined) {
    lines.push(`UNIDENTIFIED LEAD: Ki=${unidentifiedLead.kiNm} nM reported for "${unidentifiedLead.label}" from ${unidentifiedLead.sourceOrganism}, but the structure is UNKNOWN in this runtime — ${unidentifiedLead.note}`);
    provenance.push(`unidentified-lead:${unidentifiedLead.label}`);
  }

  if (poolCandidate !== undefined) {
    lines.push(`In the active GABA-A reasoning-loop candidate pool as "${poolCandidate.candidateKey}"; structure status: ${poolCandidate.structure.kind}.`);
    provenance.push(`candidate-pool:${poolCandidate.candidateKey}`);
  }

  const recordCount = pack5Records.length + pack6Records.length + negativeEvidence.length + (unidentifiedLead !== undefined ? 1 : 0);
  const answer = lines.length > 0
    ? lines.join(' ')
    : `Genesis has no ingested record for "${compoundName}" in Knowledge Pack #5, Knowledge Pack #6, or the active candidate pool.`;

  return { query: `What do you know about ${compoundName}?`, answer, provenance, recordCount };
}

/** "What conflicts exist for <compound>?" */
export function answerConflictsFor(compoundName: string): ChatRetrievalAnswer {
  const wanted = compoundName.toLowerCase();
  const conflictingPack6 = KNOWLEDGE_PACK_6_RECORDS.filter((r) => pack6MatchesName(r, wanted) && r.conflictStatus === 'CONFLICTING');
  const conflictingPack5 = KNOWLEDGE_PACK_5_RECORDS.filter((r) => r.compound.toLowerCase() === wanted && r.conflicts !== null);

  const lines: string[] = [];
  const provenance: string[] = [];

  for (const r of conflictingPack6) {
    lines.push(`${r.measurementType}=${r.value} ${r.unit} (${r.sourceTitle}${r.journal !== null ? `, ${r.journal} ${r.year}` : ''}) conflicts with at least one other cited value for this compound at the same site.`);
    provenance.push(r.pmid !== null ? `pmid:${r.pmid}` : (r.doi !== null ? `doi:${r.doi}` : `kimi-pack6:${r.compound}`));
    if (r.supersedes !== null) lines.push(`SUPERSESSION: ${r.supersedes}`);
  }
  for (const r of conflictingPack5) {
    lines.push(`Pack #5: ${r.conflicts}`);
    provenance.push(`kimi-pack5:${r.compound}`);
  }

  const recordCount = conflictingPack6.length + conflictingPack5.length;
  const answer = lines.length > 0
    ? [...new Set(lines)].join(' ')
    : `Genesis has no recorded conflict for "${compoundName}".`;

  return { query: `What conflicts exist for ${compoundName}?`, answer, provenance: [...new Set(provenance)], recordCount };
}

/** "Which natural compounds have data at the GABA-A benzodiazepine site?" */
export function answerCompoundsWithBenzodiazepineSiteData(): ChatRetrievalAnswer {
  const byCompound = new Map<string, { comparability: string; bindingSite: string; sources: string[] }>();
  for (const r of KNOWLEDGE_PACK_6_RECORDS) {
    if (r.compound === 'alprazolam') continue;
    const key = r.compound;
    const existing = byCompound.get(key);
    const source = r.pmid !== null ? `pmid:${r.pmid}` : (r.doi !== null ? `doi:${r.doi}` : 'kimi-pack6');
    if (existing === undefined) {
      byCompound.set(key, { comparability: r.comparability, bindingSite: r.bindingSite, sources: [source] });
    } else if (!existing.sources.includes(source)) {
      existing.sources.push(source);
    }
  }

  const benzodiazepineSite = [...byCompound.entries()].filter(([, v]) => v.bindingSite === 'benzodiazepine');
  const nonBenzodiazepineSite = [...byCompound.entries()].filter(([, v]) => v.bindingSite !== 'benzodiazepine');

  const lines: string[] = [
    `${benzodiazepineSite.length} compound(s) have data AT the classical benzodiazepine site: ${benzodiazepineSite.map(([name]) => name).join(', ')}.`,
    `${nonBenzodiazepineSite.length} compound(s) have GABA-A data but at a DIFFERENT (non-benzodiazepine) site — not directly comparable to alprazolam: ${nonBenzodiazepineSite.map(([name]) => name).join(', ')}.`,
  ];
  const provenance = [...new Set([...byCompound.values()].flatMap((v) => v.sources))];

  return {
    query: 'Which natural compounds have data at the GABA-A benzodiazepine site?',
    answer: lines.join(' '),
    provenance,
    recordCount: byCompound.size,
  };
}

/**
 * "What experiment should I run next to shrink the current UNKNOWN?" —
 * wraps the ALREADY-COMPUTED unknown explanation and report's next-experiment
 * field from a real reasoning-loop run. Never hand-typed here.
 */
export function answerNextExperimentRecommendation(
  unknown: UnknownExplanation,
  report: SubstituteChallengeReport,
): ChatRetrievalAnswer {
  const answer = `The current UNKNOWN most limiting this comparison is: ${unknown.whatIsUnknown} (${unknown.whyUnknown}) Recommended next experiment, selected by the reasoning loop's own experiment-selection logic (not hard-coded): ${report.nextExperiment}`;
  return {
    query: 'What experiment should I run next to shrink the current UNKNOWN?',
    answer,
    provenance: unknown.provenance,
    recordCount: 1,
  };
}
