/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
import { MythosSubstrate } from './MythosSubstrate.js';
import { CicadaEngine, InsufficientEvidenceError, type ProcurementEvent, type CicadaConfig } from './CicadaEngine.js';
const clock = { t: 1000, now() { return this.t; } };
const srcInput = (claim: string): NewEvidenceInput => ({ sourceUrl: 'https://example.org/osint/1', sourceTimestamp: null, claim, claimType: 'observation', confidence: 0.9, provenance: { sourceKind: 'dataset', retrievedBy: 'test', independentSourceIds: ['IND-1'] } });
const CONFIG: CicadaConfig = { windowMs: 7 * 86400000, surgeK: 2.5, minSuppliers: 3, newEntityDays: 30, criticalComponents: ['COMP-X'], scoreThreshold: 0.6, historicalWindows: [{ year: 2019, hadPattern: true, escalated: false }] };
const BASELINES = { 'COMP-X': { meanQty: 100, sigmaQty: 10, meanPrice: 50, sigmaPrice: 5, routes: ['R-A', 'R-B'] } };
const ev = (id: string, supplier: string, qty: number, ts: number, route?: string, regTs?: number): ProcurementEvent => ({ eventId: id, ts, supplierId: supplier, componentId: 'COMP-X', qty, unitPrice: 50, routeId: route, entityRegTs: regTs });
describe('MythosSubstrate', () => {
  it('temporal edges anchored to ledger contentHash & chain verifies', () => {
    const ledger = new EvidenceLedger(clock);
    const sub = new MythosSubstrate(clock, ledger);
    const e1 = sub.addEdge('SUP-1', 'supplies', 'COMP-X', 100, null, srcInput('Dostawca 1 komponent X'));
    const e2 = sub.addEdge('SUP-2', 'supplies', 'COMP-X', 200, 300, srcInput('Dostawca 2 komponent X'));
    expect(e1.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sub.edgesAt(150).map(e => e.edgeId)).toEqual([e1.edgeId]);
    expect(sub.edgesAt(250).map(e => e.edgeId)).toEqual([e1.edgeId, e2.edgeId]);
    expect(sub.verifyChain().ok).toBe(true);
  });
  it('dual-control blocks same-actor second approval', () => {
    const sub = new MythosSubstrate(clock, new EvidenceLedger(clock));
    const req = sub.requestAction('ANALYST-1', 'EXPORT_CASE', 'CASE-9');
    expect(req.status).toBe('PENDING_SECOND_CONTROL');
    expect(sub.approveSecond(req.requestId, 'ANALYST-1')!.status).toBe('BLOCKED');
    const req2 = sub.requestAction('ANALYST-1', 'EXPORT_CASE', 'CASE-10');
    expect(sub.approveSecond(req2.requestId, 'OFFICER-2')!.status).toBe('APPROVED');
  });
});
describe('CicadaEngine (hard thresholds)', () => {
  it('below threshold -> INSUFFICIENT_EVIDENCE status', () => {
    const engine = new CicadaEngine(CONFIG, BASELINES);
    const a = engine.evaluate([ev('E1', 'S1', 130, 1000)]);
    expect(a.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(a.claimType).toBe('hypothesis');
    expect(a.requiresApproval).toBe(true);
  });
  it('evaluateStrict throws InsufficientEvidenceError below threshold', () => {
    const engine = new CicadaEngine(CONFIG, BASELINES);
    expect(() => engine.evaluateStrict([ev('E1', 'S1', 130, 1000)])).toThrow(InsufficientEvidenceError);
  });
  it('synchronous surge >=3 suppliers + route anomaly + new entity -> CANDIDATE with counterexample downgrade', () => {
    const engine = new CicadaEngine(CONFIG, BASELINES);
    const t0 = 50000000;
    const events = [
      ev('E1', 'S1', 140, t0), ev('E2', 'S2', 145, t0 + 1000), ev('E3', 'S3', 150, t0 + 2000),
      ev('E4', 'S4', 130, t0 + 3000, 'R-Z'),
      ev('E5', 'S5', 135, t0 + 4000, undefined, t0 - 10 * 86400000),
    ];
    const a = engine.evaluate(events);
    expect(a.status).toBe('CANDIDATE');
    expect(a.triggeredRules.some(r => r.startsWith('R1'))).toBe(true);
    expect(a.triggeredRules).toContain('R2_ROUTE_ANOMALY');
    expect(a.triggeredRules).toContain('R3_NEW_ENTITY_CRITICAL_NODE');
    expect(a.counterexamples).toEqual([2019]);
    expect(a.confidence).toBeLessThan(a.score);
    expect(a.confidenceInterval[0]).toBeLessThanOrEqual(a.confidence);
    expect(a.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('deterministic: same events -> same assessment', () => {
    const mk = () => new CicadaEngine(CONFIG, BASELINES).evaluate([ev('E1', 'S1', 140, 1), ev('E2', 'S2', 145, 2), ev('E3', 'S3', 150, 3)]);
    expect(mk().provenanceHash).toBe(mk().provenanceHash);
    expect(mk().score).toBe(mk().score);
  });
});
describe('iron rules', () => {
  for (const f of ['MythosSubstrate.ts', 'CicadaEngine.ts', 'ledgerFeed.ts']) {
    it(f + ' bez Math.random/Date.now', () => {
      const s = readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
      expect(s).not.toContain('Math.random(');
      expect(s).not.toContain('Date.now(');
    });
  }
});
