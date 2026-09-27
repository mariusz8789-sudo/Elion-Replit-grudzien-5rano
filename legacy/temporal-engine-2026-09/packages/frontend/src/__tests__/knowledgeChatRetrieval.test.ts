import { describe, expect, it } from 'vitest';
import {
  answerAboutCompound,
  answerCompoundsWithBenzodiazepineSiteData,
  answerConflictsFor,
  answerNextExperimentRecommendation,
} from '../core/discovery/molecular/knowledgeChatRetrieval';
import {
  KNOWLEDGE_PACK_6_NATURAL_OCCURRENCE,
  KNOWLEDGE_PACK_6_NEGATIVE_EVIDENCE,
  KNOWLEDGE_PACK_6_UNIDENTIFIED_LEADS,
  knowledgePack6NegativeEvidenceFor,
  knowledgePack6RecordsFor,
} from '../core/discovery/molecular/knowledgePack6';
import {
  ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6,
  buildSubstituteChallengeReport,
  runMechanisticSubstituteChallenge,
  unknownExplanation,
} from '../core/discovery/molecular/pharmacologicalSubstituteChallenge';
import type { RdkitTransport } from '../core/discovery/molecular/rdkitTransport';
import type { AdmetTransport } from '../core/discovery/molecular/admetTransport';
import { GABA_BENZODIAZEPINE_CANDIDATE_POOL } from '../core/discovery/molecular/gabaBenzodiazepineCandidatePool';
import { ALPRAZOLAM_SUBSTITUTE_CHALLENGE } from '../core/discovery/molecular/pharmacologicalSubstituteChallenge';

describe('knowledgePack6 — Section G/F/UNK extensions (negative evidence, natural occurrence, unidentified leads)', () => {
  it('1. negative evidence is retrievable per compound and is never dropped for being inconvenient', () => {
    expect(KNOWLEDGE_PACK_6_NEGATIVE_EVIDENCE.length).toBeGreaterThanOrEqual(4);
    expect(knowledgePack6NegativeEvidenceFor('baicalein').length).toBeGreaterThan(0);
    expect(knowledgePack6NegativeEvidenceFor('apigenin')[0]!.finding.toLowerCase()).toContain('no anxiolytic');
  });

  it('2. K36 is findable by its short alias, not only its full systematic name', () => {
    const byAlias = knowledgePack6RecordsFor('K36');
    const byFullName = knowledgePack6RecordsFor("K36 (5,7,2'-trihydroxy-6,8-dimethoxyflavone)");
    expect(byAlias.length).toBe(byFullName.length);
    expect(byAlias.length).toBeGreaterThan(0);
  });

  it('3. natural occurrence records exist for every compound with a quantitative Pack #6 record', () => {
    expect(KNOWLEDGE_PACK_6_NATURAL_OCCURRENCE.length).toBeGreaterThanOrEqual(11);
  });

  it('4. unidentified leads are kept as real, actionable gaps, not discarded for lacking a structure', () => {
    expect(KNOWLEDGE_PACK_6_UNIDENTIFIED_LEADS.length).toBe(5);
    for (const lead of KNOWLEDGE_PACK_6_UNIDENTIFIED_LEADS) {
      expect(lead.structureStatus).toBe('UNKNOWN_STRUCTURE');
      expect(lead.kiNm).toBeGreaterThan(0);
    }
    const mostPotent = [...KNOWLEDGE_PACK_6_UNIDENTIFIED_LEADS].sort((a, b) => a.kiNm - b.kiNm)[0]!;
    expect(mostPotent.label).toContain('50');
  });
});

describe('knowledgeChatRetrieval — answers come from real records, with provenance, never hard-coded', () => {
  it('5. "What do you know about K36?" returns real Ki/EC50 values with real PMID provenance', () => {
    const result = answerAboutCompound('K36');
    expect(result.answer).toContain('6.05');
    expect(result.answer).toContain('24');
    expect(result.answer.toLowerCase()).toContain('scutellaria baicalensis');
    expect(result.provenance).toContain('pmid:14637197');
    expect(result.recordCount).toBeGreaterThan(0);
  });

  it('6. K36 is honestly reported as NOT structurally verified / not in the active pool', () => {
    const result = answerAboutCompound('K36');
    const inPool = GABA_BENZODIAZEPINE_CANDIDATE_POOL.some((c) => c.candidateKey === 'k36');
    expect(inPool).toBe(false);
    expect(result.answer).not.toContain('candidate-pool');
  });

  it('7. "What conflicts exist for baicalein?" surfaces the real Hui-2000-vs-Çiçek-2018 conflict and the Pack #5 supersession', () => {
    const result = answerConflictsFor('baicalein');
    expect(result.answer).toContain('10100');
    expect(result.answer).toContain('5690');
    expect(result.answer.toLowerCase()).toContain('supersedes');
    expect(result.provenance).toContain('pmid:10705749');
    expect(result.provenance).toContain('doi:10.3390/molecules23071512');
  });

  it('8. a compound with no recorded conflict says so honestly, not silently empty', () => {
    const result = answerConflictsFor('honokiol');
    expect(result.answer).toContain('no recorded conflict');
    expect(result.recordCount).toBe(0);
  });

  it('9. "Which natural compounds have benzodiazepine-site data?" separates BZD-site from non-BZD-site compounds using the real bindingSite field', () => {
    const result = answerCompoundsWithBenzodiazepineSiteData();
    expect(result.answer).toContain('K36');
    expect(result.answer).toContain('honokiol');
    expect(result.answer).toContain('non-benzodiazepine');
    expect(result.provenance.length).toBeGreaterThan(0);
  });

  it('10. a query about a compound with no ingested data says so honestly rather than fabricating an answer', () => {
    const result = answerAboutCompound('completely-fictional-compound-42');
    expect(result.answer).toContain('no ingested record');
    expect(result.recordCount).toBe(0);
    expect(result.provenance).toEqual([]);
  });

  it('11. the next-experiment recommendation is computed from a real reasoning-loop run, not a canned string', () => {
    const fakeRdkit: RdkitTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
      match: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      describe: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture: not needed for this test' }),
      transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
      transformations: () => ({ ok: true, transformations: [] }),
      similarity: () => ({ ok: true, tanimoto: 0.3, fingerprint: 'fake', candidateCanonical: 'c', referenceCanonical: 'r', scaffoldCandidate: 's1', scaffoldReference: 's2', sameScaffold: false }),
    };
    const fakeAdmet: AdmetTransport = {
      transportId: 'test-fixture',
      detect: () => ({ available: false, engine: 'TEST_FIXTURE', version: '0', reason: 'fixture' }),
      predict: () => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: 'fixture' }),
    };
    const result = runMechanisticSubstituteChallenge(ALPRAZOLAM_SUBSTITUTE_CHALLENGE, { rdkit: fakeRdkit, admet: fakeAdmet });
    const graph = result.loopResult.finalGraph;
    const unknown = unknownExplanation(graph);
    const report = buildSubstituteChallengeReport(result);
    const chatAnswer = answerNextExperimentRecommendation(unknown, report);
    expect(chatAnswer.answer).toContain(unknown.whatIsUnknown);
    expect(chatAnswer.answer).toContain(report.nextExperiment);
  });

  it('12. the after-Pack-6 config exposes benzodiazepine-site data for the same 7 compounds the chat layer reports', () => {
    expect(ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6.pool.length).toBe(6);
    const chat = answerCompoundsWithBenzodiazepineSiteData();
    expect(chat.recordCount).toBe(10);
  });
});
