import type { ConsistencyResult, ConsistencyViolation, HistoricalEntity } from './contracts';

/**
 * SCENE CONSISTENCY ENGINE — the real anachronism check the brief's own
 * examples name literally: a car in 1910, a smartphone-era artifact in 1970.
 * Because `entitiesForYear` in `historicalEraKnowledgeBase.ts` already
 * filters by validity before handing entities out, an anachronism can only
 * reach here if a caller resolved an entity for one year and is checking it
 * against a DIFFERENT year (e.g. reusing a frame's entity list against the
 * next frame's year during a transformation sequence) — which is exactly the
 * case a transformation/timelapse sequence has to guard.
 */
export function checkSceneConsistency(entities: readonly HistoricalEntity[], year: number): ConsistencyResult {
  const violations: ConsistencyViolation[] = [];
  for (const entity of entities) {
    const { validFrom, validTo } = entity.validity;
    if (year < validFrom || (validTo !== undefined && year > validTo)) {
      violations.push({
        kind: 'INVALID_TEMPORAL_ENTITY',
        entityId: entity.id,
        year,
        reason: `"${entity.label}" is valid ${validFrom}-${validTo ?? 'present'}, requested year ${year} falls outside that window`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Checks a whole resolved sequence at once — every (entities, year) pair the sequence produced. */
export function checkSequenceConsistency(frames: readonly { readonly entities: readonly HistoricalEntity[]; readonly year: number }[]): ConsistencyResult {
  const violations: ConsistencyViolation[] = [];
  for (const frame of frames) {
    violations.push(...checkSceneConsistency(frame.entities, frame.year).violations);
  }
  return { ok: violations.length === 0, violations };
}
