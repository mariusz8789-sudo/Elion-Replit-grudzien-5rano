/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from './EvidenceLedger.js';
import type { NewEvidenceInput } from './EvidenceLedger.js';
import { buildTruthResponse, relatedRecords, renderTruthResponsePl } from './truthResponse.js';
import { DNA_RNA_ATP_SEED, MOLECULAR_RESEARCH_QUESTIONS, seedTopicFor } from './molecularSeed.js';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
const rec = (sourceUrl: string, claim: string, claimType: NewEvidenceInput['claimType'] = 'reported_claim', sourceKind: NewEvidenceInput['provenance']['sourceKind'] = 'document'): NewEvidenceInput => ({ sourceUrl, sourceTimestamp: null, claim, claimType, confidence: 0.8, provenance: { sourceKind, retrievedBy: 'test', independentSourceIds: [] } });

describe('truthResponse — the pack answer shape composed from canonical pieces', () => {
  it('a boundary question with nothing in the ledger is INSUFFICIENT_EVIDENCE, with the missing-evidence line and no invented tests', () => {
    const l = new EvidenceLedger(clock);
    const r = buildTruthResponse(l, 'czy żyjemy w symulacji?');
    expect(r.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.evidence).toEqual([]); expect(r.contradictions).toEqual([]); expect(r.nextTests).toEqual([]); expect(r.provenanceIds).toEqual([]);
    expect(r.missingEvidence[0]).toMatch(/brak zapisów/);
    expect(r.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const text = renderTruthResponsePl(r);
    expect(text).toContain('Status: INSUFFICIENT_EVIDENCE');
    expect(text).toContain('Dowody: brak zapisów.');
    expect(text).toContain('Sprzeczności: nie wykryto.');
  });
  it('an unverified record answers as UNVERIFIED with provenance, a contradiction between hosts is surfaced, fingerprint is stable', () => {
    const l = new EvidenceLedger(clock);
    l.addRecord(rec('https://a.example.org/x', 'mitochondria produce ATP at rate=30 per glucose'));
    l.addRecord(rec('https://b.example.org/y', 'mitochondria produce ATP at rate=38 per glucose'));
    const r1 = buildTruthResponse(l, 'how much ATP do mitochondria produce?');
    const r2 = buildTruthResponse(l, 'how much ATP do mitochondria produce?');
    expect(r1.fingerprint).toBe(r2.fingerprint);
    expect(['UNVERIFIED', 'CANDIDATE']).toContain(r1.status);
    expect(r1.provenanceIds.length).toBe(2);
    expect(r1.contradictions.some((c) => c.key === 'rate')).toBe(true);
    expect(r1.missingEvidence.some((m) => /sprzeczno/.test(m))).toBe(true);
    expect(relatedRecords(l.getActive(), 'unrelated quasar jets')).toEqual([]);
  });
});

describe('molecularSeed — seed topics are curricula, not facts', () => {
  it('three seed topics with starter questions and evidence requirements; research prompts name expected evidence', () => {
    expect(DNA_RNA_ATP_SEED.map((s) => s.id)).toEqual(['dna', 'rna', 'atp']);
    for (const s of DNA_RNA_ATP_SEED) { expect(s.starterQuestions.length).toBeGreaterThan(0); expect(s.evidenceRequired.length).toBeGreaterThan(0); }
    for (const p of MOLECULAR_RESEARCH_QUESTIONS) expect(p.expectedEvidence.length).toBeGreaterThan(0);
  });
  it('maps a question to a seed topic by keyword overlap, null when nothing matches', () => {
    expect(seedTopicFor('Jak działa replikacja DNA?')?.id).toBe('dna');
    expect(seedTopicFor('ile ATP daje glikoliza')?.id).toBe('atp');
    expect(seedTopicFor('pogoda jutro')).toBeNull();
  });
});
