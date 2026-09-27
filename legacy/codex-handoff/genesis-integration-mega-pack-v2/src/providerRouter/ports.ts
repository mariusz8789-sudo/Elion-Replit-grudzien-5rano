import type { ModelResult, ModelTask, ProviderDescriptor, RoutingDecision } from "./types.js";

export interface ModelProvider {
  readonly descriptor: ProviderDescriptor;
  run(task: ModelTask): Promise<ModelResult>;
}

export interface RoutingEvidencePort {
  append(event: {
    type: "MODEL_ROUTED" | "MODEL_COMPLETED" | "MODEL_FAILED";
    taskId: string;
    payload: unknown;
  }): Promise<void> | void;
}

export interface RoutingPolicy {
  select(task: ModelTask, providers: readonly ProviderDescriptor[]): RoutingDecision;
}
