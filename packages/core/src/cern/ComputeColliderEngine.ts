/* Proprietary / All Rights Reserved - Genesis OS */
import { QuantumColliderEngine, type ColliderEvent } from '../collider/QuantumColliderEngine.js';
import { BlackHoleEventHorizonEngine, hawkingSpectrum, type FormationResult } from './BlackHoleEventHorizonEngine.js';
import { MaterialsDiscoveryEngine, type CrystalStructure, type IonSpec } from './MaterialsDiscoveryEngine.js';
import { EvidenceLedger, sha256hex, stableStringify, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
export interface TrackAttributes { readonly count: number; readonly aPT: Float32Array; readonly aPhi0: Float32Array; readonly aPzOverPt: Float32Array; readonly aCharge: Float32Array; readonly aType: Float32Array; }
/** Compute-accelerated, bit-reproducible collider facade. Seed is anchored in EvidenceLedger contentHash. */
export class ComputeColliderEngine {
  private seedBase: number;
  private collider: QuantumColliderEngine;
  private bh: BlackHoleEventHorizonEngine;
  private mats: MaterialsDiscoveryEngine;
  constructor(private ledger: EvidenceLedger, label: string, private sqrtS: number = 13000) {
    this.seedBase = parseInt(sha256hex(label).slice(0, 8), 16);
    this.collider = new QuantumColliderEngine(this.seedBase, sqrtS);
    this.bh = new BlackHoleEventHorizonEngine(this.seedBase);
    this.mats = new MaterialsDiscoveryEngine(this.seedBase);
  }
  getSeedBase(): number { return this.seedBase; }
  /** Re-anchor determinism: new seed derived from a ledger contentHash (auditable). */
  anchorSeed(label: string): string {
    const input: NewEvidenceInput = { sourceUrl: 'genesis://cern/seed/' + label, sourceTimestamp: null, claim: 'seed-anchor ' + label, claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'compute-collider-engine', independentSourceIds: [] } };
    const h = this.ledger.addRecord(input).record.contentHash;
    this.seedBase = parseInt(h.slice(0, 8), 16);
    this.collider = new QuantumColliderEngine(this.seedBase, this.sqrtS);
    this.bh = new BlackHoleEventHorizonEngine(this.seedBase);
    this.mats = new MaterialsDiscoveryEngine(this.seedBase);
    return h;
  }
  generateBatch(n: number, startIndex: number = 0): readonly ColliderEvent[] {
    const out: ColliderEvent[] = [];
    for (let i = 0; i < n; i++) out.push(this.collider.generateEvent(startIndex + i));
    return out;
  }
  /** GPU-instancing track parameters (helix in B-field) derived deterministically from events. */
  buildTrackAttributes(events: readonly ColliderEvent[]): TrackAttributes {
    const finals = events.flatMap(e => e.finals).filter(f => f.pdg !== 12 && f.pdg !== 14);
    const count = finals.length;
    const aPT = new Float32Array(count); const aPhi0 = new Float32Array(count); const aPz = new Float32Array(count); const aQ = new Float32Array(count); const aT = new Float32Array(count);
    finals.forEach((f, i) => {
      const pT = Math.max(0.05, Math.hypot(f.p4.px, f.p4.py));
      aPT[i] = pT; aPhi0[i] = Math.atan2(f.p4.py, f.p4.px); aPz[i] = f.p4.pz / pT;
      aQ[i] = f.pdg === 22 ? 0 : (f.pdg === 11 || f.pdg === 13 || f.pdg === -211 ? -1 : 1);
      aT[i] = f.pdg === 22 ? 4 : Math.abs(f.pdg) === 11 || Math.abs(f.pdg) === 13 ? 0 : Math.abs(f.pdg) === 211 ? 1 : 2;
    });
    return { count, aPT, aPhi0, aPzOverPt: aPz, aCharge: aQ, aType: aT };
  }
  /** Reproducible Hawking quanta batch as flat [pdg, energyGeV, weight] triples. */
  hawkingBatch(massKg: number, maxQuanta: number = 48): Float32Array {
    const q = hawkingSpectrum(massKg, this.seedBase ^ 0x5f3a, maxQuanta);
    const out = new Float32Array(q.length * 3);
    q.forEach((k, i) => { out[i * 3] = k.pdg; out[i * 3 + 1] = k.energyGeV; out[i * 3 + 2] = k.weight; });
    return out;
  }
  /** Reproducible crystal lattice node positions (pm → scaled) for instanced rendering. */
  latticeNodes(c: CrystalStructure): Float32Array {
    const out = new Float32Array(c.sites.length * 3);
    c.sites.forEach((s, i) => { out[i * 3] = s.x * c.aPm; out[i * 3 + 1] = s.y * c.aPm; out[i * 3 + 2] = s.z * c.aPm; });
    return out;
  }
  formHorizon(sqrtSGeV: number): FormationResult { return this.bh.attemptFormation(sqrtSGeV, { addThresholdTeV: 5 }); }
  synthesizeCrystal(ions: readonly IonSpec[]): CrystalStructure { return this.mats.synthesize(ions); }
  commitBatch(events: readonly ColliderEvent[]): string {
    const batchHash = sha256hex(stableStringify({ seed: this.seedBase, hashes: events.map(e => e.eventHash) }));
    const input: NewEvidenceInput = { sourceUrl: 'genesis://cern/batch/' + batchHash.slice(0, 12), sourceTimestamp: null, claim: 'collision batch n=' + events.length + ' sqrtS=' + this.sqrtS + ' batchHash=' + batchHash, claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'compute-collider-engine', independentSourceIds: [] } };
    return this.ledger.addRecord(input).record.contentHash;
  }
  commitHorizon(res: FormationResult): string { return this.bh.commitToLedger(this.ledger, res); }
  commitCrystal(c: CrystalStructure): string { return this.mats.commitToLedger(this.ledger, c); }
}
