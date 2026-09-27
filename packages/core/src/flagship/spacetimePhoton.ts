/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';

/**
 * PHOTON PROPAGATION IN A WEAK GRAVITATIONAL FIELD vs. A FLAT BASELINE
 * (D-130) — the flagship physics scenario as a deterministic MODEL:
 *   Shapiro delay   Δt = (2GM/c³) · ln(4 r₁ r₂ / b²)      (weak field, b ≪ r₁, r₂)
 *   light deflection α = 4GM/(c² b)
 *   flat baseline   t₀ = (r₁ + r₂)/c, α₀ = 0
 * c = 299 792 458 m/s is the SI-defined constant: nothing here measures it,
 * and the comparison is between two models, never against the world.
 */
export const C_SI = 299_792_458; export const G_SI = 6.67430e-11;
export interface SpacetimePhotonInput { readonly massKg: number; readonly impactParameterM: number; readonly emitterDistanceM: number; readonly receiverDistanceM: number; }
export interface SpacetimePhotonReport {
  readonly inputs: SpacetimePhotonInput; readonly schwarzschildRadiusM: number; readonly flatTravelTimeS: number; readonly shapiroDelayS: number; readonly curvedTravelTimeS: number; readonly deflectionRad: number; readonly deflectionArcsec: number;
  readonly curvatureProxy: number; readonly regime: 'WEAK_FIELD' | 'OUT_OF_MODEL'; readonly label: 'MODEL'; readonly notes: readonly string[]; readonly contentHash: string;
}
export function spacetimePhoton(i: SpacetimePhotonInput): SpacetimePhotonReport {
  if (!(i.massKg >= 0) || !(i.impactParameterM > 0) || !(i.emitterDistanceM > 0) || !(i.receiverDistanceM > 0)) throw new Error('SPACETIME_PHOTON_INVALID_INPUT');
  const rs = (2 * G_SI * i.massKg) / (C_SI * C_SI);
  const flat = (i.emitterDistanceM + i.receiverDistanceM) / C_SI;
  const shapiro = i.massKg === 0 ? 0 : ((2 * G_SI * i.massKg) / C_SI ** 3) * Math.log((4 * i.emitterDistanceM * i.receiverDistanceM) / (i.impactParameterM * i.impactParameterM));
  const deflection = i.massKg === 0 ? 0 : (4 * G_SI * i.massKg) / (C_SI * C_SI * i.impactParameterM);
  const regime: SpacetimePhotonReport['regime'] = i.impactParameterM > 20 * rs ? 'WEAK_FIELD' : 'OUT_OF_MODEL';
  const body = { inputs: i, schwarzschildRadiusM: rs, flatTravelTimeS: flat, shapiroDelayS: shapiro, curvedTravelTimeS: flat + shapiro, deflectionRad: deflection, deflectionArcsec: deflection * 206264.806, curvatureProxy: i.impactParameterM > 0 ? rs / i.impactParameterM : 0, regime, label: 'MODEL' as const, notes: ['first-order weak-field formulas (Shapiro delay, Einstein deflection); the flat baseline is the same geometry with M = 0', 'c is the SI-defined constant: this compares two models, it measures nothing', regime === 'OUT_OF_MODEL' ? 'impact parameter within 20 r_s: the first-order formulas are not trustworthy here' : 'weak-field regime holds'] };
  return { ...body, contentHash: sha256hex(stableStringify(body)) };
}
export function commitSpacetimePhoton(ledger: EvidenceLedger, report: SpacetimePhotonReport, worldId: string): string {
  return ledger.addRecord({ sourceUrl: `genesis://spacetime-photon/${worldId}/${report.contentHash.slice(0, 12)}`, sourceTimestamp: null, claim: `Spacetime photon model massKg=${report.inputs.massKg} impactParameterM=${report.inputs.impactParameterM} shapiroDelayS=${report.shapiroDelayS} deflectionArcsec=${report.deflectionArcsec} curvatureProxy=${report.curvatureProxy} regime=${report.regime} contentHash=${report.contentHash}`, claimType: 'model', confidence: 1, provenance: { sourceKind: 'dataset', retrievedBy: 'spacetime-photon-model', independentSourceIds: [] } }).record.contentHash;
}
