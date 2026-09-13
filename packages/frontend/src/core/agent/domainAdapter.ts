import { runDiscoveryCampaign, type CampaignLaboratory, type CampaignOptions, type CampaignResult } from './discoveryCampaign';
import type { ModelPoint } from './modelSpace';

/**
 * E4 — CROSS-DOMAIN EXECUTION, SHARED ADAPTER CONTRACT.
 *
 * Audit finding (Phase 0, item 14): no shared domain-adapter contract exists
 * in this repo. `externalAnchor.ts`/`externalDatasetCase.ts`/
 * `qe4RegimeInquiryLoop.ts`/`datasetLaboratory.ts` are each bespoke, and
 * `worldModel/domains/*.ts` is a wholly different, unrelated simulation
 * system. `DomainAdapter` below is therefore genuinely NEW — but it is a
 * THIN WRAPPER, not a second engine: every adapter's `laboratory` field is
 * an ordinary `CampaignLaboratory` (`discoveryCampaign.ts`, unmodified), and
 * `runExperimentViaAdapter` is a one-line call to the existing
 * `runDiscoveryCampaign`. This module adds exactly what a caller needs to
 * treat several domains uniformly (capabilities, declared available data,
 * provenance, replay comparison, limitations) without touching the engine
 * or the domain-specific laboratory builders it wraps
 * (`biotechData/campaignLabs.ts::makeQe4CampaignLab`/`makeKeplerCampaignLab`,
 * unmodified).
 *
 * PRODUCTION CONTRACT: any >= 2 available adapters. The QE4 + Kepler pair in
 * `domainAdapterRegistry.ts` is a DEMONSTRATOR choice, not a hardcoded
 * requirement of this contract — nothing here names either domain.
 */

export const DOMAIN_ADAPTER_CONTRACT_VERSION = '1.0.0';

export interface DomainAdapterCapabilities {
  readonly domainId: string;
  readonly description: string;
  readonly xLabel: string;
  readonly yLabel: string;
}

export interface DomainAdapterProvenance {
  readonly sourceUrl: string;
  readonly sourceVersion: string;
  readonly license: string | null;
  readonly retrievedAt: string | null;
}

export interface DomainAdapter {
  readonly capabilities: DomainAdapterCapabilities;
  /** Every x this adapter can be observed at, declared up front — copied from the wrapped laboratory's own candidateX, never inferred. */
  readonly availableData: () => readonly number[];
  /** REUSED verbatim — the existing CampaignLaboratory this adapter wraps. */
  readonly laboratory: CampaignLaboratory;
  readonly provenance: DomainAdapterProvenance;
  /** What this adapter is honestly known NOT to cover — never left implicit. */
  readonly limitations: readonly string[];
}

/** `runExperiment` — calls the existing engine unchanged. No second campaign engine. */
export function runExperimentViaAdapter(adapter: DomainAdapter, options?: CampaignOptions): CampaignResult {
  return runDiscoveryCampaign(adapter.laboratory, options);
}

/** `observe` — reads the wrapped laboratory's own observation function directly. */
export function observeViaAdapter(adapter: DomainAdapter, x: number): ModelPoint | null {
  return adapter.laboratory.observe(x);
}

export type DomainAdapterReplayStatus = 'MATCH' | 'DRIFT';

/** `replay` — same MATCH/DRIFT convention as every other fingerprinted record in this codebase. */
export function compareDomainAdapterReplay(first: Pick<CampaignResult, 'campaignFingerprint'>, second: Pick<CampaignResult, 'campaignFingerprint'>): DomainAdapterReplayStatus {
  return first.campaignFingerprint === second.campaignFingerprint ? 'MATCH' : 'DRIFT';
}

export interface DomainAdapterRegistry {
  readonly adapters: readonly DomainAdapter[];
}

/** The production requirement, checkable: at least 2 available adapters. */
export function meetsProductionContract(registry: DomainAdapterRegistry): boolean {
  return registry.adapters.length >= 2;
}
