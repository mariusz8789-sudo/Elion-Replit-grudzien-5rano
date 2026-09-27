/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, type EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
import { mulberry32 } from '../determinism.js';
export { mulberry32 };
/** PDG-style masses in GeV/c^2 (PDG 2022 rounded). B-field in Tesla (CMS-like). */
export const PHYS = Object.freeze({ PROTON_MASS: 0.938272088, PION_CH: 0.13957039, PION0: 0.1349768, MUON: 0.105658375, ELECTRON: 0.00051099895, Z_MASS: 91.1876, W_MASS: 80.379, HIGGS_MASS: 125.25, LAMBDA_QCD: 0.2, NF: 5, PT_MIN: 20, Y_MAX: 2.5, B_FIELD: 3.8 } as const);
export interface FourVec { readonly e: number; readonly px: number; readonly py: number; readonly pz: number; }
export const dot4 = (a: FourVec, b: FourVec): number => a.e * b.e - a.px * b.px - a.py * b.py - a.pz * b.pz;
export const massOf = (p: FourVec): number => Math.sqrt(Math.max(0, dot4(p, p)));
export const add4 = (a: FourVec, b: FourVec): FourVec => ({ e: a.e + b.e, px: a.px + b.px, py: a.py + b.py, pz: a.pz + b.pz });
const boost4 = (p: FourVec, bx: number, by: number, bz: number): FourVec => {
  const b2 = bx * bx + by * by + bz * bz; if (b2 < 1e-12) return p;
  const gamma = 1 / Math.sqrt(1 - b2); const bp = bx * p.px + by * p.py + bz * p.pz; const g2 = (gamma - 1) / b2;
  return { e: gamma * (p.e + bp), px: p.px + g2 * bp * bx + gamma * bx * p.e, py: p.py + g2 * bp * by + gamma * by * p.e, pz: p.pz + g2 * bp * bz + gamma * bz * p.e };
};
export type ParticleKind = 'quark' | 'gluon' | 'lepton' | 'boson' | 'hadron' | 'photon' | 'neutrino';
export interface ParticleDef { readonly pdg: number; readonly name: string; readonly mass: number; readonly charge: number; readonly stable: boolean; readonly kind: ParticleKind; }
export const PARTICLES: Readonly<Record<number, ParticleDef>> = Object.freeze({
  22: { pdg: 22, name: 'photon', mass: 0, charge: 0, stable: true, kind: 'photon' },
  11: { pdg: 11, name: 'e-', mass: PHYS.ELECTRON, charge: -1, stable: true, kind: 'lepton' },
  '-11': { pdg: -11, name: 'e+', mass: PHYS.ELECTRON, charge: 1, stable: true, kind: 'lepton' },
  13: { pdg: 13, name: 'mu-', mass: PHYS.MUON, charge: -1, stable: true, kind: 'lepton' },
  '-13': { pdg: -13, name: 'mu+', mass: PHYS.MUON, charge: 1, stable: true, kind: 'lepton' },
  12: { pdg: 12, name: 'nu_e', mass: 0, charge: 0, stable: true, kind: 'neutrino' },
  14: { pdg: 14, name: 'nu_mu', mass: 0, charge: 0, stable: true, kind: 'neutrino' },
  21: { pdg: 21, name: 'gluon', mass: 0, charge: 0, stable: false, kind: 'gluon' },
  1: { pdg: 1, name: 'd', mass: 0.005, charge: -1 / 3, stable: false, kind: 'quark' },
  2: { pdg: 2, name: 'u', mass: 0.0025, charge: 2 / 3, stable: false, kind: 'quark' },
  3: { pdg: 3, name: 's', mass: 0.095, charge: -1 / 3, stable: false, kind: 'quark' },
  5: { pdg: 5, name: 'b', mass: 4.18, charge: -1 / 3, stable: false, kind: 'quark' },
  23: { pdg: 23, name: 'Z', mass: PHYS.Z_MASS, charge: 0, stable: false, kind: 'boson' },
  24: { pdg: 24, name: 'W+', mass: PHYS.W_MASS, charge: 1, stable: false, kind: 'boson' },
  25: { pdg: 25, name: 'H', mass: PHYS.HIGGS_MASS, charge: 0, stable: false, kind: 'boson' },
  211: { pdg: 211, name: 'pi+', mass: PHYS.PION_CH, charge: 1, stable: true, kind: 'hadron' },
  '-211': { pdg: -211, name: 'pi-', mass: PHYS.PION_CH, charge: -1, stable: true, kind: 'hadron' },
  111: { pdg: 111, name: 'pi0', mass: PHYS.PION0, charge: 0, stable: false, kind: 'hadron' },
  2212: { pdg: 2212, name: 'p', mass: PHYS.PROTON_MASS, charge: 1, stable: true, kind: 'hadron' },
});
/** One-loop running strong coupling (Q in GeV). */
export const alphaS = (Q: number): number => 12 * Math.PI / ((33 - 2 * PHYS.NF) * Math.log(Math.max(Q * Q, 1e-6) / (PHYS.LAMBDA_QCD * PHYS.LAMBDA_QCD)));
/** Toy-normalized inclusive jet cross-section dσ/dpT ∝ αs²/pT⁴ (pb/GeV). Not PDG-precision; documented model. */
export const jetCrossSectionPb = (pT: number): number => 1e6 * alphaS(pT) * alphaS(pT) / Math.pow(Math.max(1, pT), 4);
export interface FinalParticle { readonly pdg: number; readonly p4: FourVec; readonly charge: number; }
export interface DecayNode { readonly pdg: number; readonly p4: FourVec; readonly children: readonly DecayNode[]; }
export interface ColliderEvent { readonly eventId: string; readonly seed: number; readonly sqrtS: number; readonly process: string; readonly hardPT: number; readonly y: number; readonly phi: number; readonly crossSectionPb: number; readonly trees: readonly DecayNode[]; readonly finals: readonly FinalParticle[]; readonly eventHash: string; }
const PROCESSES = ['qcd', 'z', 'w', 'h'] as const;
const PROC_W = [0.86, 0.07, 0.06, 0.01];
export class QuantumColliderEngine {
  constructor(private seedBase: number, private sqrtS: number = 13000) {}
  private pickProcess(rng: () => number): typeof PROCESSES[number] { let u = rng(); for (let i = 0; i < PROC_W.length; i++) { if (u < PROC_W[i]) return PROCESSES[i]; u -= PROC_W[i]; } return 'qcd'; }
  /** Inverse-CDF sampling of dσ/dpT ∝ pT^-5 => pT = pTmin / u^(1/4). */
  private samplePT(rng: () => number): number { const u = Math.max(1e-6, rng()); return PHYS.PT_MIN / Math.pow(u, 0.25); }
  private mkParton(pT: number, y: number, phi: number, pdg: number): FourVec { const m = PARTICLES[pdg].mass; const mT = Math.sqrt(m * m + pT * pT); return { e: mT * Math.cosh(y), px: pT * Math.cos(phi), py: pT * Math.sin(phi), pz: mT * Math.sinh(y) }; }
  private twoBody(parent: FourVec, m1: number, m2: number, rng: () => number): [FourVec, FourVec] {
    const M = Math.max(m1 + m2 + 1e-9, massOf(parent));
    const p = Math.sqrt(Math.max(0, (M * M - (m1 + m2) * (m1 + m2)) * (M * M - (m1 - m2) * (m1 - m2)))) / (2 * M);
    const cosT = 2 * rng() - 1; const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT)); const ph = 2 * Math.PI * rng();
    const d = { x: sinT * Math.cos(ph), y: sinT * Math.sin(ph), z: cosT };
    const b = { x: parent.px / parent.e, y: parent.py / parent.e, z: parent.pz / parent.e };
    return [boost4({ e: Math.sqrt(p * p + m1 * m1), px: p * d.x, py: p * d.y, pz: p * d.z }, b.x, b.y, b.z), boost4({ e: Math.sqrt(p * p + m2 * m2), px: -p * d.x, py: -p * d.y, pz: -p * d.z }, b.x, b.y, b.z)];
  }
  /** Simplified angular-ordered parton shower: g-emission with P ~ αs/π · ln(pT/Λ). */
  private shower(p: FourVec, pdg: number, depth: number, rng: () => number, out: { p: FourVec; pdg: number }[]): void {
    const pT = Math.hypot(p.px, p.py);
    if (depth >= 3 || pT < 6) { out.push({ p, pdg }); return; }
    const prob = Math.min(0.85, (alphaS(pT) / Math.PI) * Math.log(Math.max(2, pT / PHYS.LAMBDA_QCD)) * 0.5);
    if (rng() < prob) {
      const z = 0.3 + 0.4 * rng();
      const scale = (v: FourVec, k: number): FourVec => ({ e: v.e * k, px: v.px * k, py: v.py * k, pz: v.pz * k });
      this.shower(scale(p, z), pdg, depth + 1, rng, out);
      this.shower(scale(p, 1 - z), 21, depth + 1, rng, out);
    } else out.push({ p, pdg });
  }
  /** Lund-like string fragmentation toy: split parton momentum into pions until below threshold. */
  private hadronize(parton: { p: FourVec; pdg: number }, rng: () => number, nodes: DecayNode[], finals: FinalParticle[]): void {
    let rem = parton.p; const children: DecayNode[] = [];
    let guard = 0;
    while (rem.e > 2 * PHYS.PION_CH && guard++ < 24) {
      const z = 0.35 + 0.5 * rng();
      const isPi0 = rng() < 0.33; const pdg = isPi0 ? 111 : (rng() < 0.5 ? 211 : -211);
      const m = PARTICLES[pdg].mass;
      const dir = { x: rem.px / Math.max(1e-9, Math.hypot(rem.px, rem.py, rem.pz)), y: rem.py / Math.max(1e-9, Math.hypot(rem.px, rem.py, rem.pz)), z: rem.pz / Math.max(1e-9, Math.hypot(rem.px, rem.py, rem.pz)) };
      const ePi = rem.e * z; const pMag = Math.sqrt(Math.max(0, ePi * ePi - m * m));
      const piP: FourVec = { e: ePi, px: pMag * dir.x, py: pMag * dir.y, pz: pMag * dir.z };
      if (pdg === 111) { const [g1, g2] = this.twoBody(piP, 0, 0, rng); children.push({ pdg: 111, p4: piP, children: [{ pdg: 22, p4: g1, children: [] }, { pdg: 22, p4: g2, children: [] }] }); finals.push({ pdg: 22, p4: g1, charge: 0 }, { pdg: 22, p4: g2, charge: 0 }); }
      else { children.push({ pdg, p4: piP, children: [] }); finals.push({ pdg, p4: piP, charge: PARTICLES[pdg].charge }); }
      rem = { e: rem.e - ePi, px: rem.px - piP.px, py: rem.py - piP.py, pz: rem.pz - piP.pz };
      if (rem.e <= 0) break;
    }
    nodes.push({ pdg: parton.pdg, p4: parton.p, children });
  }
  private decayResonance(pdg: number, p4: FourVec, rng: () => number, finals: FinalParticle[]): DecayNode {
    const u = rng();
    if (pdg === 23) {
      if (u < 0.1) { const [a, b] = this.twoBody(p4, PHYS.ELECTRON, PHYS.ELECTRON, rng); finals.push({ pdg: 11, p4: a, charge: -1 }, { pdg: -11, p4: b, charge: 1 }); return { pdg, p4, children: [{ pdg: 11, p4: a, children: [] }, { pdg: -11, p4: b, children: [] }] }; }
      if (u < 0.2) { const [a, b] = this.twoBody(p4, PHYS.MUON, PHYS.MUON, rng); finals.push({ pdg: 13, p4: a, charge: -1 }, { pdg: -13, p4: b, charge: 1 }); return { pdg, p4, children: [{ pdg: 13, p4: a, children: [] }, { pdg: -13, p4: b, children: [] }] }; }
      const [a, b] = this.twoBody(p4, 0.5, 0.5, rng); const nodes: DecayNode[] = []; const f2: FinalParticle[] = [];
      this.hadronize({ p: a, pdg: 2 }, rng, nodes, f2); this.hadronize({ p: b, pdg: -2 }, rng, nodes, f2);
      finals.push(...f2); return { pdg, p4, children: nodes };
    }
    if (pdg === 24) {
      if (u < 0.3) { const [a, b] = this.twoBody(p4, PHYS.MUON, 0, rng); finals.push({ pdg: 13, p4: a, charge: -1 }, { pdg: 14, p4: b, charge: 0 }); return { pdg, p4, children: [{ pdg: 13, p4: a, children: [] }, { pdg: 14, p4: b, children: [] }] }; }
      const [a, b] = this.twoBody(p4, 0.5, 0.5, rng); const nodes: DecayNode[] = []; const f2: FinalParticle[] = [];
      this.hadronize({ p: a, pdg: 2 }, rng, nodes, f2); this.hadronize({ p: b, pdg: 21 }, rng, nodes, f2);
      finals.push(...f2); return { pdg, p4, children: nodes };
    }
    if (pdg === 25) {
      if (u < 0.02) { const [a, b] = this.twoBody(p4, 0, 0, rng); finals.push({ pdg: 22, p4: a, charge: 0 }, { pdg: 22, p4: b, charge: 0 }); return { pdg, p4, children: [{ pdg: 22, p4: a, children: [] }, { pdg: 22, p4: b, children: [] }] }; }
      const [a, b] = this.twoBody(p4, 4.18, 4.18, rng); const nodes: DecayNode[] = []; const f2: FinalParticle[] = [];
      this.hadronize({ p: a, pdg: 5 }, rng, nodes, f2); this.hadronize({ p: b, pdg: -5 }, rng, nodes, f2);
      finals.push(...f2); return { pdg, p4, children: nodes };
    }
    return { pdg, p4, children: [] };
  }
  generateEvent(index: number): ColliderEvent {
    const rng = mulberry32((this.seedBase ^ Math.imul(index + 1, 2654435761)) >>> 0);
    const process = this.pickProcess(rng);
    const pT = this.samplePT(rng);
    const y = (2 * rng() - 1) * PHYS.Y_MAX;
    const phi = 2 * Math.PI * rng();
    const trees: DecayNode[] = []; const finals: FinalParticle[] = [];
    let cross = jetCrossSectionPb(pT);
    if (process === 'qcd') {
      const out: { p: FourVec; pdg: number }[] = [];
      this.shower(this.mkParton(pT, y, phi, 21), 21, 0, rng, out);
      this.shower(this.mkParton(pT, -y * 0.8, phi + Math.PI, 21), 21, 0, rng, out);
      for (const parton of out) this.hadronize(parton, rng, trees, finals);
    } else {
      const pdg = process === 'z' ? 23 : process === 'w' ? 24 : 25;
      const m0 = PARTICLES[pdg].mass + (rng() * 3 - 1.5);
      const p4 = this.mkParton(pT, y, phi, pdg);
      const scaled: FourVec = { e: Math.sqrt(m0 * m0 + pT * pT) * Math.cosh(y), px: p4.px, py: p4.py, pz: Math.sqrt(m0 * m0 + pT * pT) * Math.sinh(y) };
      trees.push(this.decayResonance(pdg, scaled, rng, finals));
      cross = process === 'z' ? 1.9e3 : process === 'w' ? 1.8e4 : 0.05;
    }
    const eventHash = sha256hex(stableStringify({ seed: this.seedBase, index, process, pT: +pT.toFixed(6), y: +y.toFixed(6), phi: +phi.toFixed(6), finals: finals.map(f => [f.pdg, +f.p4.e.toFixed(6), +f.p4.px.toFixed(6), +f.p4.py.toFixed(6), +f.p4.pz.toFixed(6)]) }));
    return { eventId: 'EVT-' + eventHash.slice(0, 12).toUpperCase(), seed: this.seedBase, sqrtS: this.sqrtS, process, hardPT: +pT.toFixed(4), y: +y.toFixed(4), phi: +phi.toFixed(4), crossSectionPb: +cross.toExponential(6), trees, finals, eventHash };
  }
  /** Anchor a collision result into the EvidenceLedger as a model-claim with full provenance. */
  commitToLedger(ledger: EvidenceLedger, ev: ColliderEvent): string {
    const input: NewEvidenceInput = { sourceUrl: 'genesis://collider/' + ev.eventId, sourceTimestamp: null, claim: 'pp->' + ev.process + ' @sqrtS=' + this.sqrtS + 'GeV pT=' + ev.hardPT + 'GeV sigma=' + ev.crossSectionPb + 'pb', claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'quantum-collider-engine', independentSourceIds: [] } };
    return ledger.addRecord(input).record.contentHash;
  }
}
