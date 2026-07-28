import {
  gradeEvidence, findConflicts, TIERS, OUTCOMES,
  type EvidenceRecord, type EvidenceGrade, type EvidenceTier, type EvidenceConflict,
} from './evidence.ts';
import { getIntervention, type InterventionId } from './interventions.ts';
import { analyseCancerSafety, type CancerSafetyProfile } from './cancerSafety.ts';
import { getNode } from './knowledgeGraph.ts';
import type { HallmarkId } from './hallmarks.ts';

/**
 * Longevity Discovery Platform — appraisal engine.
 *
 * Turns a pile of evidence records into a defensible statement of WHERE A
 * STRATEGY STANDS. The output is never "this works" and never a probability of
 * benefit; those are not derivable from what the platform holds. What IS
 * derivable, and what the field actually lacks, is a precise account of:
 *
 *   what has been shown, in what system, measuring what
 *   what has not been shown at all
 *   where the literature contradicts itself
 *   how far the best available evidence sits from human clinical relevance
 *
 * Uncertainty here is COVERAGE-BASED, not belief-based. It answers "how much of
 * the evidence a decision would need is missing?" — a question about the
 * literature, which the platform can see — rather than "how likely is this to
 * work?", a question about biology, which it cannot.
 */

/** How far along the evidence pipeline a strategy has actually travelled. */
export type ResearchMaturity =
  | 'no-evidence'
  | 'mechanistic-only'
  | 'model-organism'
  | 'mammalian'
  | 'human-preliminary'
  | 'human-controlled';

const MATURITY_BY_TIER: Record<EvidenceTier, ResearchMaturity> = {
  'in-silico': 'mechanistic-only',
  'in-vitro-nonhuman': 'mechanistic-only',
  'in-vitro-human': 'mechanistic-only',
  invertebrate: 'model-organism',
  rodent: 'mammalian',
  'non-human-primate': 'mammalian',
  'human-observational': 'human-preliminary',
  'human-interventional': 'human-controlled',
};

const MATURITY_ORDER: ResearchMaturity[] = [
  'no-evidence', 'mechanistic-only', 'model-organism', 'mammalian', 'human-preliminary', 'human-controlled',
];

export interface UncertaintyComponent {
  factor: string;
  /** 0–1, where 1 means "this dimension is fully covered". */
  coverage: number;
  /** Relative weight of this dimension in the total. */
  weight: number;
  explanation: string;
  /** What would raise this component's coverage. */
  wouldBeReducedBy: string;
}

export interface TranslationalDifficulty {
  /** 0–100; higher means further from human application. */
  score: number;
  band: 'near-term' | 'moderate' | 'distant' | 'speculative';
  drivers: { factor: string; contribution: number; explanation: string }[];
}

export interface InterventionAppraisal {
  interventionId: InterventionId;
  label: string;
  recordCount: number;
  /** Every record graded, strongest first. */
  grades: { record: EvidenceRecord; grade: EvidenceGrade }[];
  /** Mechanisms this strategy targets, and whether any evidence speaks to each. */
  mechanismCoverage: { hallmark: HallmarkId; label: string; records: number; bestTier: EvidenceTier | null }[];
  maturity: ResearchMaturity;
  /** Best strength achieved by any single record (0–100). */
  bestStrength: number;
  /** Best human relevance achieved by any single record (0–100). */
  bestHumanRelevance: number;
  conflicts: EvidenceConflict[];
  /** 0–100; how much of the evidence a decision would need is absent. */
  uncertainty: number;
  uncertaintyComponents: UncertaintyComponent[];
  translationalDifficulty: TranslationalDifficulty;
  safety: CancerSafetyProfile | null;
  /** Plain statement of the position. Never asserts efficacy. */
  verdict: string;
}

function tierRank(t: EvidenceTier): number {
  return TIERS[t].humanProximity;
}

/**
 * Appraise one strategy against the records supplied for it. Pure: the same
 * records always give the same appraisal, so two labs comparing notes are
 * comparing evidence rather than temperament.
 */
export function appraiseIntervention(interventionId: InterventionId, allRecords: EvidenceRecord[]): InterventionAppraisal | null {
  const intervention = getIntervention(interventionId);
  if (!intervention) return null;

  const records = allRecords.filter((r) => r.interventionId === interventionId);
  const grades = records
    .map((record) => ({ record, grade: gradeEvidence(record) }))
    .sort((a, b) => b.grade.strength - a.grade.strength);

  const mechanismCoverage = intervention.targets.map((hallmark) => {
    const forHallmark = records.filter((r) => r.hallmarkId === hallmark);
    const bestTier = forHallmark.length
      ? forHallmark.reduce((best, r) => (tierRank(r.tier) > tierRank(best) ? r.tier : best), forHallmark[0].tier)
      : null;
    return { hallmark, label: getNode(hallmark)?.label ?? hallmark, records: forHallmark.length, bestTier };
  });

  const maturity = records.reduce<ResearchMaturity>((best, r) => {
    const m = MATURITY_BY_TIER[r.tier];
    return MATURITY_ORDER.indexOf(m) > MATURITY_ORDER.indexOf(best) ? m : best;
  }, 'no-evidence');

  const bestStrength = grades.length ? Math.max(...grades.map((g) => g.grade.strength)) : 0;
  const bestHumanRelevance = grades.length ? Math.max(...grades.map((g) => g.grade.humanRelevance)) : 0;
  const conflicts = findConflicts(records);

  const uncertaintyComponents = buildUncertainty(mechanismCoverage, conflicts, records);
  const totalWeight = uncertaintyComponents.reduce((s, c) => s + c.weight, 0) || 1;
  const weightedCoverage = uncertaintyComponents.reduce((s, c) => s + c.coverage * c.weight, 0) / totalWeight;
  const uncertainty = Math.round((1 - weightedCoverage) * 100);

  const safety = analyseCancerSafety(interventionId);
  const translationalDifficulty = buildDifficulty(interventionId, records, safety);

  return {
    interventionId, label: intervention.label,
    recordCount: records.length, grades, mechanismCoverage, maturity,
    bestStrength, bestHumanRelevance, conflicts,
    uncertainty, uncertaintyComponents, translationalDifficulty, safety,
    verdict: buildVerdict(intervention.label, records.length, maturity, bestHumanRelevance, conflicts.length, uncertainty, safety),
  };
}

function buildUncertainty(
  coverage: InterventionAppraisal['mechanismCoverage'],
  conflicts: EvidenceConflict[],
  records: EvidenceRecord[],
): UncertaintyComponent[] {
  const covered = coverage.filter((c) => c.records > 0).length;
  const mechanismCoverage = coverage.length ? covered / coverage.length : 0;

  const bestProximity = records.length ? Math.max(...records.map((r) => TIERS[r.tier].humanProximity)) : 0;
  const replicatedFraction = records.length ? records.filter((r) => r.replicated).length / records.length : 0;
  const bestOutcome = records.length ? Math.max(...records.map((r) => OUTCOMES[r.outcome].weight)) : 0;
  // Any unresolved contradiction caps this dimension hard: an unexplained
  // disagreement is a bigger hole than a missing study. An EMPTY record set scores
  // zero rather than one — nothing is trivially consistent with nothing, and
  // crediting an unstudied strategy for "no contradictions" would understate
  // exactly the case where the platform knows least.
  const conflictCoverage = records.length === 0
    ? 0
    : conflicts.length === 0 ? 1 : Math.max(0, 1 - conflicts.length * 0.5);

  return [
    {
      factor: 'Mechanism coverage', coverage: mechanismCoverage, weight: 0.25,
      explanation: `${covered} of ${coverage.length} targeted mechanisms have at least one evidence record.`,
      wouldBeReducedBy: coverage.filter((c) => c.records === 0).map((c) => `evidence for ${c.label}`).join('; ') || 'nothing — every targeted mechanism has evidence.',
    },
    {
      factor: 'Human proximity of best evidence', coverage: bestProximity, weight: 0.3,
      explanation: records.length
        ? `Best available system reaches ${Math.round(bestProximity * 100)}% of the way to human clinical relevance.`
        : 'No evidence records at all, so nothing is known from this platform’s holdings.',
      wouldBeReducedBy: 'a study in a system closer to human ageing.',
    },
    {
      factor: 'Independent replication', coverage: replicatedFraction, weight: 0.2,
      explanation: `${Math.round(replicatedFraction * 100)}% of records report independent replication.`,
      wouldBeReducedBy: 'independent replication of the strongest existing result.',
    },
    {
      factor: 'Outcome relevance', coverage: bestOutcome, weight: 0.15,
      explanation: records.length
        ? 'Weighted by the most meaningful endpoint measured — surrogates count for less than survival or function.'
        : 'No endpoint has been measured.',
      wouldBeReducedBy: 'a study measuring lifespan or function rather than a surrogate marker.',
    },
    {
      factor: 'Internal consistency', coverage: conflictCoverage, weight: 0.1,
      explanation: records.length === 0
        ? 'No records at all — consistency is unknown, not established.'
        : conflicts.length === 0
          ? 'No contradictory records for the same intervention–mechanism pair.'
          : `${conflicts.length} unresolved contradiction(s) in the record set.`,
      wouldBeReducedBy: conflicts.length ? 'a study designed to identify what differs between the conflicting reports.' : 'nothing — the record set is internally consistent.',
    },
  ];
}

function buildDifficulty(
  interventionId: InterventionId, records: EvidenceRecord[], safety: CancerSafetyProfile | null,
): TranslationalDifficulty {
  const intervention = getIntervention(interventionId)!;
  const drivers: { factor: string; contribution: number; explanation: string }[] = [];

  const bestProximity = records.length ? Math.max(...records.map((r) => TIERS[r.tier].humanProximity)) : 0;
  const evidenceGap = Math.round((1 - bestProximity) * 45);
  drivers.push({
    factor: 'Distance of best evidence from human', contribution: evidenceGap,
    explanation: records.length
      ? `Best system reaches ${Math.round(bestProximity * 100)}% human proximity; the remainder must still be crossed.`
      : 'No evidence exists, so the entire translational distance remains.',
  });

  const statusPenalty = intervention.clinicalStatus === 'clinical-trials' ? 5
    : intervention.clinicalStatus === 'early-clinical' ? 15 : 25;
  drivers.push({
    factor: 'Clinical development status', contribution: statusPenalty,
    explanation: `Status: ${intervention.clinicalStatus}. This reflects how far the strategy has been studied in humans, not whether those studies succeeded.`,
  });

  const clinicalTensions = intervention.tensions.filter((t) => t.severity === 'documented-clinical').length;
  const preclinicalTensions = intervention.tensions.filter((t) => t.severity === 'documented-preclinical').length;
  const tensionPenalty = clinicalTensions * 10 + preclinicalTensions * 5;
  if (tensionPenalty > 0) {
    drivers.push({
      factor: 'Documented safety tensions', contribution: tensionPenalty,
      explanation: `${clinicalTensions} clinically documented and ${preclinicalTensions} preclinically documented tension(s) must be resolved or monitored before human use.`,
    });
  }

  const oncoPenalty = safety ? Math.min(20, safety.risks.length * 5) : 0;
  if (oncoPenalty > 0) {
    drivers.push({
      factor: 'Oncogenic routes requiring surveillance', contribution: oncoPenalty,
      explanation: `${safety!.risks.length} mechanistic route(s) raise cancer risk and require long-term surveillance, which lengthens any trial.`,
    });
  }

  const score = Math.max(0, Math.min(100, drivers.reduce((s, d) => s + d.contribution, 0)));
  const bandFor = (n: number): TranslationalDifficulty['band'] =>
    n < 30 ? 'near-term' : n < 55 ? 'moderate' : n < 80 ? 'distant' : 'speculative';

  return { score, band: bandFor(score), drivers };
}

function buildVerdict(
  label: string, count: number, maturity: ResearchMaturity, humanRelevance: number,
  conflicts: number, uncertainty: number, safety: CancerSafetyProfile | null,
): string {
  if (count === 0) {
    return `No evidence records have been entered for ${label}. The platform therefore states nothing about it beyond mechanism — this is an empty file, not a negative result.`;
  }
  const parts = [
    `${label}: ${count} record(s), maturity "${maturity}", best human relevance ${humanRelevance}/100, uncertainty ${uncertainty}/100.`,
  ];
  if (humanRelevance < 40) parts.push('The strongest available evidence remains far from human clinical relevance.');
  if (conflicts > 0) parts.push(`${conflicts} unresolved contradiction(s) in the record set — see the conflict view before drawing any conclusion.`);
  if (safety && safety.risks.length > 0) parts.push(`${safety.risks.length} mechanistic route(s) increase cancer risk and are listed in the safety profile.`);
  parts.push('This is a statement about the state of the evidence, not a claim that the strategy works.');
  return parts.join(' ');
}

/** Appraise a set of strategies at once, ordered by lowest uncertainty first. */
export function appraiseAll(interventionIds: InterventionId[], records: EvidenceRecord[]): InterventionAppraisal[] {
  return interventionIds
    .map((id) => appraiseIntervention(id, records))
    .filter((a): a is InterventionAppraisal => a !== null)
    .sort((a, b) => a.uncertainty - b.uncertainty);
}

/**
 * The comparison the field most often gets wrong: strongest evidence is not the
 * same as most translatable. Returns strategies sorted by the GAP between the two,
 * which surfaces exactly the "convincing in worms, unknown in humans" cases.
 */
export function evidenceTranslationGap(appraisals: InterventionAppraisal[]): {
  interventionId: InterventionId; label: string; strength: number; humanRelevance: number; gap: number;
}[] {
  return appraisals
    .filter((a) => a.recordCount > 0)
    .map((a) => ({
      interventionId: a.interventionId, label: a.label,
      strength: a.bestStrength, humanRelevance: a.bestHumanRelevance,
      gap: a.bestStrength - a.bestHumanRelevance,
    }))
    .sort((x, y) => y.gap - x.gap);
}
