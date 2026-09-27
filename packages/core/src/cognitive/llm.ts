import { CognitiveProposal, LanguageModelAdapter } from './types.js';

/**
 * Provider-neutral adapter.
 * The model is treated as an untrusted proposer: it may suggest goals/hypotheses,
 * but it never mutates the world, executes instruments, or writes evidence directly.
 */
export class NullLanguageModel implements LanguageModelAdapter {
  async propose(): Promise<CognitiveProposal[]> {
    return [];
  }
}
