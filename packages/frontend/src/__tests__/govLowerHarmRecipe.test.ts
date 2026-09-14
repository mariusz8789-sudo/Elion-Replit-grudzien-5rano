import { describe, expect, it } from 'vitest';
import { buildLowerHarmRecipe } from '../core/biotechData/govLowerHarmRecipe';
import { SYNTHETIC_WINNER_REPORTS } from '../core/orchestrator/syntheticWinnerFixture';

/**
 * D-073 RECIPE EXTENSION — negative-first. `buildLowerHarmRecipe`'s D-062
 * optional fields (already declared on `LowerHarmResearchRecipe`, never
 * populated for this candidate shape) start actually being filled with
 * real caller-supplied provenance (docs/DECISIONS.md D-073). The base
 * fields and the base fingerprint's BACKWARD COMPATIBILITY is the
 * load-bearing invariant here: any existing caller that never passes the
 * new third argument must see byte-identical output to before this change.
 */

const WINNER = SYNTHETIC_WINNER_REPORTS[0]!; // SYNTH-A — 3 real-shaped efficacy entries, real mechanism targets
const NO_TARGET_WINNER = { ...WINNER, summary: { ...WINNER.summary, medianPotencyNMByTarget: { glp1r: null, gipr: null, gcgr: null } } };

describe('backward compatibility: no extension argument at all', () => {
  it('omitting the third argument produces the exact same recipe as calling with an explicit empty object', () => {
    const a = buildLowerHarmRecipe(WINNER, 'fp-1');
    const b = buildLowerHarmRecipe(WINNER, 'fp-1', {});
    expect(a).toEqual(b);
  });

  it('every D-062 extension field is undefined, not null or an empty placeholder, when no extension is supplied', () => {
    const r = buildLowerHarmRecipe(WINNER, 'fp-1')!;
    expect(r.problemFingerprint).toBeUndefined();
    expect(r.winnerRecordRef).toBeUndefined();
    expect(r.hypothesisId).toBeUndefined();
    expect(r.experimentRefs).toBeUndefined();
    expect(r.falsificationResults).toBeUndefined();
    expect(r.limitations).toBeUndefined();
    expect(r.reproducibilityInstructions).toBeUndefined();
  });

  it('a candidate with no usable mechanism target still returns null regardless of extension data', () => {
    expect(buildLowerHarmRecipe(NO_TARGET_WINNER, 'fp-1')).toBeNull();
    expect(buildLowerHarmRecipe(NO_TARGET_WINNER, 'fp-1', { winnerRecordRef: 'X' })).toBeNull();
  });
});

describe('extension fields, when supplied, are real values on the returned recipe', () => {
  it('every supplied field appears verbatim on the result', () => {
    const r = buildLowerHarmRecipe(WINNER, 'fp-1', {
      problemFingerprint: 'prob-fp',
      winnerRecordRef: 'SYNTH-A',
      hypothesisId: 'SYNTH-A-H4',
      experimentRefs: ['lower-harm-g2::SYNTH-A', 'lower-harm-g2::SYNTH-B'],
      falsificationResults: [{ probe: 'G2_SEPARATES_TOP2', outcome: 'HELD' }],
      limitations: ['single funnel pass'],
      reproducibilityInstructions: ['replay via replayGovLowerHarmDiscovery'],
    })!;
    expect(r.problemFingerprint).toBe('prob-fp');
    expect(r.winnerRecordRef).toBe('SYNTH-A');
    expect(r.hypothesisId).toBe('SYNTH-A-H4');
    expect(r.experimentRefs).toEqual(['lower-harm-g2::SYNTH-A', 'lower-harm-g2::SYNTH-B']);
    expect(r.falsificationResults).toEqual([{ probe: 'G2_SEPARATES_TOP2', outcome: 'HELD' }]);
    expect(r.limitations).toEqual(['single funnel pass']);
    expect(r.reproducibilityInstructions).toEqual(['replay via replayGovLowerHarmDiscovery']);
  });

  it('the base fields (mechanism, evidence, identifiers, provenance) are unaffected by extension data', () => {
    const plain = buildLowerHarmRecipe(WINNER, 'fp-1')!;
    const extended = buildLowerHarmRecipe(WINNER, 'fp-1', { winnerRecordRef: 'SYNTH-A' })!;
    expect(extended.mechanism).toBe(plain.mechanism);
    expect(extended.evidence).toEqual(plain.evidence);
    expect(extended.identifiers).toEqual(plain.identifiers);
    expect(extended.provenance).toBe(plain.provenance);
  });
});

describe('recipeFingerprint genuinely covers the extension fields — not decorative', () => {
  it('two calls differing ONLY in one extension field produce different fingerprints', () => {
    const a = buildLowerHarmRecipe(WINNER, 'fp-1', { winnerRecordRef: 'SYNTH-A' })!;
    const b = buildLowerHarmRecipe(WINNER, 'fp-1', { winnerRecordRef: 'SYNTH-B' })!;
    expect(a.recipeFingerprint).not.toBe(b.recipeFingerprint);
  });

  it('the fingerprint is deterministic: two identical calls produce the identical fingerprint', () => {
    const a = buildLowerHarmRecipe(WINNER, 'fp-1', { winnerRecordRef: 'SYNTH-A', experimentRefs: ['x', 'y'] });
    const b = buildLowerHarmRecipe(WINNER, 'fp-1', { winnerRecordRef: 'SYNTH-A', experimentRefs: ['x', 'y'] });
    expect(a?.recipeFingerprint).toBe(b?.recipeFingerprint);
  });

  it('a call with extension data never collides with the same call without it', () => {
    const plain = buildLowerHarmRecipe(WINNER, 'fp-1')!;
    const extended = buildLowerHarmRecipe(WINNER, 'fp-1', { limitations: ['x'] })!;
    expect(plain.recipeFingerprint).not.toBe(extended.recipeFingerprint);
  });
});
