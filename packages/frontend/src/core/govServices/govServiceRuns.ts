import { canonicalJson } from '../events/hash';
import { compareCountedOutcomes, classifyComparisonEvidenceClass, type CountedOutcomeObservation, type SourceStudyIdentity } from '../agent/evidenceProvenance';
import { SURPASS2_STUDY, SURPASS2_POPULATION } from '../biotechData/surpass2DirectEvidence';
import { sharedEvidenceConnectorStore } from '../evidenceConnectors/sharedStore';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import surpass2Raw from '../biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';
import { runClaimAudit, type ClaimAuditBlocked, type ClaimAuditResult, type ParsedClaimEvidence } from './govClaimAudit';
import { runParametricTrigger, type TriggerBlocked, type TriggerResult, type TriggerRule } from './govParametricTrigger';

/**
 * D-063 — THE REAL RUNS of the two government services, on this repository's
 * real pinned evidence.
 *
 * `govClaimAudit.ts` and `govParametricTrigger.ts` are generic engines: they
 * take a claim (or a rule), a set of custody-verified sources, and a
 * caller-supplied parser. This module is their real, concrete caller — it
 * pins ONE real source (the SURPASS-2 record this repository has held since
 * `2026-09-13T13:45:36Z`), supplies real parsers that compute from the
 * fetched bytes, and is what the panel and the E2E script actually run.
 *
 * WHY THE SAME TRIAL FOR BOTH. Not for convenience: it is the only dataset in
 * this repository whose bytes are pinned, hashed, and independently
 * re-derivable, and a service that demonstrates itself on data nobody can
 * re-check demonstrates nothing. Both services therefore read the SAME bytes
 * through the SAME D-057 custody store every other PRODUCTION run here uses.
 *
 * WHAT IS REAL AND WHAT IS A STATED PARAMETER. The counts, the arms, the
 * denominators, the risk ratios and the computed evidence class are real and
 * come out of the pinned file. The trigger's THRESHOLD is not a discovered
 * quantity and is not claimed to be one — it is a contract parameter a
 * sovereign counterparty sets, stated here explicitly as a demonstration
 * value (`D063_TRIGGER_RULE`) so nobody can mistake it for a regulatory
 * number this repository derived.
 */

export const GOV_SERVICE_RUNS_VERSION = '1.0.0';

interface RawStat {
  readonly groupId: string;
  readonly numAffected: number | null;
  readonly numAtRisk: number | null;
}
interface RawEvent {
  readonly term: string;
  readonly stats: readonly RawStat[];
}
interface RawEventGroup {
  readonly id: string;
  readonly title: string;
  readonly seriousNumAffected: number | null;
  readonly seriousNumAtRisk: number | null;
  readonly otherNumAtRisk: number | null;
}
interface RawTrial {
  readonly nctId: string;
  readonly adverseEvents: {
    readonly eventGroups: readonly RawEventGroup[];
    readonly otherEvents: readonly RawEvent[];
    readonly seriousEvents: readonly RawEvent[];
  } | null;
}

/** Both services read the same pinned bytes; the port re-encodes the file this repository holds, never a fetch to an unreachable registry. */
const encodeTrial = (): Uint8Array => new TextEncoder().encode(canonicalJson(surpass2Raw));

export const D063_SURPASS2_SOURCE: SourceConfig = {
  sourceId: 'D063_SURPASS2_GOV_SERVICE_EVIDENCE',
  name: 'SURPASS-2 (NCT03987919) narrowed record, pinned in this repository',
  url: 'internal://a2-ozempic-substitute/reference-semaglutide-NCT03987919.json',
  hashPolicy: 'sha256',
  category: 'CLINICAL_TRIALS',
};

export const d063SurpassEvidencePort: ConnectorPort = {
  async fetchBytes(): Promise<Uint8Array> {
    return encodeTrial();
  },
};

const decodeTrial = (bytes: Uint8Array): RawTrial => JSON.parse(new TextDecoder().decode(bytes)) as RawTrial;

function armObservation(trial: RawTrial, term: string, armTitle: string, study: SourceStudyIdentity): CountedOutcomeObservation {
  const events = trial.adverseEvents;
  if (events === null) throw new Error('D-063: the pinned SURPASS-2 record carries no adverseEvents module — the bytes changed shape.');
  const group = events.eventGroups.find((g) => g.title === armTitle);
  if (group === undefined || group.otherNumAtRisk === null) throw new Error(`D-063: no arm titled "${armTitle}" with a denominator in the pinned record.`);
  const event = [...events.otherEvents, ...events.seriousEvents].find((e) => e.term === term);
  const stat = event?.stats.find((s) => s.groupId === group.id);
  if (stat === undefined || stat.numAffected === null || stat.numAtRisk === null) throw new Error(`D-063: the pinned record states no counts for "${term}" in "${armTitle}" — a missing count is NO DATA, never a zero.`);
  return {
    observationId: `SURPASS2:${group.id}:${term}`,
    study,
    arm: { groupId: group.id, title: group.title, nAtRisk: group.otherNumAtRisk },
    term,
    numAffected: stat.numAffected,
    numAtRisk: stat.numAtRisk,
    codingSystem: null,
    population: SURPASS2_POPULATION,
  };
}

/* ------------------------------------------------------------------ */
/* CLAIM AUDIT                                                         */
/* ------------------------------------------------------------------ */

/**
 * A real, falsifiable tolerability claim of exactly the shape a regulator
 * receives — stated in the direction a sponsor would state it, so the audit
 * has something it can genuinely refuse.
 */
export const D063_CLAIM_TEXT =
  'Tirzepatide 15 mg is better tolerated than semaglutide 1 mg on diarrhoea in adults with type 2 diabetes inadequately controlled on metformin.';

const CLAIM_TERM = 'Diarrhoea';
const CLAIM_EXPOSED_ARM = '15 mg Tirzepatide';
const CLAIM_REFERENCE_ARM = '1 mg Semaglutide';

/**
 * Real extraction, real arithmetic, real computed class. `supports` is
 * DERIVED from the risk ratio the pinned counts produce — `for` only when the
 * candidate arm carries strictly less diarrhoea than the comparator — and the
 * evidence class comes from `classifyComparisonEvidenceClass`, which reads the
 * two observations' own study identities. Neither is declared here, so this
 * parser cannot flatter the claim it is auditing.
 */
export function d063ParseClaims(bytes: Uint8Array): readonly ParsedClaimEvidence[] {
  const trial = decodeTrial(bytes);
  const exposed = armObservation(trial, CLAIM_TERM, CLAIM_EXPOSED_ARM, SURPASS2_STUDY);
  const reference = armObservation(trial, CLAIM_TERM, CLAIM_REFERENCE_ARM, SURPASS2_STUDY);
  const comparison = compareCountedOutcomes(exposed, reference);
  if (comparison === null) return [];
  return [
    {
      ref: `${SURPASS2_STUDY.studyId}:${CLAIM_TERM}:${CLAIM_EXPOSED_ARM}-vs-${CLAIM_REFERENCE_ARM}:RR=${comparison.riskRatio.toFixed(4)}`,
      evidenceClass: classifyComparisonEvidenceClass(exposed, reference),
      supports: comparison.riskRatio < 1 ? 'for' : 'against',
    },
  ];
}

export async function runD063ClaimAudit(opts: { readonly now?: () => string } = {}): Promise<ClaimAuditResult | ClaimAuditBlocked> {
  return runClaimAudit({
    mode: 'PRODUCTION',
    claimText: D063_CLAIM_TEXT,
    sources: [D063_SURPASS2_SOURCE],
    store: sharedEvidenceConnectorStore,
    port: d063SurpassEvidencePort,
    parseClaims: d063ParseClaims,
    now: opts.now ?? (() => '1970-01-01T00:00:00Z'),
  });
}

/* ------------------------------------------------------------------ */
/* PARAMETRIC TRIGGER                                                  */
/* ------------------------------------------------------------------ */

/**
 * A pharmacovigilance parametric condition: "if ANY randomised arm of the
 * pinned trial reports a serious-adverse-event rate at or above the agreed
 * threshold, the contract's safety-review clause is triggered."
 *
 * THE THRESHOLD IS A STATED CONTRACT PARAMETER (0.08 = 8% of participants
 * with at least one serious adverse event), NOT A DERIVED OR REGULATORY
 * NUMBER. A real counterparty supplies its own; this one exists so the run
 * is executable and is labelled as such everywhere it is shown. Everything
 * else — the four rates, the maximum, the verdict — is computed from the
 * pinned counts.
 *
 * `window: 4` and `minObservations: 4` are the trial's four real arms: the
 * rule refuses to evaluate on a partial arm set rather than triggering off
 * whichever arms happened to parse.
 */
export const D063_TRIGGER_RULE: TriggerRule = Object.freeze({
  metric: 'SURPASS2_SERIOUS_ADVERSE_EVENT_RATE_PER_ARM',
  threshold: 0.08,
  relation: '>=',
  window: 4,
  minObservations: 4,
});

/**
 * The real per-arm serious-AE rate, from the participant-level
 * `seriousNumAffected`/`seriousNumAtRisk` the registry reports for each arm —
 * never a sum over per-term rows, which would count one participant once per
 * event they had.
 */
export function d063ParseSeriousAeRates(bytes: Uint8Array): readonly number[] {
  const trial = decodeTrial(bytes);
  if (trial.adverseEvents === null) throw new Error('D-063: the pinned SURPASS-2 record carries no adverseEvents module — the bytes changed shape.');
  return trial.adverseEvents.eventGroups.map((g) => {
    if (g.seriousNumAffected === null || g.seriousNumAtRisk === null || g.seriousNumAtRisk === 0) {
      throw new Error(`D-063: arm "${g.title}" states no serious-AE numerator/denominator — a missing count is NO DATA, never a zero.`);
    }
    return g.seriousNumAffected / g.seriousNumAtRisk;
  });
}

export async function runD063ParametricTrigger(opts: { readonly now?: () => string } = {}): Promise<TriggerResult | TriggerBlocked> {
  return runParametricTrigger({
    mode: 'PRODUCTION',
    rule: D063_TRIGGER_RULE,
    sources: [D063_SURPASS2_SOURCE],
    store: sharedEvidenceConnectorStore,
    port: d063SurpassEvidencePort,
    parseSeries: d063ParseSeriousAeRates,
    now: opts.now ?? (() => '1970-01-01T00:00:00Z'),
  });
}
