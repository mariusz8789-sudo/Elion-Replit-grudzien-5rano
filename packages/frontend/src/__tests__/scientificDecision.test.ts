/**
 * scientificDecision (Stage 5) — the decision engine must (1) tag every statement,
 * (2) never present interpretation as verified fact, (3) never predict outcomes /
 * invent biology, (4) always demand experimental validation. These are honesty
 * invariants, not cosmetics — so they are asserted, not just smoke-tested.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDecisionReport, EVIDENCE_TAG_META, DECISION_CATEGORY_META } from '../core/scientificDecision';
import type { MoleculeProps } from '../core/moleculeInterpretation';
import { setLocale, t } from '../core/i18n';

// The decision engine now emits its text through the i18n seam; these honesty
// invariants are asserted against the Polish copy, so pin PL for this suite.
beforeAll(() => setLocale('pl'));

const ASPIRIN: MoleculeProps = { molWt: 180.159, logP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, lipinskiViolations: 0, lipinskiPass: true };
const HEAVY: MoleculeProps = { molWt: 620, logP: 6.2, tpsa: 160, hbd: 7, hba: 12, lipinskiViolations: 3, lipinskiPass: false };

describe('buildDecisionReport', () => {
  it('is deterministic — same input, same report', () => {
    expect(buildDecisionReport(ASPIRIN, ['Michael acceptor'])).toEqual(buildDecisionReport(ASPIRIN, ['Michael acceptor']));
  });

  it('tags EVERY statement with a known evidence tag (nothing untagged)', () => {
    const r = buildDecisionReport(ASPIRIN);
    expect(r.statements.length).toBeGreaterThan(0);
    for (const s of r.statements) {
      expect(['VERIFIED', 'GROUNDED', 'GENERAL']).toContain(s.tag);
      expect(['VERIFIED', 'PROMISING', 'UNKNOWN', 'VALIDATION', 'NEXT']).toContain(s.category);
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('never marks a grounded interpretation as a VERIFIED computation', () => {
    const r = buildDecisionReport(ASPIRIN);
    // PROMISING statements are interpretations — they must be GROUNDED, never VERIFIED.
    expect(r.statements.filter((s) => s.category === 'PROMISING').every((s) => s.tag === 'GROUNDED')).toBe(true);
    // VERIFIED-category statements are the only ones allowed the VERIFIED tag.
    expect(r.statements.filter((s) => s.tag === 'VERIFIED').every((s) => s.category === 'VERIFIED')).toBe(true);
  });

  it('classifies LogP as a model estimate, not a measurement', () => {
    const r = buildDecisionReport(ASPIRIN);
    const logp = r.statements.find((s) => /LogP/.test(s.text) && s.category === 'VERIFIED');
    expect(logp).toBeTruthy();
    expect(logp!.explain.limitations.join(' ')).toMatch(/±0\.5|oszacowanie/i);
  });

  it('always states that biological activity / outcomes are UNKNOWN and never predicts them', () => {
    const r = buildDecisionReport(ASPIRIN);
    expect(r.unknowns.some((u) => /[Aa]ktywność biologiczna/.test(u))).toBe(true);
    expect(r.statements.some((s) => s.category === 'UNKNOWN' && /nie przewiduje/.test(s.text))).toBe(true);
    // No statement may claim the molecule IS active / effective / safe.
    const forbidden = /\b(jest aktywn|będzie skuteczn|jest bezpieczn|udowodnion[oa] skuteczność)\b/i;
    expect(r.statements.every((s) => !forbidden.test(s.text))).toBe(true);
  });

  it('suggests only standard validation workflows, each demanding experimental validation', () => {
    const r = buildDecisionReport(ASPIRIN);
    expect(r.validation.length).toBeGreaterThan(0);
    for (const v of r.validation) {
      expect(v.note).toBe('Wymagana walidacja eksperymentalna.');
      // purpose describes what would be MEASURED, never a predicted result
      expect(v.purpose).not.toMatch(/będzie|wykaże|udowodni/i);
    }
  });

  it('surfaces structural alerts as risks/unknowns without asserting toxicity', () => {
    const r = buildDecisionReport(ASPIRIN, ['Michael acceptor']);
    expect(r.risks.some((x) => /Michael acceptor/.test(x))).toBe(true);
    const alertSt = r.statements.find((s) => /Michael acceptor/.test(s.text));
    expect(alertSt?.tag).toBe('GENERAL');
    expect(alertSt?.explain.limitations.join(' ')).toMatch(/nie stanowi predykcji toksyczności/i);
  });

  it('flags heavy/violating molecules as risks and adds an optimization next-step', () => {
    const r = buildDecisionReport(HEAVY);
    expect(r.risks.some((x) => /Ro5|biodostępności/.test(x))).toBe(true);
    expect(r.risks.some((x) => /LogP.*> 5/.test(x))).toBe(true);
    expect(r.statements.some((s) => s.category === 'NEXT' && /optymalizacj/i.test(s.text))).toBe(true);
  });

  it('reports transparency: which claims were removed and how confidence is classified', () => {
    const r = buildDecisionReport(ASPIRIN);
    expect(r.transparency.removedClaims.some((c) => /nie przewidujemy wyniku/i.test(c))).toBe(true);
    expect(r.transparency.verifiedDescriptors).toContain('logP');
    expect(r.transparency.groundingRules.length).toBeGreaterThan(0);
    expect(r.transparency.confidenceNote).toMatch(/✓.*⚠.*ⓘ/);
  });

  it('provides an explanation payload for every statement', () => {
    const r = buildDecisionReport(HEAVY, ['nitro group']);
    for (const s of r.statements) {
      expect(s.explain).toBeTruthy();
      expect(Array.isArray(s.explain.descriptors)).toBe(true);
      expect(typeof s.explain.origin).toBe('string');
    }
  });

  it('exposes complete category and tag metadata for the UI', () => {
    for (const c of ['VERIFIED', 'PROMISING', 'UNKNOWN', 'VALIDATION', 'NEXT'] as const) {
      expect(t(DECISION_CATEGORY_META[c].labelKey).length).toBeGreaterThan(0);
    }
    for (const tag of ['VERIFIED', 'GROUNDED', 'GENERAL'] as const) {
      expect(t(EVIDENCE_TAG_META[tag].labelKey).length).toBeGreaterThan(0);
    }
  });
});
