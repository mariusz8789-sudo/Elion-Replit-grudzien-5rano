import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runA2AdjudicationReferenceCase } from '../core/biotechData/a2AdjudicationReferenceImplementation';
import { runReAdjudication } from '../core/biotechData/a2Surpass2ReAdjudication';

/**
 * Reference implementation #1 of the Genesis Adjudication Protocol
 * (docs/DECISIONS.md D-047). These tests prove two separate things that are
 * easy to conflate:
 *   1. the protocol's phase machine actually ran (HARK guards, freeze,
 *      reproducibility) — covered by genesisAdjudicationProtocol.test.ts.
 *   2. THIS file's numbers agree with the already-verified computation in
 *      a2Surpass2ReAdjudication.ts, because it delegates to it rather than
 *      re-deriving anything — covered here.
 * And item F of the mandate: a claim that a module is "wired in" is checked
 * against the actual import graph, not asserted.
 */

describe('the reference case reuses the already-verified computation, not a re-derivation', () => {
  it('reAdjudicated result matches runReAdjudication() directly, field for field', () => {
    const direct = runReAdjudication();
    const viaProtocol = runA2AdjudicationReferenceCase();
    const protocolNew = viaProtocol.compared.readjudicated.reAdjudicated.result;

    expect(JSON.stringify(protocolNew.safety)).toBe(JSON.stringify(direct.reAdjudicated.safety));
    expect(JSON.stringify(protocolNew.falsification)).toBe(JSON.stringify(direct.reAdjudicated.falsification));
    expect(JSON.stringify(protocolNew.score)).toBe(JSON.stringify(direct.reAdjudicated.score));
    expect(protocolNew.overallVerdict).toBe(direct.reAdjudicated.overallVerdict);
  });

  it('historical result matches the unmodified runA2Analysis() candidate report', () => {
    const viaProtocol = runA2AdjudicationReferenceCase();
    const protocolOld = viaProtocol.compared.readjudicated.historical.result;
    const direct = runReAdjudication();
    expect(JSON.stringify(protocolOld.safety)).toBe(JSON.stringify(direct.historical.report.safety));
    expect(protocolOld.overallVerdict).toBe(direct.historical.overallVerdict);
  });
});

describe('the report honestly reflects what actually happened', () => {
  it('audit status is PASS and reproducibility is recorded', () => {
    const result = runA2AdjudicationReferenceCase();
    expect(result.report.auditStatus).toBe('PASS');
    expect(result.report.reproducibility.reproducible).toBe(true);
    expect(result.report.reproducibility.ruleFingerprint).toMatch(/^[0-9a-f]+$/);
    expect(result.report.reproducibility.inputFingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it('only evidencePolicy is recorded as a changed rule field', () => {
    const result = runA2AdjudicationReferenceCase();
    expect(result.compared.readjudicated.changedRuleFields).toEqual(['evidencePolicy']);
  });

  it('the diarrhea veto is recorded as removed and the structural serious-AE veto as remaining', () => {
    const result = runA2AdjudicationReferenceCase();
    expect(result.report.vetoesRemoved.some((v) => /Diarrhea/.test(v))).toBe(true);
    expect(result.report.vetoesRemaining.some((v) => /Serious adverse events/.test(v))).toBe(true);
  });

  it('evidence records carry a full identity, both classified as randomised comparisons', () => {
    const result = runA2AdjudicationReferenceCase();
    for (const e of result.report.evidenceUsed) {
      expect(e.hash).not.toBeNull();
      expect(e.custodyStatus).toBe('PINNED_VERIFIED');
      expect(['DIRECT_RANDOMISED', 'INDIRECT_RANDOMISED']).toContain(e.evidenceClass);
      expect(e.classificationMethod).toBe('evidenceProvenance.ts::classifyComparisonEvidenceClass');
    }
    expect(result.report.evidenceUsed.some((e) => e.evidenceClass === 'INDIRECT_RANDOMISED')).toBe(true);
    expect(result.report.evidenceUsed.some((e) => e.evidenceClass === 'DIRECT_RANDOMISED')).toBe(true);
  });
});

describe('item F — dead-module claim vs reality: this file genuinely imports what it claims to', () => {
  const SOURCE = readFileSync(fileURLToPath(new URL('../core/biotechData/a2AdjudicationReferenceImplementation.ts', import.meta.url)), 'utf8');

  it('imports the generic protocol module (not a parallel one)', () => {
    expect(SOURCE).toMatch(/from '\.\.\/agent\/genesisAdjudicationProtocol'/);
  });

  it('imports evidenceProvenance.ts for classification — the claim in section 3 of its own report is checked, not assumed', () => {
    expect(SOURCE).toMatch(/from '\.\.\/agent\/evidenceProvenance'/);
    expect(SOURCE).toMatch(/classifyComparisonEvidenceClass/);
  });

  it('does NOT import or redefine falsifyCandidate/scoreCandidate/decideA2Verdict — decision logic stays in one place', () => {
    expect(SOURCE).not.toMatch(/function falsifyCandidate/);
    expect(SOURCE).not.toMatch(/function scoreCandidate/);
    expect(SOURCE).not.toMatch(/function decideA2Verdict/);
  });

  it('delegates the gated computation to runReAdjudication rather than re-deriving it', () => {
    expect(SOURCE).toMatch(/from '\.\/a2Surpass2ReAdjudication'/);
    expect(SOURCE).toMatch(/runReAdjudication\(\)/);
  });
});
