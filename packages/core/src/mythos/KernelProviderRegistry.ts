/* Proprietary / All Rights Reserved - Genesis OS */
import type { CicadaEngine, ProcurementEvent, CicadaAssessment } from './CicadaEngine.js';
import type { ZeroTrustSemanticEngine, Assertion, CheckResult } from '../postmythos/ZeroTrustSemanticEngine.js';
import type { ActionGateSynthesizer, GraphStateFlags, ActionSpec } from '../postmythos/ActionGateSynthesizer.js';

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
