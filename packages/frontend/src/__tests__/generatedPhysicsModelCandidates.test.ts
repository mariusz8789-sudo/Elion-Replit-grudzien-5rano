import { describe, expect, it } from 'vitest';
import {
  computeComposition,
  generatePhysicsModelCandidates,
  replayGeneratedPhysicsModelCandidates,
  saveGeneratedPhysicsModelCandidatesToMemory,
} from '../core/discovery/physics/generatedPhysicsModelCandidates';
import { runRelativisticTimeDilationCase } from '../core/discovery/physics/relativisticTimeDilation';

describe('generatedPhysicsModelCandidates — real falsification by computation', () => {
  it('generates exactly 2 candidates, both reaching TESTED', () => {
    const result = generatePhysicsModelCandidates();
    expect(result.candidates).toHaveLength(2);
    for (const c of result.candidates) {
      expect(c.status).toBe('TESTED');
      expect(c.verdict).not.toBeNull();
    }
  });

  it('the LINEAR_DIFFERENCE candidate is genuinely SUPPORTED — it reproduces the established formula exactly', () => {
    const result = generatePhysicsModelCandidates();
    const linear = result.candidates.find((c) => c.hypothesisId.includes('linear_difference'))!;
    expect(linear.verdict).toBe('SUPPORTED');
  });

  it('the QUADRATURE_SUM candidate is genuinely FALSIFIED by computation, not by assertion', () => {
    const result = generatePhysicsModelCandidates();
    const quadrature = result.candidates.find((c) => c.hypothesisId.includes('quadrature_sum'))!;
    expect(quadrature.verdict).toBe('FALSIFIED');
    expect(quadrature.verdictReasoning).toMatch(/does NOT match/);
  });

  it('computeComposition actually differs between the two rules for real, non-degenerate GPS values', () => {
    const reference = runRelativisticTimeDilationCase();
    const linear = computeComposition('LINEAR_DIFFERENCE', reference.specialRelativisticFractionalDeficit, reference.gravitationalFractionalExcess);
    const quadrature = computeComposition('QUADRATURE_SUM', reference.specialRelativisticFractionalDeficit, reference.gravitationalFractionalExcess);
    expect(linear).toBeCloseTo(reference.netFractionalRate, 15);
    expect(Math.abs(linear - quadrature)).toBeGreaterThan(1e-12);
  });

  it('both candidates depend on the real declared model ids, never a free-text dependency', () => {
    const result = generatePhysicsModelCandidates();
    for (const c of result.candidates) {
      expect(c.dependencyIds).toEqual(['sr-time-dilation-weak-field', 'gr-time-dilation-weak-field']);
    }
  });

  it('every candidate carries noveltyStatus NOVELTY_NOT_ESTABLISHED', () => {
    const result = generatePhysicsModelCandidates();
    for (const c of result.candidates) {
      expect(c.noveltyStatus).toBe('NOVELTY_NOT_ESTABLISHED');
    }
  });

  it('is deterministic across runs', () => {
    const a = generatePhysicsModelCandidates();
    const b = generatePhysicsModelCandidates();
    expect(a.resultFingerprint).toBe(b.resultFingerprint);
  });
});

describe('generatedPhysicsModelCandidates — replay and memory', () => {
  it('replays MATCH against a freshly recomputed result', () => {
    const saved = generatePhysicsModelCandidates();
    expect(replayGeneratedPhysicsModelCandidates(saved).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved fingerprint is tampered with', () => {
    const saved = generatePhysicsModelCandidates();
    const tampered = { ...saved, resultFingerprint: `${saved.resultFingerprint}0` };
    expect(replayGeneratedPhysicsModelCandidates(tampered).status).toBe('DRIFT');
  });

  it('saves to memory with an honest SUPPORTED/FALSIFIED breakdown', () => {
    const result = generatePhysicsModelCandidates();
    const saved = saveGeneratedPhysicsModelCandidatesToMemory(result);
    expect(saved.epistemicStatus).toBe('GENERATED=2;SUPPORTED=1;FALSIFIED=1');
  });
});
