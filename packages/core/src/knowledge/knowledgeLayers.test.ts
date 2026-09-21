/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from './EvidenceLedger.js';
import { huntContradictions, unresolvedContradictionLabels } from './contradictionHunter.js';
import { curiosityGoalProposals, generateCuriosityQuestions } from './curiosity.js';
import { CODON_TABLE, atpBudget, centralDogmaReport, commitCentralDogmaReport, gcContent, reverseComplement, transcribe, translate } from './molecularBiology.js';
import type { NewEvidenceInput } from './EvidenceLedger.js';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
const rec = (sourceUrl: string, claim: string, claimType: NewEvidenceInput['claimType'] = 'reported_claim', sourceKind: NewEvidenceInput['provenance']['sourceKind'] = 'document'): NewEvidenceInput => ({ sourceUrl, sourceTimestamp: null, claim, claimType, confidence: 0.8, provenance: { sourceKind, retrievedBy: 'test', independentSourceIds: [] } });

describe('contradictionHunter — reports, never resolves', () => {
  it('finds a numeric disagreement between two hosts, ignores agreement and same-host repeats, is deterministic', () => {
    const l = new EvidenceLedger(clock);
    l.addRecord(rec('https://a.example.org/x', 'SEIRD run r0=2.5 peakDay=41'));
    l.addRecord(rec('https://b.example.org/y', 'SEIRD run r0=3.1 peakDay=41'));
    l.addRecord(rec('https://a.example.org/z', 'SEIRD run r0=2.9 peakDay=41'));
    const r1 = huntContradictions(l.getActive()); const r2 = huntContradictions([...l.getActive()].reverse());
    expect(r1.fingerprint).toBe(r2.fingerprint);
    const numeric = r1.contradictions.filter((c) => c.kind === 'NUMERIC_DISAGREEMENT');
    expect(numeric.map((c) => c.key)).toEqual(['r0', 'r0']);
    expect(numeric.every((c) => c.unresolved && c.severity === 'HIGH' || c.severity === 'MEDIUM')).toBe(true);
    expect(numeric.some((c) => c.sources.includes('a.example.org') && c.sources.includes('b.example.org'))).toBe(true);
    // peakDay agrees everywhere: no contradiction on it; same-host pairs are not compared.
    expect(r1.contradictions.some((c) => c.key === 'peakDay')).toBe(false);
    expect(unresolvedContradictionLabels(r1)[0]).toMatch(/^NUMERIC_DISAGREEMENT:r0:(HIGH|MEDIUM)$/);
  });
  it('flags a polarity conflict on near-identical wording and a status conflict on the same claim; nothing on an empty ledger', () => {
    const l = new EvidenceLedger(clock);
    l.addRecord(rec('https://a.example.org/1', 'the pump valve limits the flow rate in the pipe'));
    l.addRecord(rec('https://b.example.org/2', 'the pump valve does not limit the flow rate in the pipe'));
    const r = huntContradictions(l.getActive());
    expect(r.contradictions.map((c) => c.kind)).toContain('POLARITY_CONFLICT');
    expect(huntContradictions([]).contradictions).toEqual([]);
    const a = l.addRecord(rec('https://c.example.org/3', 'identical claim text')).record;
    const b = l.addRecord(rec('https://d.example.org/4', 'identical claim text')).record;
    const status = huntContradictions([{ ...a, status: 'rejected' }, b]);
    expect(status.contradictions.map((c) => c.kind)).toContain('STATUS_CONFLICT');
  });
});

describe('curiosity — questions only from ledger gaps, lexicographically ranked', () => {
  it('asks to resolve contradictions first, then for independent confirmation, then for observations behind model-only keys', () => {
    const l = new EvidenceLedger(clock);
    l.addRecord(rec('https://a.example.org/x', 'SEIRD run r0=2.5'));
    l.addRecord(rec('https://b.example.org/y', 'SEIRD run r0=3.1'));
    l.addRecord(rec('https://only.example.org/single', 'lattice constant of NaCl aPm=564'));
    l.addRecord(rec('genesis://worlds/w/seir/7', 'SEIRD RK4 run peakInfected=1200 peakDay=41', 'model', 'dataset'));
    const report = generateCuriosityQuestions(l.getActive());
    expect(report.questions.map((q) => q.kind)).toEqual(['RESOLVE_CONTRADICTION', 'INDEPENDENT_CONFIRMATION', 'INDEPENDENT_CONFIRMATION', 'INDEPENDENT_CONFIRMATION', 'MODEL_TO_OBSERVATION', 'MODEL_TO_OBSERVATION']);
    for (const q of report.questions) { expect(q.evidenceIds.length).toBeGreaterThan(0); expect(q.epistemicStatus).toBe('INSUFFICIENT_EVIDENCE'); expect(q.text.length).toBeGreaterThan(20); }
    expect(report.questions[0].text).toContain('2.5'); expect(report.questions[0].text).toContain('3.1');
    expect(report.questions.filter((q) => q.kind === 'MODEL_TO_OBSERVATION').flatMap((q) => q.subjectKeys).sort()).toEqual(['peakDay', 'peakInfected']);
    expect(generateCuriosityQuestions(l.getActive()).fingerprint).toBe(report.fingerprint);
    const goals = curiosityGoalProposals(report);
    expect(goals[0]).toMatchObject({ kind: 'GOAL', source: 'RULE', payload: { priority: 'HIGH' } });
    expect(generateCuriosityQuestions([]).questions).toEqual([]);
    expect(generateCuriosityQuestions(l.getActive(), { limit: 2 }).questions.length).toBe(2);
  });
});

describe('molecular biology layer — textbook, labelled', () => {
  it('standard genetic code: 64 codons, 3 stops, AUG→M; transcription and translation of a short ORF', () => {
    expect(Object.keys(CODON_TABLE).length).toBe(64);
    expect(Object.values(CODON_TABLE).filter((a) => a === '*').length).toBe(3);
    expect(CODON_TABLE.AUG).toBe('M'); expect(CODON_TABLE.UGG).toBe('W'); expect(CODON_TABLE.UAA).toBe('*');
    expect(transcribe('atg gcc tta tga')).toBe('AUGGCCUUAUGA');
    const t = translate('CCAUGGCCUUAUGAGG');
    expect(t).toMatchObject({ startIndex: 2, peptide: 'MAL', terminated: true, stopCodon: 'UGA' });
    expect(translate('CCCUUU').peptide).toBe('');
    expect(reverseComplement('ATGC')).toBe('GCAT'); expect(gcContent('GGCCAT')).toBeCloseTo(4 / 6, 6);
    expect(() => transcribe('ATGX')).toThrow('DNA_SEQUENCE_INVALID');
  });
  it('ATP budget is a labelled textbook range; the central-dogma report is deterministic and anchors on the ledger', () => {
    expect(atpBudget('GLYCOLYSIS_ONLY')).toMatchObject({ atpNetMin: 2, atpNetMax: 2, nadh: 2, label: 'TEXTBOOK_ESTIMATE' });
    expect(atpBudget('AEROBIC_COMPLETE', 2)).toMatchObject({ atpNetMin: 60, atpNetMax: 64, historicalEstimate: 72 });
    const r1 = centralDogmaReport('ATGGCCTTATGA'); const r2 = centralDogmaReport('atg gcc tta tga');
    expect(r1.contentHash).toBe(r2.contentHash); expect(r1.label).toBe('MODEL');
    expect(r1.peptideNames).toEqual(['methionine', 'alanine', 'leucine']);
    const l = new EvidenceLedger(clock);
    const h = commitCentralDogmaReport(l, r1, 'w'); expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(l.getActive()[0].claimType).toBe('model');
    expect(() => centralDogmaReport('AT')).toThrow('DNA_SEQUENCE_TOO_SHORT');
  });
});
