import { canonicalJson } from '../events/hash';
import { runDiscoveryChallenge, replayDiscoveryChallenge, type RunChallengeOptions } from '../discoveryChallenge/runDiscoveryChallenge';
import { createD062Ports } from './d062Ports';
import { buildBetterRule } from '../discoveryChallenge/betterRule';
import { makeBaselineFingerprint } from '../discoveryChallenge/baselineRegistry';
import { LOWER_HARM_PREREGISTRATION } from '../biotechData/govDrugLowerHarmPreregistration';
import { A2_PREREGISTRATION } from '../biotechData/a2OzempicSubstitutePreregistration';
import { MINIMUM_OBSERVATIONS } from '../agent/practicalCandidateGate';
import { runA2Analysis } from '../biotechData/a2OzempicSubstitute';
import { sharedEvidenceConnectorStore } from '../evidenceConnectors/sharedStore';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import type { EvidenceConnectorStore } from '../evidenceConnectors/store';
import type { BaselineRecord, ChallengeBlocked, ChallengeResult } from '../discoveryChallenge/contracts';

/**
 * D-062 THE CANONICAL PUBLIC ENTRY POINT (docs/DECISIONS.md D-062).
 *
 * Mirrors `govLowerHarmDiscovery.ts`/`govE2E01Discovery.ts`/`mindDiscovery.ts`
 * exactly: one function a script or test calls, with the frozen SURPASS-2
 * baseline, the frozen better-than-baseline rule (every numeric term
 * inherited from `LOWER_HARM_PREREGISTRATION`/`A2_PREREGISTRATION`, never
 * re-tuned here — brief §5.1), and the real `d062Ports` wired in.
 */

const SURPASS2_NARROW_SHA256 = '385c58a1b7a19bedac0bb303846a8cffb23242d912edd7fc91fa93d5b278a8b0';

export const D062_BASELINE: BaselineRecord = (() => {
  const base = {
    baselineId: 'SURPASS2-SEMAGLUTIDE-1MG',
    label: '1 mg Semaglutide (SURPASS-2, NCT03987919)',
    source: 'ClinicalTrials.gov API v2',
    provenanceRefs: [`ctgov:NCT03987919:sha256:${SURPASS2_NARROW_SHA256}`],
    evidenceClass: 'DIRECT_RANDOMISED' as const,
    // The zero point every dose stratum's own efficacy/harm scores are
    // already expressed relative to (both are "vs semaglutide" scores from
    // scoreCandidate — see biotechData/d062SurpassDoseStrata.ts). The
    // baseline compared to itself is, by construction, delta=0/riskRatio=1.
    knownOutcomeMetrics: { efficacy: 0, harm: 0 },
    applicabilityConditions: ['Adults with type 2 diabetes, inadequately controlled on metformin (40 weeks)'],
  };
  return { ...base, fingerprint: makeBaselineFingerprint(base) };
})();

export const D062_BETTER_RULE = buildBetterRule(D062_BASELINE, MINIMUM_OBSERVATIONS, 1, [], [LOWER_HARM_PREREGISTRATION.fingerprint, A2_PREREGISTRATION.fingerprint]);

/** RAW data only (summary/efficacy/safety across the fixed candidate space) — same custody discipline as D-059's `LOWER_HARM_EVIDENCE_SOURCE`: a drift signal means "the underlying data changed", never "a scoring formula changed". */
export const D062_EVIDENCE_SOURCE: SourceConfig = {
  sourceId: 'D062_A2_SURPASS2_DOSE_STRATIFIED_DATASET',
  name: 'A2 Ozempic-substitute pinned ChEMBL + ClinicalTrials.gov dataset (SURPASS-2 dose-stratified view, D-062)',
  url: 'internal://a2-ozempic-substitute/reference-semaglutide-NCT03987919.json',
  hashPolicy: 'sha256',
  category: 'CLINICAL_TRIALS',
};

export const d062EvidencePort: ConnectorPort = {
  async fetchBytes(): Promise<Uint8Array> {
    const raw = runA2Analysis().candidateReports.map((r) => ({ summary: r.summary, efficacy: r.efficacy, safety: r.safety }));
    return new TextEncoder().encode(canonicalJson(raw));
  },
};

export interface RunD062DiscoveryOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly nl?: string;
  readonly maxRounds?: number;
  readonly evidenceStore?: EvidenceConnectorStore;
  readonly evidenceConnectorPort?: ConnectorPort;
  readonly now?: () => string;
}

const DEFAULT_NL =
  'Among dose strata of the incretin agonists in the GLP-1R/GIPR mechanistic space (including the fixed A2 candidate list), find one that retains clinically meaningful efficacy at strictly lower harm than the frozen SURPASS-2 semaglutide baseline.';

function buildOptions(opts: RunD062DiscoveryOptions): RunChallengeOptions {
  const mode = opts.mode ?? 'PRODUCTION';
  const { ports } = createD062Ports();
  return {
    mode,
    nl: opts.nl ?? DEFAULT_NL,
    objectives: [
      { metric: 'efficacy', direction: 'maximize' },
      { metric: 'harm', direction: 'minimize' },
    ],
    evidenceMinimum: `>=${MINIMUM_OBSERVATIONS} real observations, >=1 DIRECT_RANDOMISED or INDIRECT_RANDOMISED`,
    harmAxes: ['nausea', 'vomiting', 'diarrhea', 'pancreatitis', 'gallbladder', 'hypoglycemia', 'renal', 'serious_adverse_events'],
    baseline: D062_BASELINE,
    betterRule: D062_BETTER_RULE,
    ports,
    evidence: mode === 'PRODUCTION' ? { store: opts.evidenceStore ?? sharedEvidenceConnectorStore, source: D062_EVIDENCE_SOURCE, port: opts.evidenceConnectorPort ?? d062EvidencePort } : undefined,
    maxRounds: opts.maxRounds ?? 3,
    now: opts.now ?? (() => '1970-01-01T00:00:00Z'),
  };
}

export async function runD062Discovery(opts: RunD062DiscoveryOptions = {}): Promise<ChallengeResult | ChallengeBlocked> {
  return runDiscoveryChallenge(buildOptions(opts));
}

export async function replayD062Discovery(opts: RunD062DiscoveryOptions = {}): Promise<{ readonly ok: boolean; readonly first: ChallengeResult | ChallengeBlocked; readonly second: ChallengeResult | ChallengeBlocked }> {
  const options = buildOptions(opts);
  return replayDiscoveryChallenge(options);
}

export const D062_SCENARIO_ID = 'GOV-DRUG-D062-DOSE-STRATIFIED-LOWER-HARM';
