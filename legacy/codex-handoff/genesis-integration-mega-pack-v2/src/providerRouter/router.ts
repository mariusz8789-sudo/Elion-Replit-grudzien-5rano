import type { ModelProvider, RoutingEvidencePort, RoutingPolicy } from "./ports.js";
import { REASONING_ONLY_BY_DEFAULT, type ModelResult, type ModelTask, type ProviderDescriptor } from "./types.js";

/**
 * FIX (red-team finding): a raw `ModelResult` from any `ModelProvider.run()` is always
 * `resultKind: 'REASONING_ONLY'` at the point it comes back from a provider — nothing
 * in `adapters.ts` can produce anything else (it only wraps an LLM text/JSON response).
 * The ONLY way a result may carry `VERIFIED_BY_SOLVER` is by passing it, plus a real
 * `solverEvidenceRef` string, through this function — which callers do after they've
 * actually run the referenced real solver (RDKit/docking/QM/ADMET, a static-analysis
 * tool, etc.) and confirmed the model's proposal against it. This is the guardrail the
 * V1 audit found entirely missing: without it, nothing stopped a caller from treating
 * raw LLM output as a verified drug-candidate or scientific/security result.
 */
export function attachSolverVerification(result: ModelResult, solverEvidenceRef: string): ModelResult {
  if (!solverEvidenceRef.trim()) throw new Error("solverEvidenceRef is required to mark a result VERIFIED_BY_SOLVER.");
  return { ...result, resultKind: "VERIFIED_BY_SOLVER", solverEvidenceRef };
}

export class GenesisModelRouter {
  private readonly providers = new Map<string, ModelProvider>();

  constructor(
    private readonly policy: RoutingPolicy,
    private readonly evidence: RoutingEvidencePort
  ) {}

  register(provider: ModelProvider): void {
    if (this.providers.has(provider.descriptor.id)) {
      throw new Error(`Duplicate provider id: ${provider.descriptor.id}`);
    }
    this.providers.set(provider.descriptor.id, provider);
  }

  descriptors(): ProviderDescriptor[] {
    return [...this.providers.values()].map((p) => structuredClone(p.descriptor));
  }

  async run(task: ModelTask): Promise<ModelResult> {
    /**
     * FIX (red-team finding): V1 called `policy.select()` and the provider-lookup
     * BEFORE the try/catch, so "no eligible provider" and "selected provider not
     * registered" both threw with zero evidence emitted — a silent audit-trail gap.
     * Both paths are now inside the same try/catch as provider execution, so every
     * failure mode emits MODEL_FAILED.
     */
    try {
      const decision = this.policy.select(task, this.descriptors());
      await this.evidence.append({ type: "MODEL_ROUTED", taskId: task.taskId, payload: decision });

      const provider = this.providers.get(decision.selectedProviderId);
      if (!provider) throw new Error("Selected provider not registered.");

      const result = await provider.run(task);
      if (REASONING_ONLY_BY_DEFAULT.has(task.class) && result.resultKind !== "REASONING_ONLY") {
        throw new Error(`Provider must not self-report resultKind for ${task.class}; only attachSolverVerification() may upgrade it.`);
      }
      await this.evidence.append({ type: "MODEL_COMPLETED", taskId: task.taskId, payload: {
        providerId: result.providerId,
        model: result.model,
        resultKind: result.resultKind,
        usage: result.usage ?? null
      }});
      return result;
    } catch (error) {
      await this.evidence.append({
        type: "MODEL_FAILED",
        taskId: task.taskId,
        payload: { error: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
  }
}
