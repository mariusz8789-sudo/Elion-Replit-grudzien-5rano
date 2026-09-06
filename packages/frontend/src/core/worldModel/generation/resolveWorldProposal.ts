import { requestLLMWorldProposal, type RequestLLMWorldProposalOptions } from './llmWorldProposalAdapter';
import { proposeWorldDeterministically, type DeterministicProposalRequest, type WorldModelProposal } from './worldModelProposal';

/**
 * LLM -> DETERMINISTIC FALLBACK (Genesis Scientific World Model 4.0,
 * Priority 1.2, closing the mission's own reported gap: "both paths
 * exist but nothing composes them automatically").
 *
 * `resolveWorldProposal` is the ONE reusable entry point that tries the
 * real LLM adapter (`llmWorldProposalAdapter.ts`) first, and — on ANY of
 * its already-tested failure modes (offline, timeout, malformed,
 * rate-limited, no-key) — falls back to the deterministic script path
 * (`proposeWorldDeterministically`). It never invents a third proposal
 * mechanism; it only composes the two that already exist.
 *
 * `fallback` (a `DeterministicProposalRequest`) is REQUIRED, not derived
 * from `prompt`: `proposeWorldDeterministically` is deliberately NOT
 * natural-language understanding (see its own doc), so this wrapper
 * cannot honestly turn free text into deterministic request flags either
 * — the caller (whoever originally turned a human ask into a structured
 * fallback request, e.g. a simple keyword-based UI, or the same flags the
 * user would otherwise have to pick manually) supplies it up front.
 *
 * `resolvedVia` NEVER lies: a caller can always tell whether the returned
 * proposal came from the real LLM or the deterministic fallback, and
 * `llmFailure` carries the honest reason when the fallback ran — this is
 * the mission's own explicit requirement ("never silently pretend the
 * LLM path succeeded when it didn't").
 */
export interface ResolveWorldProposalOptions extends RequestLLMWorldProposalOptions {
  fallback: DeterministicProposalRequest;
}

export interface ResolveWorldProposalResult {
  proposal: WorldModelProposal;
  resolvedVia: 'LLM' | 'SCRIPT';
  /** Present only when the LLM path was attempted and failed. */
  llmFailure?: { reason: 'offline' | 'no-key' | 'rate-limited' | 'malformed' | 'error'; message: string };
}

export async function resolveWorldProposal(prompt: string, options: ResolveWorldProposalOptions): Promise<ResolveWorldProposalResult> {
  const llmResult = await requestLLMWorldProposal(prompt, options);
  if (llmResult.ok) {
    return { proposal: llmResult.proposal, resolvedVia: 'LLM' };
  }
  const proposal = proposeWorldDeterministically(options.fallback);
  return {
    proposal,
    resolvedVia: 'SCRIPT',
    llmFailure: { reason: llmResult.reason, message: llmResult.message },
  };
}
