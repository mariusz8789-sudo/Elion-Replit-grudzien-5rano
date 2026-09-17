import {
  type ArmIdentity,
  type CountedOutcomeObservation,
  type RiskRatioComparison,
  type SourceStudyIdentity,
  compareCountedOutcomes,
} from '../agent/evidenceProvenance';
import surpass2Raw from './a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';

/**
 * SURPASS-2 (NCT03987919) INGESTED AS DIRECT RANDOMISED EVIDENCE.
 *
 * This trial is already pinned in this repository — it has been the
 * semaglutide comparator since `2026-09-13T13:45:36Z`. What was missing is
 * that its THREE TIRZEPATIDE ARMS were never readable as candidate-side
 * observations, so the campaign compared an n=16 cohort from a different
 * study against this trial's semaglutide arm and vetoed on the result
 * (docs/DECISIONS.md D-042).
 *
 * This module reads the same pinned bytes and exposes every arm as a
 * `CountedOutcomeObservation` carrying its study identity and its sha256, so
 * a same-trial randomised comparison becomes expressible. It CHANGES NO
 * VERDICT and is wired into no decision: re-adjudication is a separate,
 * explicitly marked step, per the mandate.
 *
 * PROVENANCE HONESTY:
 *  - `contentSha256` is the sha256 of the NARROWED file this repository
 *    holds, recorded in its own `meta.json`. The upstream raw response has
 *    its own hash, also recorded there.
 *  - An external research package quotes a DIFFERENT hash and byte count for
 *    the same URL (`683c4659…`, 120326 bytes vs our `1e72fb8d…`, 120327).
 *    The COUNTS agree exactly; the BYTES do not. That discrepancy could not
 *    be adjudicated in this environment — clinicaltrials.gov is unreachable
 *    (CONNECT tunnel 403) — so it stands as NO_ACCESS, and this module uses
 *    OUR bytes and OUR hash, the only chain of custody we can vouch for.
 *  - `codingSystem` is null, not 'MedDRA 23.1'. The narrowed fixture does not
 *    carry the MedDRA version, and copying it from a third-party document
 *    would be exactly the kind of borrowed claim this file refuses to make.
 */

export const SURPASS2_EVIDENCE_VERSION = '1.0.0';

/** From `a2-ozempic-substitute/meta.json`, written by the fetch job that pinned the file. */
const SURPASS2_NARROW_SHA256 = '385c58a1b7a19bedac0bb303846a8cffb23242d912edd7fc91fa93d5b278a8b0';
const SURPASS2_NARROW_BYTES = 42793;
/** The upstream response the narrowing was derived from, also from `meta.json`. */
export const SURPASS2_RAW_SHA256 = '1e72fb8ddc9131e0a384d49b83ed2b5ed17915d805458fbc4c659d8c06f70f12';
export const SURPASS2_RAW_BYTES = 120327;
const SURPASS2_RETRIEVED_AT = '2026-09-13T13:45:36.656Z';

interface RawStat {
  readonly groupId: string;
  readonly numEvents: number | null;
  readonly numAffected: number | null;
  readonly numAtRisk: number | null;
}
interface RawEvent {
  readonly term: string;
  readonly organSystem: string;
  readonly stats: readonly RawStat[];
}
interface RawEventGroup {
  readonly id: string;
  readonly title: string;
  readonly otherNumAtRisk: number | null;
}
interface RawTrial {
  readonly nctId: string;
  readonly briefTitle: string;
  readonly adverseEvents: {
    readonly eventGroups: readonly RawEventGroup[];
    readonly otherEvents: readonly RawEvent[];
    readonly seriousEvents: readonly RawEvent[];
  } | null;
}

const TRIAL = surpass2Raw as unknown as RawTrial;

export const SURPASS2_STUDY: SourceStudyIdentity = {
  registry: 'CLINICALTRIALS_GOV',
  studyId: TRIAL.nctId,
  title: TRIAL.briefTitle,
  sourceUrl: `https://clinicaltrials.gov/api/v2/studies/${TRIAL.nctId}`,
  contentSha256: SURPASS2_NARROW_SHA256,
  contentBytes: SURPASS2_NARROW_BYTES,
  retrievedAt: SURPASS2_RETRIEVED_AT,
  // SURPASS-2 randomised participants across all four arms below. That is the
  // single fact that makes a within-study comparison DIRECT rather than naive.
  randomised: true,
};

/** The population the trial enrolled — carried so a T2D number is never silently read as an obesity number. */
export const SURPASS2_POPULATION = 'Adults with type 2 diabetes, inadequately controlled on metformin (40 weeks)';

function eventGroups(): readonly RawEventGroup[] {
  if (TRIAL.adverseEvents === null) throw new Error('SURPASS-2 fixture carries no adverseEvents module — the pinned file changed shape.');
  return TRIAL.adverseEvents.eventGroups;
}

function armIdentity(group: RawEventGroup): ArmIdentity {
  if (group.otherNumAtRisk === null) throw new Error(`SURPASS-2 arm ${group.id} has no denominator.`);
  return { groupId: group.id, title: group.title, nAtRisk: group.otherNumAtRisk };
}

/** Every arm of the trial, in the order the registry reports them. */
export function surpass2Arms(): readonly ArmIdentity[] {
  return eventGroups().map(armIdentity);
}

export function surpass2ArmByTitle(title: string): ArmIdentity {
  const group = eventGroups().find((g) => g.title === title);
  if (group === undefined) throw new Error(`SURPASS-2 has no arm titled "${title}". Arms: ${eventGroups().map((g) => g.title).join(', ')}.`);
  return armIdentity(group);
}

/** The outcome terms the trial reports at its ≥5% threshold. */
export function surpass2OutcomeTerms(): readonly string[] {
  if (TRIAL.adverseEvents === null) return [];
  return TRIAL.adverseEvents.otherEvents.map((e) => e.term);
}

/**
 * One counted outcome in one arm, as an observation that carries where it
 * came from. Throws rather than returning a placeholder when the term or the
 * arm is absent: a missing count is NO DATA, never a zero.
 */
export function surpass2Observation(term: string, armTitle: string): CountedOutcomeObservation {
  if (TRIAL.adverseEvents === null) throw new Error('SURPASS-2 fixture carries no adverseEvents module.');
  const arm = surpass2ArmByTitle(armTitle);
  const event = [...TRIAL.adverseEvents.otherEvents, ...TRIAL.adverseEvents.seriousEvents].find((e) => e.term === term);
  if (event === undefined) throw new Error(`SURPASS-2 does not report "${term}". Reported at the ≥5% threshold: ${surpass2OutcomeTerms().join(', ')}.`);
  const stat = event.stats.find((s) => s.groupId === arm.groupId);
  if (stat === undefined || stat.numAffected === null || stat.numAtRisk === null) {
    throw new Error(`SURPASS-2 reports no counts for "${term}" in arm ${arm.groupId} ("${armTitle}").`);
  }
  return {
    observationId: `SURPASS2:${arm.groupId}:${term}`,
    study: SURPASS2_STUDY,
    arm,
    term,
    numAffected: stat.numAffected,
    numAtRisk: stat.numAtRisk,
    codingSystem: null,
    population: SURPASS2_POPULATION,
  };
}

/**
 * Every within-trial comparison of one outcome term against one reference
 * arm. Because both sides come from this one randomised study, every result
 * classifies as DIRECT_RANDOMISED — computed by
 * `classifyComparisonEvidenceClass`, not declared here.
 */
export function surpass2DirectComparisons(term: string, referenceArmTitle: string): readonly RiskRatioComparison[] {
  const reference = surpass2Observation(term, referenceArmTitle);
  const out: RiskRatioComparison[] = [];
  for (const arm of surpass2Arms()) {
    if (arm.groupId === reference.arm.groupId) continue;
    const comparison = compareCountedOutcomes(surpass2Observation(term, arm.title), reference);
    if (comparison !== null) out.push(comparison);
  }
  return out;
}
