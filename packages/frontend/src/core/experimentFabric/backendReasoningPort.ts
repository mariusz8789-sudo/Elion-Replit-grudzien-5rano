import type { ApiResult, GenesisSelfModel, ScientificClaimProposal } from '../backend/client';
import type { ModelInvokePort, ModelInvokeResult, ModelProviderDescriptor, ModelProviderIdentity, ModelReasoningRequest } from './modelRouter';

/**
 * ENTITY-3 — the canonical `modelRouter.ts`'s port to the ONE backend reasoning adapter
 * (`backend/src/reasoningProvider.mjs` + `claimProposal.mjs`).
 *
 * The browser never holds a provider key and never calls a provider: the router picks the provider the
 * backend's self model says is configured, and this port hands the question to the backend, which asks
 * the model, validates the answer and stores it as PROPOSED. What comes back is the backend's verdict
 * as text, so the router's result stays `REASONING_ONLY`; nothing here can make it evidence.
 */

const PROVIDER_IDS: readonly ModelProviderIdentity[] = ['OPENAI_ASTRA', 'ANTHROPIC_CLAUDE', 'PRIVATE_LOCAL'];
/** The task classes a claim proposal answers. Anything else is not routed to the backend adapter. */
export const BACKEND_REASONING_TASK_CLASSES = ['SCIENTIFIC_REASONING', 'DRUG_CANDIDATE_RESEARCH', 'META_COGNITION'] as const;

/** The router's descriptor, read from the live self model: available only when the backend says CONFIGURED. */
export function backendReasoningDescriptor(selfModel: GenesisSelfModel | null): ModelProviderDescriptor | null {
  const reasoning = selfModel?.knownModels.find((m) => m.kind === 'REASONING_MODEL');
  const providerId = PROVIDER_IDS.find((id) => id === reasoning?.providerId);
  if (!reasoning || !providerId) return null;
  return { providerId, taskClasses: BACKEND_REASONING_TASK_CLASSES, available: reasoning.status === 'CONFIGURED' };
}

type ProposeFn = (input: { question: string; hypothesisId?: string | null }) => Promise<ApiResult<{ status: 'PROPOSED'; proposal: ScientificClaimProposal }>>;

export interface BackendReasoningOutput {
  readonly status: string;
  readonly proposal: ScientificClaimProposal | null;
}

export function createBackendReasoningPort(propose: ProposeFn, hypothesisId: string | null = null): ModelInvokePort {
  return {
    async invoke(providerId: ModelProviderIdentity, request: ModelReasoningRequest): Promise<ModelInvokeResult> {
      const res = await propose({ question: request.prompt, hypothesisId });
      const output: BackendReasoningOutput = res.ok
        ? { status: res.data.status, proposal: res.data.proposal }
        : { status: res.error, proposal: null };
      if (output.proposal && output.proposal.generatedBy.providerId !== providerId) {
        return { outputText: JSON.stringify({ status: 'PROVIDER_MISMATCH', proposal: null } satisfies BackendReasoningOutput) };
      }
      return { outputText: JSON.stringify(output) };
    },
  };
}
