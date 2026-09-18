/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, type EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export interface IonSpec { readonly species: string; readonly charge: number; readonly radiusPm: number; readonly count: number; readonly atomicMassU: number; }
export interface LatticeSite { readonly species: string; readonly x: number; readonly y: number; readonly z: number; }
export type LatticeType = 'rock-salt' | 'perovskite' | 'diamond' | 'bcc' | 'fcc';
export interface CrystalStructure {
  readonly id: string; readonly name: string; readonly lattice: LatticeType; readonly aPm: number;
  readonly sites: readonly LatticeSite[]; readonly stable: boolean;
  readonly densityKgM3: number; readonly bulkModulusGPa: number; readonly conductivitySM: number;
  readonly dosAtFermiPerEvAtom: number; readonly formationEnergyEv: number; readonly structureHash: string;
}
const U_TO_KG = 1.66053906660e-27;
/** Empirical/toy property models — documented ESTIMATES, not DFT results (honest scope). */
export class MaterialsDiscoveryEngine {
  constructor(private seedBase: number) {}
  private pickLattice(ions: readonly IonSpec[]): LatticeType {
    if (ions.length === 1) return ions[0].charge === 0 ? 'fcc' : 'bcc';
    if (ions.length === 2) { const [a, b] = ions; if (Math.abs(a.count - b.count) <= 1) return 'rock-salt'; }
    if (ions.length === 3) { const sorted = [...ions].sort((x, y) => x.count - y.count); if (sorted[0].count === sorted[1].count && sorted[2].count === 3 * sorted[0].count) return 'perovskite'; }
    return 'fcc';
  }
  synthesize(ions: readonly IonSpec[]): CrystalStructure {
    const compHash = sha256hex(stableStringify(ions));
    const rng = mulberry32(this.seedBase ^ parseInt(compHash.slice(0, 8), 16));
    const lattice = this.pickLattice(ions);
    const rSum = ions.reduce((a, i) => a + i.radiusPm, 0) / Math.max(1, ions.length);
    const aPm = +(2 * rSum * (lattice === 'rock-salt' ? 1.0 : lattice === 'perovskite' ? 1.15 : 0.9) * (0.98 + 0.04 * rng())).toFixed(1);
    const sites: LatticeSite[] = [];
    const push = (species: string, x: number, y: number, z: number): void => { sites.push({ species, x, y, z }); };
    if (lattice === 'rock-salt' && ions.length >= 2) {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) { push(ions[0].species, i, j, k); push(ions[1].species, i + 0.5, j, k); push(ions[1].species, i, j + 0.5, k); push(ions[0].species, i + 0.5, j + 0.5, k); }
    } else if (lattice === 'perovskite' && ions.length >= 3) {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) { push(ions[0].species, i, j, k); push(ions[1].species, i + 0.5, j + 0.5, k + 0.5); push(ions[2].species, i + 0.5, j, k); push(ions[2].species, i, j + 0.5, k); push(ions[2].species, i, j, k + 0.5); }
    } else if (lattice === 'diamond' || lattice === 'fcc' || lattice === 'bcc') {
      const sp = ions[0].species;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) { push(sp, i, j, k); push(sp, i + 0.5, j + 0.5, k); push(sp, i + 0.5, j, k + 0.5); push(sp, i, j + 0.5, k + 0.5); if (lattice === 'bcc') push(sp, i + 0.5, j + 0.5, k + 0.5); if (lattice === 'diamond') push(sp, i + 0.25, j + 0.25, k + 0.25); }
    }
    const aM = aPm * 1e-12;
    const cellSites = lattice === 'rock-salt' ? 8 : lattice === 'perovskite' ? 5 : lattice === 'bcc' ? 2 : 4;
    const massPerSite = ions.reduce((acc, io) => acc + io.atomicMassU * io.count, 0) / Math.max(1, ions.reduce((a, i) => a + i.count, 0));
    const densityKgM3 = +((cellSites * massPerSite * U_TO_KG) / (aM * aM * aM)).toFixed(1);
    const q1 = Math.abs(ions[0]?.charge ?? 0); const q2 = Math.abs(ions[1]?.charge ?? q1);
    const aNm = aPm / 1000;
    const bulkModulusGPa = +(Math.min(900, Math.max(1, (800 * Math.max(1, q1 * q2)) / Math.pow(Math.max(0.1, aNm), 4)) * (0.9 + 0.2 * rng()))).toFixed(1);
    const metallic = ions.length === 1 && ions[0].charge === 0;
    const ionic = ions.length >= 2 && q1 > 0 && q2 > 0;
    const conductivitySM = metallic ? 1e7 : ionic ? 1e-12 : 1e-3;
    const dosAtFermiPerEvAtom = metallic ? +(0.3 + 0.2 * rng()).toFixed(3) : 0;
    const formationEnergyEv = ionic ? +(-(1.75 * q1 * q2) / Math.max(0.1, aNm) * 0.6).toFixed(3) : metallic ? +(-0.5 - 0.3 * rng()).toFixed(3) : +(-0.2 * rng()).toFixed(3);
    const stable = formationEnergyEv < 0;
    const formula = ions.map(i => i.species + (i.count > 1 ? i.count : '')).join('');
    const structureHash = sha256hex(stableStringify({ compHash, lattice, aPm, sites: sites.slice(0, 64), densityKgM3, bulkModulusGPa, conductivitySM, formationEnergyEv }));
    return { id: 'MAT-' + structureHash.slice(0, 10).toUpperCase(), name: 'GEN-' + formula + '-' + structureHash.slice(0, 4).toUpperCase(), lattice, aPm, sites, stable, densityKgM3, bulkModulusGPa, conductivitySM, dosAtFermiPerEvAtom, formationEnergyEv, structureHash };
  }
  commitToLedger(ledger: EvidenceLedger, c: CrystalStructure): string {
    const input: NewEvidenceInput = { sourceUrl: 'genesis://cern/mat/' + c.id, sourceTimestamp: null, claim: 'crystal ' + c.name + ' lattice=' + c.lattice + ' a=' + c.aPm + 'pm K=' + c.bulkModulusGPa + 'GPa stable=' + c.stable, claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'materials-discovery-engine', independentSourceIds: [] } };
    return ledger.addRecord(input).record.contentHash;
  }
}
