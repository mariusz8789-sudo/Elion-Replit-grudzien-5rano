/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger } from './EvidenceLedger.js';
import { classifyClaim, canReachVerified } from './classifyClaim.js';
import { LaypersonAssistant } from './LaypersonAssistant.js';
import type { NewEvidenceInput } from './EvidenceLedger.js';
const clock = { t: 1000, now() { return this.t; } };
const videoInput: NewEvidenceInput = { sourceUrl: 'https://youtu.be/X', sourceTimestamp: '00:05:00', claim: 'Wieże zatrzymywały ciepło w murach', claimType: 'reported_claim', confidence: 0.9, provenance: { sourceKind: 'video', retrievedBy: 'manus-analysis', independentSourceIds: [] } };
const peerInput: NewEvidenceInput = { sourceUrl: 'https://doi.org/1', sourceTimestamp: null, claim: 'Detekcja sygnału potwierdzona powtarzalnie', claimType: 'observation', confidence: 0.9, provenance: { sourceKind: 'peer_reviewed', retrievedBy: 'agent', independentSourceIds: ['IND-1'] } };
describe('classifyClaim', () => {
  it('video never reaches verified without independent source', () => { expect(classifyClaim({ claimType: 'reported_claim', sourceKind: 'video', independentSourceIds: [], confidence: 0.95 })).not.toBe('verified'); expect(canReachVerified('video')).toBe(false); });
  it('peer-reviewed with independent source can verify', () => { expect(classifyClaim({ claimType: 'observation', sourceKind: 'peer_reviewed', independentSourceIds: ['IND-1'], confidence: 0.9 })).toBe('verified'); });
  it('low confidence rejected', () => { expect(classifyClaim({ claimType: 'hypothesis', sourceKind: 'web', independentSourceIds: [], confidence: 0.1 })).toBe('rejected'); });
});
describe('EvidenceLedger', () => {
  it('content hash deterministic', () => { const a = new EvidenceLedger(clock); const b = new EvidenceLedger(clock); expect(a.contentHashOf(videoInput)).toBe(b.contentHashOf(videoInput)); });
  it('deduplication on same content', () => { const l = new EvidenceLedger(clock); const r1 = l.addRecord(videoInput); const r2 = l.addRecord(videoInput); expect(r2.deduped).toBe(true); expect(r1.record.id).toBe(r2.record.id); expect(l.getActive().length).toBe(1); });
  it('no promotion of video material on add', () => { const l = new EvidenceLedger(clock); const r = l.addRecord(videoInput); expect(r.record.status).not.toBe('verified'); expect(r.record.disclaimer.length).toBeGreaterThan(0); expect(r.record.sourceUrl.length).toBeGreaterThan(0); });
  it('propose-only: publish requires explicit approval & bumps version', () => { const l = new EvidenceLedger(clock); const pid = l.propose(peerInput); expect(l.getActive().length).toBe(0); const v0 = l.getVersion(); const rec = l.publish(pid, 'MANUS'); expect(rec).not.toBeNull(); expect(l.getVersion()).toBe(v0 + 1); expect(l.getActive().length).toBe(1); });
  it('ledger chain verifies', () => { const l = new EvidenceLedger(clock); l.addRecord(videoInput); const pid = l.propose(peerInput); l.publish(pid, 'MANUS'); expect(l.verifyLedger().ok).toBe(true); });
});
describe('LaypersonAssistant', () => {
  it('says Nie wiem with empty ledger', () => { const a = new LaypersonAssistant(new EvidenceLedger(clock)).answer('czy wieże zatrzymywały ciepło'); expect(a.saidIdontKnow).toBe(true); expect(a.answer).toContain('Nie wiem'); expect(a.disclaimer.length).toBeGreaterThan(0); });
  it('plain-language answer with sources & status', () => { const l = new EvidenceLedger(clock); l.addRecord(videoInput); const ans = new LaypersonAssistant(l).answer('wieże zatrzymywały ciepło'); expect(ans.saidIdontKnow).toBe(false); expect(ans.sources.length).toBe(1); expect(ans.answer).toContain('Status:'); });
  it('refuses expert roles', () => { const l = new EvidenceLedger(clock); const ans = new LaypersonAssistant(l).answer('porada medyczna: jaka dawka leku?'); expect(ans.roleRefusal).toBe(true); });
});
describe('iron rules', () => {
  for (const f of ['EvidenceLedger.ts', 'LaypersonAssistant.ts', 'classifyClaim.ts']) it(f + ' no Math.random/Date.now', () => { const s = readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8'); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
