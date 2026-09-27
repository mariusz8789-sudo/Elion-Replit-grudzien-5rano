/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, type EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
import { mulberry32 } from '../determinism.js';
export { mulberry32 };
export const CONST = Object.freeze({ G: 6.67430e-11, C: 299792458, HBAR: 1.054571817e-34, KB: 1.380649e-23, GEV_TO_KG: 1.78266192e-27, GEV_TO_J: 1.602176634e-10, M_PLANCK_GEV: 1.220910e19 } as const);
export type BhRegime = '4D_PLANCK' | 'ADD_TEV_SPECULATIVE';
export type EpistemicLabel = 'hypothesis' | 'speculative';
export interface HawkingQuantum { readonly pdg: number; readonly name: string; readonly energyGeV: number; readonly weight: number; }
export interface BlackHoleState { readonly massGeV: number; readonly massKg: number; readonly rsM: number; readonly temperatureK: number; readonly lifetimeS: number; readonly regime: BhRegime; readonly label: EpistemicLabel; readonly quanta: readonly HawkingQuantum[]; readonly eventHash: string; }
export interface FormationResult { readonly formed: boolean; readonly regime: BhRegime | null; readonly reason: string; readonly bh: BlackHoleState | null; readonly eventHash: string; }
/** r_s = 2GM/c^2 */
export const schwarzschildRadiusM = (massKg: number): number => (2 * CONST.G * massKg) / (CONST.C * CONST.C);
/** T_H = hbar c^3 / (8 pi G M k_B) */
export const hawkingTemperatureK = (massKg: number): number => (CONST.HBAR * Math.pow(CONST.C, 3)) / (8 * Math.PI * CONST.G * Math.max(1e-30, massKg) * CONST.KB);
/** tau = 5120 pi G^2 M^3 / (hbar c^4) */
export const lifetimeS = (massKg: number): number => (5120 * Math.PI * CONST.G * CONST.G * Math.pow(massKg, 3)) / (CONST.HBAR * Math.pow(CONST.C, 4));
const dMdt = (massKg: number): number => -(CONST.HBAR * Math.pow(CONST.C, 4)) / (15360 * Math.PI * CONST.G * CONST.G * Math.max(1e-30, massKg * massKg));
const SPECIES: readonly { pdg: number; name: string; g: number; fermion: boolean; peak: number }[] = [
  { pdg: 22, name: 'photon', g: 2, fermion: false, peak: 2.701 },
  { pdg: 12, name: 'nu_e', g: 2, fermion: true, peak: 3.151 },
  { pdg: 14, name: 'nu_mu', g: 2, fermion: true, peak: 3.151 },
  { pdg: 11, name: 'e-', g: 2, fermion: true, peak: 3.151 },
  { pdg: -11, name: 'e+', g: 2, fermion: true, peak: 3.151 },
  { pdg: 13, name: 'mu-', g: 2, fermion: true, peak: 3.151 },
];
/** Deterministic Hawking quanta sample: weights ∝ g_i (×7/8 for fermions), energies ∼ peak·kT. */
export function hawkingSpectrum(massKg: number, seed: number, maxQuanta = 48): readonly HawkingQuantum[] {
  const rng = mulberry32(seed);
  const Tk = hawkingTemperatureK(massKg);
  const kTGeV = (CONST.KB * Tk) / CONST.GEV_TO_J;
  const out: HawkingQuantum[] = [];
  const totalG = SPECIES.reduce((a, s) => a + s.g * (s.fermion ? 0.875 : 1), 0);
  for (const s of SPECIES) {
    const w = (s.g * (s.fermion ? 0.875 : 1)) / totalG;
    const n = Math.max(1, Math.round(w * maxQuanta));
    for (let i = 0; i < n; i++) {
      const jitter = 0.6 + 0.8 * rng();
      out.push({ pdg: s.pdg, name: s.name, energyGeV: +(kTGeV * s.peak * jitter).toExponential(6), weight: +w.toFixed(6) });
    }
  }
  return out;
}
/** Deterministic evaporation timeline via dM/dt = -hbar c^4 /(15360 pi G^2 M^2). */
export function evaporationTimeline(massKg: number, steps = 48): readonly { tS: number; massKg: number; TK: number }[] {
  const out: { tS: number; massKg: number; TK: number }[] = [];
  let M = massKg; let t = 0;
  const total = lifetimeS(massKg);
  for (let i = 0; i < steps && M > 0; i++) {
    out.push({ tS: +t.toExponential(6), massKg: +M.toExponential(6), TK: +hawkingTemperatureK(M).toExponential(6) });
    const dt = Math.max(1e-30, total / steps);
    M += dMdt(M) * dt; t += dt;
    if (M <= 0) break;
  }
  return out;
}
export class BlackHoleEventHorizonEngine {
  constructor(private seedBase: number) {}
  /** Micro-BH formation: 4D requires sqrtS >= M_Planck (never at LHC); ADD TeV-scale threshold is SPECULATIVE (no evidence). */
  attemptFormation(sqrtSGeV: number, opts: { addThresholdTeV?: number } = {}): FormationResult {
    const hash = sha256hex(stableStringify({ seed: this.seedBase, sqrtSGeV, add: opts.addThresholdTeV ?? null }));
    if (sqrtSGeV >= CONST.M_PLANCK_GEV) {
      const massGeV = sqrtSGeV * 0.5; const massKg = massGeV * CONST.GEV_TO_KG;
      const bh: BlackHoleState = { massGeV: +massGeV.toExponential(6), massKg: +massKg.toExponential(6), rsM: +schwarzschildRadiusM(massKg).toExponential(6), temperatureK: +hawkingTemperatureK(massKg).toExponential(6), lifetimeS: +lifetimeS(massKg).toExponential(6), regime: '4D_PLANCK', label: 'hypothesis', quanta: hawkingSpectrum(massKg, this.seedBase ^ 0x5f3a), eventHash: hash };
      return { formed: true, regime: '4D_PLANCK', reason: 'ABOVE_PLANCK_THRESHOLD', bh, eventHash: hash };
    }
    const addGeV = (opts.addThresholdTeV ?? Infinity) * 1000;
    if (Number.isFinite(addGeV) && sqrtSGeV >= addGeV) {
      const massGeV = sqrtSGeV * 0.5; const massKg = massGeV * CONST.GEV_TO_KG;
      const bh: BlackHoleState = { massGeV: +massGeV.toExponential(6), massKg: +massKg.toExponential(6), rsM: +schwarzschildRadiusM(massKg).toExponential(6), temperatureK: +hawkingTemperatureK(massKg).toExponential(6), lifetimeS: +lifetimeS(massKg).toExponential(6), regime: 'ADD_TEV_SPECULATIVE', label: 'speculative', quanta: hawkingSpectrum(massKg, this.seedBase ^ 0x5f3a), eventHash: hash };
      return { formed: true, regime: 'ADD_TEV_SPECULATIVE', reason: 'ADD_TEV_SCENARIO_SPECULATIVE_NO_EVIDENCE', bh, eventHash: hash };
    }
    return { formed: false, regime: null, reason: 'BELOW_THRESHOLD', bh: null, eventHash: hash };
  }
  commitToLedger(ledger: EvidenceLedger, res: FormationResult): string {
    const input: NewEvidenceInput = { sourceUrl: 'genesis://cern/bh/' + res.eventHash.slice(0, 12), sourceTimestamp: null, claim: 'micro-BH formation=' + res.formed + ' regime=' + (res.regime ?? 'none') + ' label=' + (res.bh?.label ?? 'n/a') + ' rs=' + (res.bh?.rsM ?? 0) + 'm', claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'blackhole-event-horizon-engine', independentSourceIds: [] } };
    return ledger.addRecord(input).record.contentHash;
  }
}
