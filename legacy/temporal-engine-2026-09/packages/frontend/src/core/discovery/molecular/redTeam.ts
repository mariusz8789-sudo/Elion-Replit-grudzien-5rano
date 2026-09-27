/**
 * RED-TEAM PASS — "TRY TO DISPROVE THESE CANDIDATES."
 *
 * A second, adversarial pass over candidates that already survived mechanism
 * falsification and screening. It asks generic questions no earlier stage
 * asked, because they are not about whether the DATA IS THERE — they are
 * about whether the data means what a hopeful reading would want it to mean.
 *
 * Surviving red-team raises nothing on its own: `redTeamCandidate` never
 * outputs a confidence level, never marks anything EXPERIMENTALLY_VALIDATED.
 * "Candidate, który przetrwa red-team, dostaje wyższy evidence status — ale
 * NIE automatycznie experimental validation" is enforced structurally by this
 * module having no such output to give.
 */
export const RED_TEAM_VERSION = '1.0.0';

export type RedTeamAngle =
  | 'FALSE_SIMILARITY' | 'SPECIES_GAP' | 'CONCENTRATION_GAP' | 'DATABASE_AMBIGUITY' | 'MODEL_LIMITATION';

export interface RedTeamFinding {
  angle: RedTeamAngle;
  concern: string;
  /** Whether existing evidence actually answers this concern, or it stays open. */
  addressed: boolean;
  detail: string;
}

export interface RedTeamReport {
  candidateKey: string;
  findings: readonly RedTeamFinding[];
  openConcernCount: number;
  /** False only when an UNADDRESSED concern is itself disqualifying (never used for these five generic angles — none of them alone falsifies a candidate; they inform NEXT_EXPERIMENT instead). */
  survived: boolean;
}

export interface RedTeamInput {
  candidateKey: string;
  /** True when ranking used structural similarity as a criterion rather than only independent target/mechanism evidence. Should always be false in this pipeline — checked, not assumed. */
  rankedBySimilarityAlone: boolean;
  /** Whether the candidate's mechanism evidence came from a human/clinical system, as opposed to an animal or in vitro preparation only. Literature-derived, stated per candidate. */
  mechanismEvidenceIsHumanSystem: boolean;
  /** Whether a concentration/dose at which the reported effect occurs is known and stated in the evidence. */
  effectiveConcentrationKnown: boolean;
  /** Whether any live database lookup for this candidate returned more than one ambiguous match. */
  databaseLookupWasAmbiguous: boolean;
  admetInDomain: boolean | null;
}

/**
 * Runs the five standard adversarial angles. None of them alone rejects a
 * candidate — that is what `mechanismFalsification.ts` is for. An open
 * finding here is the input to "what next experiment reduces uncertainty
 * most", not a reason to discard evidence that is otherwise real.
 */
export function redTeamCandidate(input: RedTeamInput): RedTeamReport {
  const findings: RedTeamFinding[] = [
    {
      angle: 'FALSE_SIMILARITY',
      concern: 'Is this candidate retained because it structurally resembles the reference, rather than on its own independent target evidence?',
      addressed: !input.rankedBySimilarityAlone,
      detail: input.rankedBySimilarityAlone
        ? 'Ranking used structural similarity as a criterion — retention cannot be separated from resemblance to the reference.'
        : 'Ranking and retention rest on the candidate\'s own independent mechanism evidence; structural similarity to the reference was computed and reported, never used as a ranking criterion.',
    },
    {
      angle: 'SPECIES_GAP',
      concern: 'Was the mechanism evidence obtained in a human system, or could it fail to generalise from an animal/in vitro preparation?',
      addressed: input.mechanismEvidenceIsHumanSystem,
      detail: input.mechanismEvidenceIsHumanSystem
        ? 'Mechanism evidence was obtained in a human system.'
        : 'Mechanism evidence comes from an animal or in vitro preparation; human-system confirmation is an open gap, not assumed.',
    },
    {
      angle: 'CONCENTRATION_GAP',
      concern: 'Is the concentration at which the reported effect occurs known, and achievable without confounding effects?',
      addressed: input.effectiveConcentrationKnown,
      detail: input.effectiveConcentrationKnown
        ? 'An effective concentration is stated in the evidence.'
        : 'No effective concentration is established here; a reported effect "at some concentration" does not establish it occurs at a physiologically or therapeutically relevant one.',
    },
    {
      angle: 'DATABASE_AMBIGUITY',
      concern: 'Did any live database lookup for this candidate return more than one ambiguous match that could have been silently resolved wrong?',
      addressed: !input.databaseLookupWasAmbiguous,
      detail: input.databaseLookupWasAmbiguous
        ? 'A database lookup for this candidate was ambiguous; the record used has not been independently confirmed as the correct one.'
        : 'No live database lookup produced an ambiguous match for this candidate (either it resolved cleanly, or none was reachable and none was used).',
    },
    {
      angle: 'MODEL_LIMITATION',
      concern: 'Is the candidate inside every computational model\'s stated applicability domain, or could a prediction be running outside where the model is validated?',
      addressed: input.admetInDomain === true,
      detail: input.admetInDomain === null
        ? 'No applicability-domain check was run (no structure to evaluate it against).'
        : input.admetInDomain
          ? 'Inside the declared ADMET applicability domain.'
          : 'Outside the declared ADMET applicability domain; any prediction made for this candidate is running where the model is not validated.',
    },
  ];

  return {
    candidateKey: input.candidateKey,
    findings,
    openConcernCount: findings.filter((f) => !f.addressed).length,
    survived: true,
  };
}
