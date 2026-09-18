/* Proprietary / All Rights Reserved - Genesis OS */
import type { CicadaEngine, ProcurementEvent, CicadaAssessment } from './CicadaEngine.js';
import type { ZeroTrustSemanticEngine, Assertion, CheckResult } from '../postmythos/ZeroTrustSemanticEngine.js';
import type { ActionGateSynthesizer, GraphStateFlags, ActionSpec } from '../postmythos/ActionGateSynthesizer.js';
import type { EvidenceLedger } from '../knowledge/EvidenceLedger.js';
import { QuantumColliderEngine, type ColliderEvent } from '../collider/QuantumColliderEngine.js';
import { ThermodynamicLabEngine, type LabResult } from '../lab/ThermodynamicLabEngine.js';

export interface KernelContext { readonly kernelId: string; readonly route: string; readonly operatorId: string; }
export interface AnalysisProvider {
  readonly providerId: string;
  readonly capabilities: readonly string[];
  analyze(ctx: KernelContext, request: unknown): unknown;
}
/** Single-kernel policy: exactly one orchestrator kernel may bind; Mythos modules register as analysis providers only. */
export class KernelProviderRegistry {
  private providers = new Map<string, AnalysisProvider>();
  private kernelId: string | null = null;
  bindKernel(kernelId: string): void {
    if (this.kernelId !== null && this.kernelId !== kernelId) throw new Error('KERNEL_ALREADY_BOUND:' + this.kernelId);
    this.kernelId = kernelId;
  }
  get boundKernel(): string | null { return this.kernelId; }
  register(p: AnalysisProvider): void {
    if (this.providers.has(p.providerId)) throw new Error('DUPLICATE_PROVIDER:' + p.providerId);
    this.providers.set(p.providerId, p);
  }
  unregister(providerId: string): void { this.providers.delete(providerId); }
  resolve(capability: string): AnalysisProvider | null {
    for (const p of this.providers.values()) if (p.capabilities.includes(capability)) return p;
    return null;
  }
  list(): readonly string[] { return [...this.providers.keys()]; }
}
export const kernelRegistry = new KernelProviderRegistry();

export function cicadaProvider(engine: CicadaEngine): AnalysisProvider {
  return { providerId: 'cicada-ledger', capabilities: ['supply-chain-anomaly'], analyze: (_ctx, req) => engine.evaluate(req as readonly ProcurementEvent[]) as CicadaAssessment };
}
export function ztseProvider(engine: ZeroTrustSemanticEngine): AnalysisProvider {
  return { providerId: 'ztse-verify', capabilities: ['semantic-verify'], analyze: (_ctx, req) => engine.check(req as Omit<Assertion, 'id'>) as CheckResult };
}
export function actionGateProvider(gate: ActionGateSynthesizer): AnalysisProvider {
  return { providerId: 'action-gate', capabilities: ['action-synthesis'], analyze: (_ctx, req) => gate.synthesize(req as GraphStateFlags) as readonly ActionSpec[] };
}

/** Collider request: one event of a seeded run. `sqrtS` in GeV (default 13000). */
export interface ColliderRequest { readonly seed: number; readonly index: number; readonly sqrtS?: number; }
export interface ColliderAnalysis { readonly event: ColliderEvent; readonly ledgerContentHash: string; readonly label: 'TOY_MC_MODEL'; }
/** Every generated event is anchored in the ledger through the engine's own commitToLedger(). */
export function colliderProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'quantum-collider', capabilities: ['particle-collision-sim'],
    analyze: (_ctx, req) => {
      const r = req as ColliderRequest;
      const engine = new QuantumColliderEngine(r.seed >>> 0, r.sqrtS ?? 13000);
      const event = engine.generateEvent(r.index);
      const ledgerContentHash = engine.commitToLedger(ledger, event);
      const out: ColliderAnalysis = { event, ledgerContentHash, label: 'TOY_MC_MODEL' };
      return out;
    },
  };
}
/** Thermo-lab request: reagents in mol, ignition flag, initial temperature in K (default 298.15). */
export interface ThermoLabRequest { readonly seed: number; readonly reagents: Readonly<Record<string, number>>; readonly ignition: boolean; readonly T0?: number; }
export interface ThermoLabAnalysis { readonly result: LabResult; readonly ledgerContentHash: string; readonly label: 'THERMODYNAMIC_MODEL'; }
/** Every mix is anchored in the ledger through the engine's own commitToLedger(). */
export function thermoLabProvider(ledger: EvidenceLedger): AnalysisProvider {
  return {
    providerId: 'thermo-lab', capabilities: ['thermodynamic-reaction-sim'],
    analyze: (_ctx, req) => {
      const r = req as ThermoLabRequest;
      const engine = new ThermodynamicLabEngine(r.seed >>> 0);
      const result = engine.mix(r.reagents, r.ignition, r.T0 ?? 298.15);
      const ledgerContentHash = engine.commitToLedger(ledger, result);
      const out: ThermoLabAnalysis = { result, ledgerContentHash, label: 'THERMODYNAMIC_MODEL' };
      return out;
    },
  };
}
