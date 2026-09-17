import { runGovLowerHarmDiscovery, replayGovLowerHarmDiscovery, type RunGovLowerHarmDiscoveryOptions, type GovLowerHarmDiscoveryResult } from './govLowerHarmDiscovery';
import { runGovE2E01Discovery, replayGovE2E01Discovery, type GovE2E01DiscoveryResult } from './govE2E01Discovery';
import { runResearch, replayResearch, type RunResearchOptions, type RunResearchResult, type ReplayResearchResult } from '../mind/runResearch';

/**
 * GENESIS DOMAIN REGISTRY (docs/DECISIONS.md D-059, C2 gap 1b — "add an
 * adapter factory so a second REAL domain runs end-to-end through the SAME
 * orchestrator"; MIND entry added per the "TABELA-G / PATCH-E" audit —
 * see DECISIONS.md — after the original forced-fit proposal was rejected).
 * This is a single, real, keyed dispatch point over the domain entry
 * points that already exist (`govLowerHarmDiscovery.ts` D-058,
 * `govE2E01Discovery.ts` D-059, `mind/runResearch.ts` D-060) — no logic of
 * its own, no fourth ranking/adjudication/recipe engine.
 *
 * WHY THIS IS A DISCRIMINATED UNION, NOT ONE SHARED SIGNATURE. LOWER_HARM
 * and E2E01 share an identical structural options/result shape (proven by
 * TypeScript's own structural typing accepting both `run`/`replay`
 * assignments below without a cast) — that pair honestly is one generic
 * registry entry. MIND is NOT structurally compatible: `RunResearchOptions`
 * requires `problem`/`maxRounds`/`now`/`makeRoundOptions`/`shouldContinue`,
 * none optional, none overlapping with LOWER_HARM/E2E01's all-optional
 * `mode?/nl?/problemInput?/evidenceStore?/evidenceConnectorPort?`. An
 * earlier draft tried to force MIND through the shared optional-opts shape
 * with a "thin wrapper" that silently dropped MIND's required fields and
 * invented option names that exist on neither side — rejected at audit,
 * not landed. This module accepts that MIND is a genuinely different
 * shape and types it as one, rather than pretending otherwise.
 *
 * WHY `runResearch`, NOT `runMindDiscovery`. `core/mind/mindDiscovery.ts`
 * exposes both a single-round `runMindDiscovery` and the multi-round
 * `runResearch` loop over it. `runResearch` is the one `MindPanel.tsx`
 * already calls in production — registering the single-round function here
 * instead would be a second, parallel MIND entry point bypassing the one
 * already wired and tested.
 *
 * UNKNOWN DOMAIN ID FAILS CLOSED. `getGenesisDomain`/
 * `runGenesisDomainDiscovery` never guess which real pipeline to run for
 * an unrecognised id — they throw `UnknownGenesisDomainError` rather than
 * silently defaulting to one domain. Calling the generic string-keyed
 * `runGenesisDomainDiscovery('MIND', opts)` without a complete
 * `RunResearchOptions` payload is the same kind of refusal: this module
 * does not fabricate `problem`/`ports`/`gen` on anyone's behalf, so it
 * throws `MindOptionsRequiredError` instead of calling `runResearch` with
 * an incomplete/undefined argument. Building the real caller that
 * constructs a `RunResearchOptions` for a generic domain selector is
 * separate, deliberately out-of-scope UI work, not done by this module.
 */

export type GenesisDomainId = 'LOWER_HARM' | 'E2E01' | 'MIND';

/** LOWER_HARM/E2E01's shared, all-optional shape. Unchanged from before MIND existed. */
export type GenesisDomainRunOptions = RunGovLowerHarmDiscoveryOptions;
export type GenesisDomainResult = GovLowerHarmDiscoveryResult | GovE2E01DiscoveryResult;
export interface GenesisDomainReplayResult {
  readonly ok: boolean;
  readonly first: GenesisDomainResult;
  readonly second: GenesisDomainResult;
}

/** Either domain's real options, for the generic string-keyed dispatchers only. */
export type AnyGenesisDomainRunOptions = GenesisDomainRunOptions | RunResearchOptions;

interface GenesisSharedDomainDescriptor {
  readonly domainId: 'LOWER_HARM' | 'E2E01';
  readonly label: string;
  run(opts?: GenesisDomainRunOptions): Promise<GenesisDomainResult>;
  replay(opts?: GenesisDomainRunOptions): Promise<GenesisDomainReplayResult>;
}

interface GenesisMindDomainDescriptor {
  readonly domainId: 'MIND';
  readonly label: string;
  /** Honestly required, unlike the shared descriptor's optional `opts` — `RunResearchOptions` has no optional variant. */
  run(opts: RunResearchOptions): Promise<RunResearchResult>;
  replay(opts: RunResearchOptions): Promise<ReplayResearchResult>;
}

export type GenesisDomainDescriptor = GenesisSharedDomainDescriptor | GenesisMindDomainDescriptor;

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
  {
    domainId: 'MIND',
    label: 'MIND — model-space hypothesis research loop (D-060, via runResearch)',
    run: runResearch,
    replay: replayResearch,
  },
];

export class UnknownGenesisDomainError extends Error {
  constructor(public readonly requestedDomainId: string) {
    super(`FAIL_CLOSED[UNKNOWN_DOMAIN]: no registered Genesis domain "${requestedDomainId}" — refusing to guess which real pipeline to run`);
    this.name = 'UnknownGenesisDomainError';
  }
}

/** MIND's real contract has no optional variant — a generic caller that omits it gets a named refusal, never a guessed/fabricated run. */
export class MindOptionsRequiredError extends Error {
  constructor() {
    super(
      'FAIL_CLOSED[MIND_OPTIONS_REQUIRED]: domainId "MIND" requires a full RunResearchOptions payload ' +
        '(problem/maxRounds/now/makeRoundOptions/shouldContinue) — refusing to fabricate one',
    );
    this.name = 'MindOptionsRequiredError';
  }
}

export function getGenesisDomain(domainId: string): GenesisDomainDescriptor {
  const found = GENESIS_DOMAINS.find((d) => d.domainId === domainId);
  if (found === undefined) throw new UnknownGenesisDomainError(domainId);
  return found;
}

/** Structural presence check only (required-field names unique to `RunResearchOptions`) — real validation stays inside `runResearch`/`runMindDiscovery`, this never re-implements it. */
function isRunResearchOptions(opts: AnyGenesisDomainRunOptions): opts is RunResearchOptions {
  return (
    typeof opts === 'object' &&
    opts !== null &&
    'maxRounds' in opts &&
    'makeRoundOptions' in opts &&
    'shouldContinue' in opts
  );
}

/**
 * Overloaded, not a single union-returning signature: existing LOWER_HARM/E2E01 callers
 * (`GenesisConsole.tsx`, `govE2E01Discovery.test.ts`) never expect `RunResearchResult` in their
 * result type, and MIND's own genuinely different result shape must not leak into them. A caller
 * whose `domainId` argument is not statically the literal `'MIND'` keeps the pre-existing,
 * narrower `GenesisDomainResult` return type; only a call written as `('MIND', researchOpts)`
 * sees `RunResearchResult`.
 */
export async function runGenesisDomainDiscovery(domainId: 'MIND', opts: RunResearchOptions): Promise<RunResearchResult>;
export async function runGenesisDomainDiscovery(domainId: Exclude<GenesisDomainId, 'MIND'> | string, opts?: GenesisDomainRunOptions): Promise<GenesisDomainResult>;
export async function runGenesisDomainDiscovery(domainId: string, opts?: AnyGenesisDomainRunOptions): Promise<GenesisDomainResult | RunResearchResult> {
  const descriptor = getGenesisDomain(domainId);
  if (descriptor.domainId === 'MIND') {
    if (opts === undefined || !isRunResearchOptions(opts)) throw new MindOptionsRequiredError();
    return descriptor.run(opts);
  }
  return descriptor.run(opts as GenesisDomainRunOptions | undefined);
}

export async function replayGenesisDomainDiscovery(domainId: 'MIND', opts: RunResearchOptions): Promise<ReplayResearchResult>;
export async function replayGenesisDomainDiscovery(domainId: Exclude<GenesisDomainId, 'MIND'> | string, opts?: GenesisDomainRunOptions): Promise<GenesisDomainReplayResult>;
export async function replayGenesisDomainDiscovery(domainId: string, opts?: AnyGenesisDomainRunOptions): Promise<GenesisDomainReplayResult | ReplayResearchResult> {
  const descriptor = getGenesisDomain(domainId);
  if (descriptor.domainId === 'MIND') {
    if (opts === undefined || !isRunResearchOptions(opts)) throw new MindOptionsRequiredError();
    return descriptor.replay(opts);
  }
  return descriptor.replay(opts as GenesisDomainRunOptions | undefined);
}
