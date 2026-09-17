/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex, type Clock } from '../expansionHash.js';
export const C_LIGHT = 299792458;
export interface PhysicalBounds { readonly minEnergy?: number; readonly maxEnergy?: number; readonly maxVelocity?: number; readonly conservationTolerance?: number; }
export interface HypothesisEffect { readonly energyDelta?: number; readonly velocity?: number; readonly massDelta?: number; }
export interface Hypothesis { readonly id: string; readonly statement: string; readonly domain: string; readonly predictedEffect: HypothesisEffect; readonly assumptions: readonly string[]; readonly grounded: boolean; }
export type TournamentStatus = 'ACTIVE' | 'REJECT_UNPHYSICAL' | 'ELIMINATED' | 'LEADING';
export interface TournamentEntry { readonly hypothesis: Hypothesis; elo: number; status: TournamentStatus; rejectionReasons: readonly string[]; rounds: number; readonly groundedFlag: boolean; }
export interface ReflectionVerdict { readonly hypothesisId: string; readonly passesPhysicalBounds: boolean; readonly violations: readonly string[]; readonly ungrounded: boolean; }
export interface RoundRecord { readonly round: number; readonly a: string; readonly b: string; readonly outcome: 'A' | 'B' | 'DRAW'; readonly eloAfter: Readonly<Record<string, number>>; readonly hash: string; }
const expectedScore = (ra: number, rb: number): number => 1 / (1 + Math.pow(10, (rb - ra) / 400));
/** Pre-execution Elo tournament with physical-bounds gating (REJECT_UNPHYSICAL before expensive C3 sims). */
export class HypothesisTournament {
  private entries = new Map<string, TournamentEntry>();
  private rounds: RoundRecord[] = [];
  private ungroundedFlags: string[] = [];
  constructor(private bounds: PhysicalBounds, private clock: Clock, private kFactor = 32) {}
  addHypothesis(h: Hypothesis, initialElo = 1500): void {
    this.entries.set(h.id, { hypothesis: h, elo: initialElo, status: 'ACTIVE', rejectionReasons: [], rounds: 0, groundedFlag: h.grounded });
    if (!h.grounded) this.ungroundedFlags.push('UNGROUNDED_STATE:' + h.id);
  }
  /** Pre-execution reflection loop: physics/conservation screening. Never silently masks ungrounded state. */
  reflect(hypothesisId: string): ReflectionVerdict {
    const e = this.entries.get(hypothesisId); if (!e) throw new Error('UNKNOWN_HYPOTHESIS:' + hypothesisId);
    const v: string[] = []; const eff = e.hypothesis.predictedEffect;
    const maxV = this.bounds.maxVelocity ?? C_LIGHT;
    if (eff.velocity !== undefined && Math.abs(eff.velocity) > maxV) v.push('VELOCITY_EXCEEDS_BOUND:' + eff.velocity);
    if (eff.energyDelta !== undefined) {
      if (this.bounds.maxEnergy !== undefined && eff.energyDelta > this.bounds.maxEnergy) v.push('ENERGY_ABOVE_MAX:' + eff.energyDelta);
      if (this.bounds.minEnergy !== undefined && eff.energyDelta < this.bounds.minEnergy) v.push('ENERGY_BELOW_MIN:' + eff.energyDelta);
    }
    const tol = this.bounds.conservationTolerance ?? 0;
    if (eff.massDelta !== undefined && Math.abs(eff.massDelta) > tol) v.push('CONSERVATION_VIOLATION:' + eff.massDelta);
    if (v.length > 0) { e.status = 'REJECT_UNPHYSICAL'; e.rejectionReasons = v; }
    return { hypothesisId, passesPhysicalBounds: v.length === 0, violations: v, ungrounded: !e.hypothesis.grounded };
  }
  reflectAll(): readonly ReflectionVerdict[] { return [...this.entries.keys()].map(id => this.reflect(id)); }
  /** Gate: ids that must NOT be sent to expensive C3 simulation. */
  gatedRejects(): readonly string[] { return [...this.entries.values()].filter(e => e.status === 'REJECT_UNPHYSICAL').map(e => e.hypothesis.id); }
  runRound(matchups: readonly (readonly [string, string])[], outcomes: readonly ('A' | 'B' | 'DRAW')[]): void {
    matchups.forEach(([a, b], i) => {
      const ea = this.entries.get(a); const eb = this.entries.get(b);
      if (!ea || !eb || ea.status === 'REJECT_UNPHYSICAL' || eb.status === 'REJECT_UNPHYSICAL') return;
      const ea0 = ea.elo, eb0 = eb.elo; const eaExp = expectedScore(ea0, eb0);
      const sa = outcomes[i] === 'A' ? 1 : outcomes[i] === 'B' ? 0 : 0.5;
      ea.elo = +(ea0 + this.kFactor * (sa - eaExp)).toFixed(2);
      eb.elo = +(eb0 + this.kFactor * ((1 - sa) - (1 - eaExp))).toFixed(2);
      ea.rounds += 1; eb.rounds += 1;
      if (sa === 0) ea.status = ea.elo < 1200 ? 'ELIMINATED' : ea.status;
      if (sa === 1) eb.status = eb.elo < 1200 ? 'ELIMINATED' : eb.status;
      const eloAfter: Record<string, number> = {}; for (const [id, en] of this.entries) eloAfter[id] = en.elo;
      this.rounds.push({ round: this.rounds.length, a, b, outcome: outcomes[i], eloAfter, hash: sha256hex(stableStringify({ round: this.rounds.length, a, b, outcome: outcomes[i], eloAfter, at: this.clock.now() })) });
    });
    const active = [...this.entries.values()].filter(e => e.status === 'ACTIVE' || e.status === 'LEADING');
    if (active.length) { const best = active.reduce((x, y) => (y.elo > x.elo ? y : x)); for (const e of active) e.status = e === best ? 'LEADING' : 'ACTIVE'; }
  }
  getStandings(): readonly TournamentEntry[] { return [...this.entries.values()].sort((x, y) => y.elo - x.elo); }
  getRounds(): readonly RoundRecord[] { return this.rounds; }
  getUngroundedFlags(): readonly string[] { return this.ungroundedFlags; }
}
