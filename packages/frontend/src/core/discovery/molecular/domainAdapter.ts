import { runScientificDiscoveryFlow, type ScientificDiscoveryFlowInput, type ScientificDiscoveryFlowResult } from './scientificDiscoveryFlow';
import type { NaturalAnalogueCampaignEngines } from './naturalAnalogueCampaign';
import { runRelativisticTimeDilationCase, type RelativisticTimeDilationResult } from '../physics/relativisticTimeDilation';

/**
 * CROSS-DOMAIN DISCOVERY CORE — foundation.
 *
 * ONE discovery loop (question → structured request → evidence → hypothesis
 * competition → falsification → evidence artifact → memory → replay → next
 * experiment), with each scientific domain supplying its OWN executor rather
 * than Genesis growing a domain-specific engine per field.
 *
 * THIS IS DELIBERATELY THIN. The chemistry/biology adapter below is REAL — it
 * wraps `runScientificDiscoveryFlow`, which is itself real RDKit + real
 * ADMET-AI. Every other domain is declared with NO executor, honestly, rather
 * than a placeholder implementation that would look real and isn't. Adding a
 * domain means writing one adapter against this interface; it does not mean
 * rewriting the core.
 */
export const DOMAIN_ADAPTER_VERSION = '1.0.0';

export type DomainId = 'CHEMISTRY_BIOLOGY' | 'PHYSICS' | 'ENVIRONMENT_WATER' | 'EPIDEMIOLOGY' | 'ENGINEERING';

export interface DomainAvailability {
  ok: boolean;
  reason: string;
}

/**
 * One domain's plug into the shared core. `execute` is generic in its result
 * type because a physics case and a chemistry case genuinely produce
 * different artifacts — the core does not force them into one shape, it only
 * guarantees every domain answers the same three questions: is it available,
 * what did it produce, and (via the result's own replay/evidence fields,
 * which each domain's TResult must carry) can it be replayed.
 */
export interface DomainAdapter<TInput, TResult> {
  domainId: DomainId;
  description: string;
  available(): DomainAvailability;
  execute(input: TInput): TResult;
}

/**
 * The chemistry/biology adapter — the ONE real executor in this foundation.
 * `available()` reflects the REAL engine detection already used by the
 * discovery flow (RDKit + ADMET-AI), not a declared capability.
 */
export function buildChemistryBiologyAdapter(
  engines: NaturalAnalogueCampaignEngines,
): DomainAdapter<ScientificDiscoveryFlowInput, ScientificDiscoveryFlowResult> {
  return {
    domainId: 'CHEMISTRY_BIOLOGY',
    description: 'Molecular discovery over real RDKit structural validation and real ADMET-AI property prediction, with source-backed target/mechanism evidence.',
    available: () => {
      const rdkit = engines.rdkit.detect();
      const admet = engines.admet.detect();
      if (!rdkit.available) return { ok: false, reason: `RDKit unavailable: ${rdkit.reason}` };
      if (!admet.available) return { ok: false, reason: `ADMET-AI unavailable: ${admet.reason}` };
      return { ok: true, reason: '' };
    },
    execute: (input) => runScientificDiscoveryFlow(input, engines),
  };
}

/**
 * The physics adapter — the SECOND real executor, proving the core
 * generalises beyond chemistry. It is pure computation (real SR/GR weak-field
 * formulas over declared, cited constants), so it needs no external engine
 * and is ALWAYS available, unlike the chemistry adapter's real RDKit/ADMET
 * dependency — that difference is itself worth stating honestly rather than
 * hiding behind a uniform "available" check.
 */
export function buildPhysicsAdapter(): DomainAdapter<Record<string, never>, RelativisticTimeDilationResult> {
  return {
    domainId: 'PHYSICS',
    description: 'Relativistic time dilation (SR vs GR) for a circular Earth orbit, derived from established physics and declared constants — no external engine, no measured dataset.',
    available: () => ({ ok: true, reason: '' }),
    execute: () => runRelativisticTimeDilationCase(),
  };
}

/**
 * An honestly unavailable domain: the contract exists, no executor does. This
 * is the correct state for every domain this session did not implement — it
 * is NOT a placeholder pretending to be a working adapter.
 */
export function buildUnavailableDomainAdapter(domainId: DomainId, reason: string): DomainAdapter<unknown, never> {
  return {
    domainId,
    description: `No executor is connected for ${domainId} in this runtime.`,
    available: () => ({ ok: false, reason }),
    execute: () => {
      throw new Error(`Domain "${domainId}" has no executor connected. Reason: ${reason}. Calling execute() on an unavailable domain is a caller error, not a runtime gap to paper over.`);
    },
  };
}

export interface DomainRegistry {
  adapters: ReadonlyMap<DomainId, DomainAdapter<unknown, unknown>>;
}

export function buildDomainRegistry(engines: NaturalAnalogueCampaignEngines): DomainRegistry {
  const adapters = new Map<DomainId, DomainAdapter<unknown, unknown>>();
  adapters.set('CHEMISTRY_BIOLOGY', buildChemistryBiologyAdapter(engines) as DomainAdapter<unknown, unknown>);
  adapters.set('PHYSICS', buildPhysicsAdapter() as DomainAdapter<unknown, unknown>);
  adapters.set('ENVIRONMENT_WATER', buildUnavailableDomainAdapter('ENVIRONMENT_WATER', 'No environmental/water-quality executor exists yet.'));
  adapters.set('EPIDEMIOLOGY', buildUnavailableDomainAdapter('EPIDEMIOLOGY', 'A real epidemic simulation model and its own hypothesis loop exist (experimentFabric/hypothesisLoop.ts) but are not yet wired to this shared contract.'));
  adapters.set('ENGINEERING', buildUnavailableDomainAdapter('ENGINEERING', 'No engineering executor exists yet.'));
  return { adapters };
}

export function describeDomainRegistry(registry: DomainRegistry): string {
  const rows = [...registry.adapters.values()].map((a) => {
    const availability = a.available();
    return `${a.domainId}: ${availability.ok ? 'AVAILABLE' : `UNAVAILABLE (${availability.reason})`}`;
  });
  return rows.join(' | ');
}
