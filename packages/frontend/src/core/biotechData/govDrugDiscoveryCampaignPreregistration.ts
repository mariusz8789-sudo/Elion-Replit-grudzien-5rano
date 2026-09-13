import { canonicalJson, fnv1a } from '../events/hash';
import {
  E2E01_PREREGISTRATION_FINGERPRINT,
  E2E01_WINNER_RULES,
  E2E01_RECIPE_RULES,
  E2E01_BANNED_OUTPUT_STRINGS,
  E2E01_FALSIFICATION_ATTACKS,
  E2E01_ALLOWED_OUTCOMES,
  E2E01_PROBLEM,
  E2E01_POPULATION,
} from './govDrugDiscoveryE2EPreregistration';

/**
 * GOV-DRUG-DISCOVERY-CAMPAIGN-01 — a SEPARATE sealed preregistration that
 * reshapes the E2E-01 funnel into the stage sequence a government reviewer
 * asked to see (MANY -> SCREENING -> TOP 10 -> TOP 2 -> DEEP FALSIFICATION ->
 * SAFETY GATE -> WINNER/NO_WINNER), while leaving E2E-01 itself byte-identical.
 *
 * WHY A NEW FILE INSTEAD OF EDITING `E2E01_TIER_CRITERIA.top3Size`. That field
 * sits inside `E2E01_PREREGISTRATION_FINGERPRINT`, which is the anti-HARK
 * anchor of the whole scenario: it was sealed BEFORE the candidate space was
 * pulled, and its whole value is that a reader can prove no rule was edited
 * after the data was seen. The data HAS now been seen — the E2E-01 run is on
 * record as NO_WINNER — so editing a stage size in that sealed object would be
 * the textbook version of the fraud this codebase exists to prevent. E2E-01 is
 * therefore untouched and its fingerprint unchanged; this is a declared
 * re-analysis standing on top of it.
 *
 * THE LINE THIS PREREGISTRATION DRAWS, AND IT IS THE IMPORTANT ONE:
 *
 *   FUNNEL SHAPE is changed here. How many candidates are carried into the
 *   shortlist, how many are named as finalists, and how widely deep
 *   falsification is run — these are presentation and thoroughness choices,
 *   declared openly below.
 *
 *   WINNER CRITERIA ARE NOT CHANGED. `winnerRules` is
 *   `E2E01_WINNER_RULES` imported verbatim, not restated and not retuned. The
 *   safety veto, the population requirement, the "no unresolved
 *   counterevidence" requirement and the conflicting-direction rule are the
 *   sealed ones. If this campaign reaches a different verdict from E2E-01, it
 *   can only be because MORE candidates were put under scrutiny, never because
 *   the bar was lowered.
 *
 * HONEST DISCLOSURE OF WHAT THIS IS NOT. This is not a blind preregistration.
 * `dataAlreadyObserved` records that plainly. A blind seal is only possible
 * once per dataset and E2E-01 already spent it.
 *
 * STRICTLY MORE SCRUTINY, NEVER LESS. Two of the three shape changes tighten
 * the run: deep falsification moves from the top 3 candidates to the ENTIRE
 * shortlist, and the winner decision is evaluated over that whole shortlist
 * rather than over the two named finalists — so no disagreement between
 * candidates can be hidden by narrowing the field. The safety gate, which
 * E2E-01 never invoked on this path at all, becomes mandatory.
 */

export const GDD_CAMPAIGN_SCENARIO_ID = 'GOV-DRUG-DISCOVERY-CAMPAIGN-01';
export const GDD_CAMPAIGN_CONTRACT_VERSION = '1.0.0';

/** Unchanged from E2E-01 — the same question, for the same population. */
export const GDD_PROBLEM = E2E01_PROBLEM;
export const GDD_POPULATION = E2E01_POPULATION;

/**
 * Caps, not quotas. The shortlist holds AT MOST this many; if the evidence
 * gates leave fewer, the run reports the real number and never pads the list
 * to reach it.
 */
export const GDD_SHORTLIST_SIZE = 10;
export const GDD_FINALIST_SIZE = 2;

/** E2E-01 ran the six attacks on its top 3. This runs them on every shortlisted candidate. */
export const GDD_FALSIFICATION_SCOPE = 'FULL_SHORTLIST' as const;

/** The winner decision sees the whole shortlist, never just the finalists — narrowing the field could only hide a disagreement. */
export const GDD_WINNER_DECISION_SCOPE = 'FULL_SHORTLIST' as const;

/**
 * The paths that must be attempted before a non-winner verdict is accepted.
 * NO_WINNER is a legitimate scientific result; NO_WINNER reached without
 * trying is a cheap stop, and `runGovDrugDiscoveryCampaign` throws rather than
 * emitting one. Each path resolves to EXHAUSTED (tried, did not change the
 * verdict), RESOLVED (tried, changed something), or BLOCKED_NO_ACCESS (tried,
 * genuinely unreachable — which must name what is missing).
 */
export type GddExhaustionPath =
  | 'DEEP_FALSIFICATION_FULL_SHORTLIST'
  | 'DIFFERENTIATING_EXPERIMENT'
  | 'OBSERVATION_GAP_REQUEST'
  | 'REVIVABLE_ELIMINATED_CANDIDATES';

export const GDD_EXHAUSTION_PATHS: readonly GddExhaustionPath[] = [
  'DEEP_FALSIFICATION_FULL_SHORTLIST',
  'DIFFERENTIATING_EXPERIMENT',
  'OBSERVATION_GAP_REQUEST',
  'REVIVABLE_ELIMINATED_CANDIDATES',
];

export const GDD_NO_WINNER_POLICY =
  'A non-winner outcome is accepted ONLY after every path in GDD_EXHAUSTION_PATHS has been attempted and resolved to EXHAUSTED, RESOLVED or BLOCKED_NO_ACCESS. A path left NOT_ATTEMPTED makes the run throw: stopping early is a defect, not a verdict. Equally, no path may be re-run with altered criteria in order to manufacture a winner — the criteria are E2E01_WINNER_RULES, inherited verbatim.';

/**
 * The gate that E2E-01 never invoked on this path. Its
 * `NO_UNRESOLVED_CRITICAL_CONTRADICTION` criterion is only meaningful if it is
 * actually fed the contradictions the run found, so the source is named here
 * rather than left to a caller to remember.
 */
export const GDD_SAFETY_GATE_POLICY =
  'Every finalist is put through evaluatePracticalCandidate (core/agent/practicalCandidateGate.ts). Its unresolvedContradictions are sourced from that candidate\'s OWN deep-falsification result (E2E01DeepFalsification.unresolvedCounterevidence) plus its existential safety veto reason — never passed as an empty list. A candidate whose gate outcome is REFUSE cannot be named the winner, whatever its score.';

export const GDD_DATA_ALREADY_OBSERVED =
  'NOT A BLIND SEAL. The pinned candidate space and every trial behind it were already observed by GOV-DRUG-DISCOVERY-E2E-01, whose recorded outcome was NO_WINNER. This preregistration is therefore a declared re-analysis: it changes funnel SHAPE only, inherits E2E01_WINNER_RULES verbatim, and widens rather than narrows the evidence under scrutiny. A reader should weigh its verdict accordingly.';

export interface GddCampaignPreregistration {
  readonly scenarioId: string;
  readonly contractVersion: string;
  readonly problem: string;
  readonly population: typeof GDD_POPULATION;
  readonly shortlistSize: number;
  readonly finalistSize: number;
  readonly falsificationScope: typeof GDD_FALSIFICATION_SCOPE;
  readonly winnerDecisionScope: typeof GDD_WINNER_DECISION_SCOPE;
  readonly falsificationAttacks: readonly string[];
  readonly allowedOutcomes: readonly string[];
  /** Imported verbatim. Restating it here in different words would be a silent retune. */
  readonly winnerRules: string;
  readonly recipeRules: string;
  readonly bannedOutputStrings: readonly string[];
  readonly exhaustionPaths: readonly GddExhaustionPath[];
  readonly noWinnerPolicy: string;
  readonly safetyGatePolicy: string;
  readonly dataAlreadyObserved: string;
  /** Lineage: the sealed run this stands on. Unchanged by this file. */
  readonly inheritedFromFingerprint: string;
  readonly fingerprint: string;
}

function frozenView() {
  return {
    scenarioId: GDD_CAMPAIGN_SCENARIO_ID,
    contractVersion: GDD_CAMPAIGN_CONTRACT_VERSION,
    problem: GDD_PROBLEM,
    population: GDD_POPULATION,
    shortlistSize: GDD_SHORTLIST_SIZE,
    finalistSize: GDD_FINALIST_SIZE,
    falsificationScope: GDD_FALSIFICATION_SCOPE,
    winnerDecisionScope: GDD_WINNER_DECISION_SCOPE,
    falsificationAttacks: E2E01_FALSIFICATION_ATTACKS,
    allowedOutcomes: E2E01_ALLOWED_OUTCOMES,
    winnerRules: E2E01_WINNER_RULES,
    recipeRules: E2E01_RECIPE_RULES,
    bannedOutputStrings: E2E01_BANNED_OUTPUT_STRINGS,
    exhaustionPaths: GDD_EXHAUSTION_PATHS,
    noWinnerPolicy: GDD_NO_WINNER_POLICY,
    safetyGatePolicy: GDD_SAFETY_GATE_POLICY,
    dataAlreadyObserved: GDD_DATA_ALREADY_OBSERVED,
    inheritedFromFingerprint: E2E01_PREREGISTRATION_FINGERPRINT,
  };
}

export const GDD_CAMPAIGN_PREREGISTRATION_FINGERPRINT = fnv1a(canonicalJson(frozenView()));

export const GDD_CAMPAIGN_PREREGISTRATION: GddCampaignPreregistration = {
  ...frozenView(),
  fingerprint: GDD_CAMPAIGN_PREREGISTRATION_FINGERPRINT,
};
