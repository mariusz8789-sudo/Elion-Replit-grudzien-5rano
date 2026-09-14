import { runGovLowerHarmDiscovery, replayGovLowerHarmDiscovery, type RunGovLowerHarmDiscoveryOptions, type GovLowerHarmDiscoveryResult } from './govLowerHarmDiscovery';
import { runGovE2E01Discovery, replayGovE2E01Discovery, type GovE2E01DiscoveryResult } from './govE2E01Discovery';

/**
 * GENESIS DOMAIN REGISTRY (docs/DECISIONS.md D-059, C2 gap 1b — "add an
 * adapter factory so a second REAL domain runs end-to-end through the SAME
 * orchestrator"). This IS that factory: a single, real, keyed dispatch
 * point over the two domain entry points that already exist
 * (`govLowerHarmDiscovery.ts` D-058, `govE2E01Discovery.ts` D-059) — no
 * logic of its own, no third ranking/adjudication/recipe engine. Both
 * entry points share an identical structural options/result shape (proven
 * by TypeScript's own structural typing accepting both `run`/`replay`
 * assignments below without a cast), which is what makes one generic
 * registry entry honest rather than a forced fit.
 *
 * UNKNOWN DOMAIN ID FAILS CLOSED. `getGenesisDomain`/
 * `runGenesisDomainDiscovery` never guess which real pipeline to run for
 * an unrecognised id — they throw `UnknownGenesisDomainError` rather than
 * silently defaulting to one domain (the UI source selector, D-059 gap
 * 1c, surfaces this the same way it surfaces any other EXECUTION_BLOCKED
 * outcome).
 */

export type GenesisDomainId = 'LOWER_HARM' | 'E2E01';

export type GenesisDomainRunOptions = RunGovLowerHarmDiscoveryOptions;
export type GenesisDomainResult = GovLowerHarmDiscoveryResult | GovE2E01DiscoveryResult;
export interface GenesisDomainReplayResult {
  readonly ok: boolean;
  readonly first: GenesisDomainResult;
  readonly second: GenesisDomainResult;
}

export interface GenesisDomainDescriptor {
  readonly domainId: GenesisDomainId;
  readonly label: string;
  run(opts?: GenesisDomainRunOptions): Promise<GenesisDomainResult>;
  replay(opts?: GenesisDomainRunOptions): Promise<GenesisDomainReplayResult>;
}

export const GENESIS_DOMAINS: readonly GenesisDomainDescriptor[] = [
  {
    domainId: 'LOWER_HARM',
    label: 'LOWER-HARM — GLP-1R/GIPR/GCGR substitute (ChEMBL + ClinicalTrials.gov, D-058)',
    run: runGovLowerHarmDiscovery,
    replay: replayGovLowerHarmDiscovery,
  },
  {
    domainId: 'E2E01',
    label: 'E2E-01 — generated incretin-axis candidate space (ChEMBL, D-032/D-059)',
    run: runGovE2E01Discovery,
    replay: replayGovE2E01Discovery,
  },
];

export class UnknownGenesisDomainError extends Error {
  constructor(public readonly requestedDomainId: string) {
    super(`FAIL_CLOSED[UNKNOWN_DOMAIN]: no registered Genesis domain "${requestedDomainId}" — refusing to guess which real pipeline to run`);
    this.name = 'UnknownGenesisDomainError';
  }
}

export function getGenesisDomain(domainId: string): GenesisDomainDescriptor {
  const found = GENESIS_DOMAINS.find((d) => d.domainId === domainId);
  if (found === undefined) throw new UnknownGenesisDomainError(domainId);
  return found;
}

export async function runGenesisDomainDiscovery(domainId: string, opts?: GenesisDomainRunOptions): Promise<GenesisDomainResult> {
  return getGenesisDomain(domainId).run(opts);
}

export async function replayGenesisDomainDiscovery(domainId: string, opts?: GenesisDomainRunOptions): Promise<GenesisDomainReplayResult> {
  return getGenesisDomain(domainId).replay(opts);
}
