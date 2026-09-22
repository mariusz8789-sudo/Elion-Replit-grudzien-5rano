import type { ModelTask, ProviderCapability, ProviderDescriptor, RoutingDecision } from "./types.js";
import type { RoutingPolicy } from "./ports.js";

const COST_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const;

function capabilityFor(provider: ProviderDescriptor, task: ModelTask): ProviderCapability | undefined {
  return provider.capabilities.find((x) => x.task === task.class);
}

/** Unchanged from V1 (no defects found here — vendor-agnostic, correctly fails closed
 * via throw when no provider is eligible; see router.ts for the evidence-emission fix
 * around that throw). */
export class DefaultGenesisRoutingPolicy implements RoutingPolicy {
  select(task: ModelTask, providers: readonly ProviderDescriptor[]): RoutingDecision {
    const forbidden = new Set(task.forbiddenProviderIds ?? []);
    const preferred = new Set(task.preferredProviderIds ?? []);

    const eligible = providers
      .filter((p) => p.enabled && !forbidden.has(p.id))
      .map((provider) => ({ provider, cap: capabilityFor(provider, task) }))
      .filter((x): x is { provider: ProviderDescriptor; cap: ProviderCapability } => Boolean(x.cap))
      .filter((x) => COST_RANK[x.cap.costClass] <= COST_RANK[task.maxCostClass])
      .filter((x) => !task.requireStructuredOutput || x.cap.supportsStructuredOutput);

    if (eligible.length === 0) {
      throw new Error(`No eligible provider for task class ${task.class}`);
    }

    eligible.sort((a, b) => {
      const pref = Number(preferred.has(b.provider.id)) - Number(preferred.has(a.provider.id));
      if (pref !== 0) return pref;
      if (a.cap.quality !== b.cap.quality) return b.cap.quality - a.cap.quality;
      return COST_RANK[a.cap.costClass] - COST_RANK[b.cap.costClass];
    });

    const selected = eligible[0]!;
    return {
      taskId: task.taskId,
      selectedProviderId: selected.provider.id,
      reason: `Selected for ${task.class}: quality=${selected.cap.quality}, cost=${selected.cap.costClass}`,
      alternatives: eligible.slice(1).map((x) => x.provider.id)
    };
  }
}
