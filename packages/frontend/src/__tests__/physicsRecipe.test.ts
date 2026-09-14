import { describe, expect, it } from 'vitest';
import {
  buildPhysicsRecipe,
  replayPhysicsRecipe,
  exportPhysicsRecipe,
  importPhysicsRecipe,
  makePhysicsSyntheticTestWinnerRecordOnly,
  type PhysicsWinnerRecord,
} from '../core/physicsWorld/physicsRecipe';

/**
 * PHYSICS WORLD — vitest port of the source bundle's `recipeTests()`
 * (docs/DECISIONS.md D-052, mandate item 3). Negative-first: every gate is
 * exercised by flipping exactly the one field it checks.
 */

const mutate = (over: Partial<PhysicsWinnerRecord>): PhysicsWinnerRecord =>
  Object.freeze({ ...makePhysicsSyntheticTestWinnerRecordOnly(), ...over });

describe('buildPhysicsRecipe — gates G1-G9 (negative-first)', () => {
  it('NO_WINNER verdict ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ verdict: 'NO_WINNER' })).status).toBe('LOCKED');
  });
  it('CONFLICTING_EVIDENCE verdict ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ verdict: 'CONFLICTING_EVIDENCE' })).status).toBe('LOCKED');
  });
  it('INSUFFICIENT_EVIDENCE verdict ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ verdict: 'INSUFFICIENT_EVIDENCE' })).status).toBe('LOCKED');
  });
  it('constraintsSatisfied=false ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ constraintsSatisfied: false })).status).toBe('LOCKED');
  });
  it('survivedFalsification=false ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ survivedFalsification: false })).status).toBe('LOCKED');
  });
  it('comparisonValid=false ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ comparisonValid: false })).status).toBe('LOCKED');
  });
  it('provenanceComplete=false ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ provenanceComplete: false })).status).toBe('LOCKED');
  });
  it('evidenceMinimumSatisfied=false ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ evidenceMinimumSatisfied: false })).status).toBe('LOCKED');
  });
  it('fingerprintsUnchanged=false ⇒ LOCKED', () => {
    expect(buildPhysicsRecipe(mutate({ fingerprintsUnchanged: false })).status).toBe('LOCKED');
  });
  it('R11/G8: HARK detected ⇒ LOCKED, even with an otherwise-passing winner record', () => {
    expect(buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { harkDetected: true }).status).toBe('LOCKED');
  });
  it('R5/G9: a SYNTHETIC_TEST_ONLY winner in the default PRODUCTION mode is LOCKED — synthetic evidence never reaches production output', () => {
    const outcome = buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly());
    expect(outcome.status).toBe('LOCKED');
    expect(outcome.lockedReasons).toContain('G9_synthetic_in_production');
  });
});

describe('buildPhysicsRecipe — the one legitimate READY path (TEST mode, synthetic fixture)', () => {
  it('R5: a synthetic winner IS allowed in TEST mode, and the recipe honestly reports SYNTHETIC_TEST_ONLY confidence', () => {
    const outcome = buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { mode: 'TEST' });
    expect(outcome.status).toBe('READY');
    expect(outcome.recipe?.confidence).toBe('SYNTHETIC_TEST_ONLY');
  });

  it('R11: replayPhysicsRecipe rebuilds the recipe twice and requires byte-identical output — never a stubbed true', () => {
    expect(replayPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { mode: 'TEST' })).toBe(true);
  });

  it('R9 (adapted): recipeFingerprint is the real fnv1a hex output (8 chars), not a fabricated SHA-256 length', () => {
    const outcome = buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { mode: 'TEST' });
    expect(outcome.recipe?.recipeFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('recipe and WinnerRecord are both immutable (frozen; mutation throws under strict mode)', () => {
    const outcome = buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { mode: 'TEST' });
    const recipe = outcome.recipe!;
    expect(Object.isFrozen(recipe)).toBe(true);
    expect(() => {
      (recipe as unknown as { recipeVersion: number }).recipeVersion = 2;
    }).toThrow();

    const winner = makePhysicsSyntheticTestWinnerRecordOnly();
    expect(Object.isFrozen(winner)).toBe(true);
    expect(() => {
      (winner as unknown as { verdict: string }).verdict = 'NO_WINNER';
    }).toThrow();
  });

  it('export/import round-trip preserves the recipe fingerprint', () => {
    const outcome = buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { mode: 'TEST' });
    const round = importPhysicsRecipe(exportPhysicsRecipe(outcome.recipe!));
    expect(round.recipeFingerprint).toBe(outcome.recipe!.recipeFingerprint);
  });

  it('a tampered export fails fingerprint verification on import', () => {
    const outcome = buildPhysicsRecipe(makePhysicsSyntheticTestWinnerRecordOnly(), { mode: 'TEST' });
    const tampered = exportPhysicsRecipe(outcome.recipe!).replace('"recipeVersion":1', '"recipeVersion":2');
    expect(() => importPhysicsRecipe(tampered)).toThrow();
  });
});
