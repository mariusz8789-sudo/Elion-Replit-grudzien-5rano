/**
 * Longevity Discovery Platform — evidence model and grading rubric (layer 2 of 4).
 *
 * THE CENTRAL IDEA. Ageing research fails most often not by measuring badly but
 * by transporting a result across a gap it cannot cross: a lifespan effect in
 * C. elegans becomes "slows ageing", a methylation-clock shift becomes "younger".
 * So this module grades every record on TWO INDEPENDENT AXES and never merges
 * them into one number:
 *
 *   strength        — how well the study supports its OWN conclusion, in its own
 *                     system. Strong worm evidence is strong evidence about worms.
 *   humanRelevance  — how much that conclusion transfers to human ageing.
 *
 * A perfectly executed, replicated, blinded worm lifespan study scores high on
 * strength and low on humanRelevance. Collapsing those into a single "score" is
 * exactly the error the platform exists to prevent.
 *
 * Nothing here is invented biology. The rubric is an explicit, auditable weighting
 * of study METADATA that the scientist enters, and every contribution is returned
 * in `breakdown` so a reader can disagree with a specific weight rather than with
 * an opaque total.
 */

/** Experimental system, ordered by translational proximity to human ageing. */
export type EvidenceTier =
  | 'in-silico'
  | 'in-vitro-nonhuman'
  | 'in-vitro-human'
  | 'invertebrate'
  | 'rodent'
  | 'non-human-primate'
  | 'human-observational'
  | 'human-interventional';

/**
 * What the study actually measured. This matters as much as the system: a
 * biomarker moving is not a lifespan changing, and target engagement is not
 * either. Surrogate outcomes are explicitly discounted.
 */
export type OutcomeType =
  /** Survival: median or maximal lifespan. */
  | 'lifespan'
  /** Function preserved: frailty, grip strength, cognition, tissue regeneration. */
  | 'healthspan'
  /** A surrogate marker moved (epigenetic clock, telomere length, SA-β-gal burden). */
  | 'biomarker'
  /** The intervention hit its molecular target, nothing further shown. */
  | 'target-engagement';

export type EffectDirection = 'beneficial' | 'null' | 'harmful';

/** One study, as entered by a scientist. `citation` is mandatory — see validateEvidence. */
export interface EvidenceRecord {
  id: string;
  interventionId: string;
  /** Which ageing mechanism this record speaks to. */
  hallmarkId: string;
  tier: EvidenceTier;
  outcome: OutcomeType;
  direction: EffectDirection;
  /** Free-text citation (DOI, PMID or full reference). Required, never auto-filled. */
  citation: string;
  /** Species/system as reported, e.g. 'C57BL/6 mouse', 'human dermal fibroblast'. */
  system: string;
  /** Independently replicated by a different group. */
  replicated: boolean;
  randomised: boolean;
  /** Outcome assessed blind to allocation. */
  blinded: boolean;
  preregistered: boolean;
  /** n per group. Bands, not exact power calculations. */
  sampleSize: number;
  /**
   * Whether the primary readout directly measures the mechanism or is a proxy
   * (see Readout.kind in hallmarks.ts). Proxy-only evidence is discounted.
   */
  readoutKind: 'direct' | 'proxy';
  /** Optional note from the entering scientist. */
  note?: string;
  addedAt: number;
}

export interface TierMeta {
  tier: EvidenceTier;
  label: string;
  /** Contribution to `strength` before quality modifiers (0–1). */
  weight: number;
  /**
   * Fraction of the human-relevance gap this tier closes (0–1). 1.0 would mean
   * "this IS human ageing"; nothing reaches 1.0, because even a human RCT
   * measures a specific population over a specific interval.
   */
  humanProximity: number;
  /** Why this tier sits where it does. Shown in the UI so the weight is arguable. */
  rationale: string;
}

export const TIERS: Record<EvidenceTier, TierMeta> = {
  'in-silico': {
    tier: 'in-silico', label: 'In silico', weight: 0.15, humanProximity: 0.02,
    rationale: 'A model output is a hypothesis generator. It contains no new observation of a living system.',
  },
  'in-vitro-nonhuman': {
    tier: 'in-vitro-nonhuman', label: 'In vitro (non-human cells)', weight: 0.3, humanProximity: 0.08,
    rationale: 'Real measurement, but in isolated non-human cells: no tissue context, no immune system, no organism-level ageing.',
  },
  'in-vitro-human': {
    tier: 'in-vitro-human', label: 'In vitro (human cells)', weight: 0.4, humanProximity: 0.18,
    rationale: 'Human molecular context, but cultured cells lack the niche, the circulation and the immune surveillance that shape ageing in vivo.',
  },
  invertebrate: {
    tier: 'invertebrate', label: 'Invertebrate (C. elegans, Drosophila)', weight: 0.5, humanProximity: 0.12,
    rationale: 'A whole living organism with clean lifespan endpoints, but post-mitotic somatic tissue and no comparable stem-cell or adaptive-immune compartments.',
  },
  rodent: {
    tier: 'rodent', label: 'Rodent', weight: 0.65, humanProximity: 0.35,
    rationale: 'Mammalian physiology with a tractable lifespan. Still differs from human in telomere biology, telomerase regulation, metabolic rate and dominant causes of death.',
  },
  'non-human-primate': {
    tier: 'non-human-primate', label: 'Non-human primate', weight: 0.75, humanProximity: 0.55,
    rationale: 'Closest available physiology, but studies are small, slow and rarely replicated, which caps the confidence they can carry.',
  },
  'human-observational': {
    tier: 'human-observational', label: 'Human — observational', weight: 0.55, humanProximity: 0.6,
    rationale: 'Directly about humans, but association is not causation: confounding and reverse causation are unresolved by design.',
  },
  'human-interventional': {
    tier: 'human-interventional', label: 'Human — interventional (RCT)', weight: 0.95, humanProximity: 0.85,
    rationale: 'The strongest available design. Still bounded by the trial population, dose, duration and endpoint actually studied.',
  },
};

export interface OutcomeMeta {
  outcome: OutcomeType;
  label: string;
  /** Multiplier applied to strength — surrogates carry less. */
  weight: number;
  rationale: string;
}

export const OUTCOMES: Record<OutcomeType, OutcomeMeta> = {
  lifespan: {
    outcome: 'lifespan', label: 'Lifespan', weight: 1.0,
    rationale: 'Survival is the endpoint the field is ultimately about, and it cannot be gamed by choice of marker.',
  },
  healthspan: {
    outcome: 'healthspan', label: 'Healthspan / function', weight: 0.9,
    rationale: 'Preserved function is arguably the endpoint that matters clinically, but it is composite and measured many different ways.',
  },
  biomarker: {
    outcome: 'biomarker', label: 'Biomarker / surrogate', weight: 0.45,
    rationale: 'A surrogate moved. Surrogates have repeatedly dissociated from outcomes; a clock reading changing is not ageing changing.',
  },
  'target-engagement': {
    outcome: 'target-engagement', label: 'Target engagement only', weight: 0.25,
    rationale: 'Shows the intervention does what it was designed to do molecularly. Says nothing about whether that helps.',
  },
};

/** One line of the transparent score breakdown. */
export interface GradeContribution {
  factor: string;
  /** Multiplicative factor applied at this step. */
  multiplier: number;
  /** Plain-language reason, shown in the UI. */
  reason: string;
}

export type ConfidenceBand = 'none' | 'weak' | 'moderate' | 'strong';

export interface EvidenceGrade {
  recordId: string;
  /** 0–100: how well the study supports its own conclusion in its own system. */
  strength: number;
  /** 0–100: how much that conclusion transfers to human ageing. */
  humanRelevance: number;
  strengthBand: ConfidenceBand;
  humanRelevanceBand: ConfidenceBand;
  breakdown: GradeContribution[];
  /** Methodological limitations detected from the metadata. */
  caveats: string[];
}

function band(score: number): ConfidenceBand {
  if (score < 20) return 'none';
  if (score < 40) return 'weak';
  if (score < 70) return 'moderate';
  return 'strong';
}

/** Sample-size band. Deliberately coarse — an exact n cannot be turned into power without a variance estimate. */
function sampleSizeFactor(n: number): { multiplier: number; reason: string } {
  if (!Number.isFinite(n) || n <= 0) return { multiplier: 0.6, reason: 'Sample size not reported — the result cannot be weighed.' };
  if (n < 10) return { multiplier: 0.7, reason: `n = ${n} per group: very small, unstable effect estimate.` };
  if (n < 30) return { multiplier: 0.85, reason: `n = ${n} per group: small, wide confidence interval expected.` };
  if (n < 100) return { multiplier: 1.0, reason: `n = ${n} per group: adequate for a moderate effect.` };
  return { multiplier: 1.05, reason: `n = ${n} per group: large enough to detect a modest effect.` };
}

/**
 * Grade one record. Deterministic and pure: same input → same output, so two
 * scientists reading the same study metadata get the same grade and can argue
 * about a named weight instead of about a feeling.
 */
export function gradeEvidence(record: EvidenceRecord): EvidenceGrade {
  const tier = TIERS[record.tier];
  const outcome = OUTCOMES[record.outcome];
  const breakdown: GradeContribution[] = [];
  const caveats: string[] = [];

  breakdown.push({ factor: 'Experimental system', multiplier: tier.weight, reason: `${tier.label} — ${tier.rationale}` });
  breakdown.push({ factor: 'Outcome measured', multiplier: outcome.weight, reason: `${outcome.label} — ${outcome.rationale}` });

  let strength = tier.weight * outcome.weight;

  const rep = record.replicated ? 1.35 : 0.75;
  breakdown.push({
    factor: 'Independent replication', multiplier: rep,
    reason: record.replicated
      ? 'Independently replicated by another group — the single strongest signal that a result is real.'
      : 'Not independently replicated. Most published effects shrink or vanish on replication.',
  });
  if (!record.replicated) caveats.push('Unreplicated — treat the effect size as provisional.');
  strength *= rep;

  // Randomisation and blinding only mean something where allocation exists.
  const allocationApplies = record.tier !== 'in-silico';
  if (allocationApplies) {
    const rand = record.randomised ? 1.15 : 0.85;
    breakdown.push({
      factor: 'Randomisation', multiplier: rand,
      reason: record.randomised ? 'Allocation randomised — limits selection bias.' : 'Not randomised — allocation bias is unaddressed.',
    });
    if (!record.randomised) caveats.push('Non-randomised allocation.');
    strength *= rand;

    const blind = record.blinded ? 1.15 : 0.85;
    breakdown.push({
      factor: 'Blinded assessment', multiplier: blind,
      reason: record.blinded
        ? 'Outcome assessed blind to allocation — limits measurement bias.'
        : 'Unblinded outcome assessment. Effects on subjective or scored endpoints inflate without blinding.',
    });
    if (!record.blinded) caveats.push('Unblinded outcome assessment.');
    strength *= blind;
  }

  const prereg = record.preregistered ? 1.1 : 0.95;
  breakdown.push({
    factor: 'Preregistration', multiplier: prereg,
    reason: record.preregistered
      ? 'Preregistered — the analysis was fixed before the data existed.'
      : 'Not preregistered — outcome switching and selective reporting cannot be excluded.',
  });
  strength *= prereg;

  const ss = sampleSizeFactor(record.sampleSize);
  breakdown.push({ factor: 'Sample size', multiplier: ss.multiplier, reason: ss.reason });
  strength *= ss.multiplier;

  const readout = record.readoutKind === 'direct' ? 1.1 : 0.8;
  breakdown.push({
    factor: 'Readout type', multiplier: readout,
    reason: record.readoutKind === 'direct'
      ? 'Primary readout measures the mechanism directly.'
      : 'Primary readout is a proxy — it can move for reasons unrelated to the mechanism.',
  });
  if (record.readoutKind === 'proxy') caveats.push('Rests on a proxy readout rather than a direct measurement.');
  strength *= readout;

  // A null result is a real finding and is graded normally; it is not "weak evidence".
  if (record.direction === 'null') {
    caveats.push('Null result — graded on the same rubric. Absence of a detected effect is informative only if the study could have detected one.');
  }

  const strengthScore = Math.max(0, Math.min(100, Math.round(strength * 100)));

  // Human relevance is capped by the system, then discounted for surrogate endpoints:
  // a surrogate in humans still leaves the clinical question open.
  const surrogateDiscount = record.outcome === 'biomarker' ? 0.6 : record.outcome === 'target-engagement' ? 0.4 : 1.0;
  const relevance = tier.humanProximity * surrogateDiscount * 100;
  const relevanceScore = Math.max(0, Math.min(100, Math.round(relevance)));

  if (tier.humanProximity < 0.4) {
    caveats.push(`Translation gap: ${tier.label} results have repeatedly failed to reproduce in humans.`);
  }

  return {
    recordId: record.id,
    strength: strengthScore,
    humanRelevance: relevanceScore,
    strengthBand: band(strengthScore),
    humanRelevanceBand: band(relevanceScore),
    breakdown,
    caveats,
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * A record without a citation is an opinion. The platform refuses it rather than
 * storing an unverifiable claim — this is the fail-closed rule applied to evidence.
 */
export function validateEvidence(input: Partial<EvidenceRecord>): ValidationResult {
  const errors: string[] = [];
  if (!input.citation || !input.citation.trim()) errors.push('A citation (DOI, PMID or full reference) is required — an uncited claim cannot be stored.');
  if (!input.interventionId) errors.push('The record must be attached to an intervention.');
  if (!input.hallmarkId) errors.push('The record must name the ageing mechanism it speaks to.');
  if (!input.tier || !(input.tier in TIERS)) errors.push('A valid experimental system (tier) is required.');
  if (!input.outcome || !(input.outcome in OUTCOMES)) errors.push('A valid outcome type is required.');
  if (!input.system || !input.system.trim()) errors.push('The species/system as reported is required.');
  if (input.sampleSize !== undefined && (!Number.isFinite(input.sampleSize) || input.sampleSize < 0)) {
    errors.push('Sample size must be a non-negative number.');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Records that disagree about direction for the same intervention+mechanism.
 * Surfaced rather than averaged away: a contradiction is information, and hiding
 * it behind a mean is how a literature stops being auditable.
 */
export interface EvidenceConflict {
  interventionId: string;
  hallmarkId: string;
  beneficial: EvidenceRecord[];
  harmful: EvidenceRecord[];
  nullResults: EvidenceRecord[];
}

export function findConflicts(records: EvidenceRecord[]): EvidenceConflict[] {
  const groups = new Map<string, EvidenceRecord[]>();
  for (const r of records) {
    const key = `${r.interventionId}::${r.hallmarkId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const conflicts: EvidenceConflict[] = [];
  for (const [key, group] of groups) {
    const beneficial = group.filter((r) => r.direction === 'beneficial');
    const harmful = group.filter((r) => r.direction === 'harmful');
    const nullResults = group.filter((r) => r.direction === 'null');
    // A conflict needs genuinely opposing claims, or a positive claim contradicted by a null.
    const opposed = (beneficial.length > 0 && harmful.length > 0)
      || (beneficial.length > 0 && nullResults.length > 0)
      || (harmful.length > 0 && nullResults.length > 0);
    if (!opposed) continue;
    const [interventionId, hallmarkId] = key.split('::');
    conflicts.push({ interventionId, hallmarkId, beneficial, harmful, nullResults });
  }
  return conflicts;
}
