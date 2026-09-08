import { CAPABILITY_CODE, type CapabilityCode, type SolverCapability } from '../worldModel/capability/solverCapability';

/**
 * WHAT AN AGENT CAN ACTUALLY DO, AND HOW WELL EACH THING IS MODELLED.
 *
 * A dispatcher that can pick the next action (`nextAction.ts`) still needs to
 * know what it is allowed to invoke, and — more importantly — how much the
 * result of invoking it is worth. This manifest answers both, and it does so
 * by WRAPPING functions that already exist: nothing here computes anything.
 *
 * ## Capability vocabulary is reused, not re-coined
 *
 * `solverCapability.ts` already established the only honesty scale this
 * codebase uses for "how well is this modelled":
 * MODELLED / PARTIALLY_MODELLED / NOT_MODELLED, with a `caveat` required
 * whenever the answer is partial and named `missing` items whenever nothing
 * models it. Every tool here carries a `SolverCapability` in exactly that
 * vocabulary, so an agent reasoning over tools and an agent reasoning over
 * scenarios are reading the same scale.
 *
 * A tool whose capability is PARTIALLY_MODELLED is still worth invoking. What
 * it is not worth is reporting its output without the caveat, and carrying the
 * capability on the tool itself is what makes dropping it a deliberate act
 * rather than an oversight.
 *
 * ## What this deliberately is not
 *
 * Not a plugin system, not a registry that discovers tools at runtime, and not
 * a place where new capability is created. Registering a tool that no real
 * function backs would be the exact failure this whole layer exists to
 * prevent, so `invoke` is required and must be the real function.
 */

export const AGENT_TOOL_CONTRACT_VERSION = '1.0.0';

/**
 * Coarse tags a dispatcher can match against without knowing any tool's
 * internals. Kept small on purpose: a taxonomy nobody maintains is worse than
 * none, and these are the distinctions the existing selectors actually make.
 */
export type CapabilityTag =
  /** Advances or constructs a simulated world. */
  | 'simulate'
  /** Compares arms, branches or runs. */
  | 'compare'
  /** Ranks declared options under a declared objective. */
  | 'decide'
  /** Produces or extends a provenance record. */
  | 'evidence'
  /** Generates candidate artefacts to evaluate. */
  | 'generate'
  /** Explains something already computed, without computing more. */
  | 'explain';

export interface AgentToolParameter {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly required: boolean;
  readonly description: string;
}

/**
 * A named, invocable capability.
 *
 * `TInput`/`TOutput` stay generic so a tool keeps its real signature; the
 * manifest is a description of real functions, not a lowest common
 * denominator they must be squeezed into.
 */
export interface AgentTool<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly domain: string;
  readonly description: string;
  readonly capabilityTags: readonly CapabilityTag[];
  /** How well the underlying science is modelled, in `solverCapability.ts`'s vocabulary. */
  readonly capability: SolverCapability;
  readonly inputSchema: readonly AgentToolParameter[];
  /** The real function. A tool with no real implementation must not be registered. */
  readonly invoke: (input: TInput) => TOutput;
}

/**
 * True when a tool's output may be reported without a qualifier.
 *
 * Only a fully MODELLED tool qualifies. This is a function rather than a
 * boolean field so it cannot drift out of step with the capability it is
 * derived from.
 */
export function toolOutputNeedsQualifier(tool: ErasedAgentTool): boolean {
  return tool.capability.capability !== CAPABILITY_CODE.MODELLED;
}

/**
 * The qualifier a tool's output must carry, or null when it needs none.
 * Reads the caveat or the missing list the capability already declares —
 * it never writes a new one, because inventing a caveat here would put words
 * in the capability registry's mouth.
 */
export function toolOutputQualifier(tool: ErasedAgentTool): string | null {
  const { capability } = tool;
  if (capability.capability === CAPABILITY_CODE.MODELLED) return null;
  if (capability.capability === CAPABILITY_CODE.PARTIALLY_MODELLED) {
    return capability.caveat ?? 'Partially modelled; the capability registry declares no caveat text for this tool.';
  }
  return `Not modelled. Missing: ${(capability.missing ?? []).join('; ') || 'unspecified'}.`;
}

/**
 * A tool with its input type erased, for listing and inspection.
 *
 * `invoke` is contravariant in its input, so a registry cannot hold tools with
 * different concrete input types AND stay callable through the erased handle.
 * The split is deliberate rather than papered over with `any`: the registry
 * answers "what exists and how good is it", and INVOCATION goes through the
 * concrete, exported tool, where the compiler still checks the input. Erasing
 * the type here loses nothing a caller needed, because a caller that can build
 * a valid input already knows which tool it is building it for.
 */
export type ErasedAgentTool = AgentTool<never, unknown>;

/** A registry over a fixed, declared tool list. No runtime discovery. */
export class AgentToolRegistry {
  private readonly tools = new Map<string, ErasedAgentTool>();

  constructor(tools: readonly ErasedAgentTool[] = []) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: ErasedAgentTool): void {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate agent tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  get(name: string): ErasedAgentTool | undefined {
    return this.tools.get(name);
  }

  /** Sorted by name so a listing is deterministic. */
  list(): readonly ErasedAgentTool[] {
    return [...this.tools.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  byDomain(domain: string): readonly ErasedAgentTool[] {
    return this.list().filter((tool) => tool.domain === domain);
  }

  byTag(tag: CapabilityTag): readonly ErasedAgentTool[] {
    return this.list().filter((tool) => tool.capabilityTags.includes(tag));
  }

  /**
   * Tools whose output may be reported unqualified. Offered so a caller can
   * ask the question explicitly rather than reading `capability` and deciding
   * for itself, which is where the qualifier tends to get lost.
   */
  fullyModelled(): readonly ErasedAgentTool[] {
    return this.list().filter((tool) => !toolOutputNeedsQualifier(tool));
  }
}

/** Helper so every declared tool states a capability rather than defaulting to one. */
export function declareTool<TInput, TOutput>(tool: AgentTool<TInput, TOutput>): AgentTool<TInput, TOutput> {
  if (tool.capability.capability === CAPABILITY_CODE.PARTIALLY_MODELLED && !tool.capability.caveat) {
    throw new Error(`Tool ${tool.name} is PARTIALLY_MODELLED but declares no caveat.`);
  }
  if (tool.capability.capability === CAPABILITY_CODE.NOT_MODELLED && !(tool.capability.missing ?? []).length) {
    throw new Error(`Tool ${tool.name} is NOT_MODELLED but names nothing missing.`);
  }
  return tool;
}

export type { CapabilityCode };
