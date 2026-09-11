import { describe, it, expect } from 'vitest';
import {
  ToyVulnerableApp,
  runSecurityTest, judgeVerdict, buildAttackPath,
  executeRelationTests, createRemediation, applyRemediation, retest,
  verifySecurityOutcome, runInvestigation, toCyberInvestigationResult,
  runAdaptiveInvestigation, toCyberInvestigationResultFromAdaptive,
} from '../core/agent/cyberReasoningKernel';
import { isWellFormedCyberInvestigation } from '../core/agent/cyberInvestigation';
import { buildSavedCyberInvestigation, saveCyberInvestigationToMemory, replaySavedCyberInvestigation } from '../core/scienceMemory';

/**
 * ACCEPTANCE SUITE for the Cyber Reasoning Kernel — a synthetic, deterministic
 * fixture (`ToyVulnerableApp`), no Genesis dependency. Traced by hand against
 * the actual implementation before being written (see commit message for the
 * full trace), not copied from an external prediction unverified.
 */

const hyp = (t: ReturnType<typeof runInvestigation>, id: string) => t.hypotheses.find((h) => h.hypothesisId === id)!;
const vOf = (t: ReturnType<typeof runInvestigation>, id: string) => t.verdicts.find((v) => v.hypothesisId === id)!;

describe('acceptance suite', () => {
  it('1 vulnerable target -> SUPPORTED_WITHIN_PROTOCOL', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    expect(vOf(t, 'hyp:AUTH_BYPASS::/admin').assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });

  it('2 safe target -> FALSIFIED_WITHIN_PROTOCOL', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    expect(vOf(t, 'hyp:AUTH_BYPASS::/profile').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('3 remediation -> observed behavior changes', () => {
    const app = new ToyVulnerableApp();
    const h = hyp(runInvestigation(app), 'hyp:AUTH_BYPASS::/admin');
    const before = runSecurityTest(h, app, 'before');
    applyRemediation(app, createRemediation(app, h)!);
    const after = retest(h, app, 'after');
    expect(after.observedResult.statusCode).not.toBe(before.observedResult.statusCode);
  });

  it('4 independent retest -> new testId', () => {
    const app = new ToyVulnerableApp();
    const h = hyp(runInvestigation(app), 'hyp:AUTH_BYPASS::/admin');
    const a = runSecurityTest(h, app, 'before');
    const b = retest(h, app, 'after');
    expect(b.testId).not.toBe(a.testId);
  });

  it('5 post-remediation verdict changes appropriately', () => {
    const app = new ToyVulnerableApp();
    const h = hyp(runInvestigation(app), 'hyp:AUTH_BYPASS::/admin');
    const before = judgeVerdict(h, runSecurityTest(h, app, 'before'));
    applyRemediation(app, createRemediation(app, h)!);
    const after = judgeVerdict(h, retest(h, app, 'after'));
    expect(before.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(after.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('6 attack edge without relation evidence -> INCONCLUSIVE by construction', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    const edges = buildAttackPath(t.hypotheses); // safe default, no relation tests run
    expect(edges.every((e) => e.status === 'INCONCLUSIVE' && e.derivedFromTestIds.length === 0)).toBe(true);
  });

  it('7 competing hypotheses work (co-surviving and discriminated)', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    expect(t.competing).toEqual([['hyp:AUTH_BYPASS::/admin', 'hyp:INFO_DISCLOSURE::/admin']]);
    expect(vOf(t, 'hyp:PRIVILEGE_ESCALATION::/profile').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('8 hidden ground-truth fields do not influence verdict', () => {
    const t = runInvestigation(new ToyVulnerableApp({ hiddenGroundTruthLies: true }));
    // hidden says /admin NOT vulnerable, observation says otherwise -> verdict follows observation
    expect(vOf(t, 'hyp:AUTH_BYPASS::/admin').assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    // hidden says /admin-backup-public vulnerable, observation says safe -> falsified
    expect(vOf(t, 'hyp:AUTH_BYPASS::/admin-backup-public').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('9 ambiguous observed result -> INCONCLUSIVE', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    expect(vOf(t, 'hyp:AUTH_BYPASS::/ambiguous').assessment).toBe('INCONCLUSIVE');
  });

  it('10 deterministic rerun -> same logical outcome', () => {
    const strip = (t: ReturnType<typeof runInvestigation>) => JSON.stringify([
      t.observations.map((o) => [o.observationId, o.statusCode, o.responseSummary]),
      t.assets.map((a) => a.assetId), t.hypotheses.map((h) => h.hypothesisId),
      t.verdicts.map((v) => [v.hypothesisId, v.assessment]), t.edges.map((e) => [e.fromAssetId, e.toAssetId, e.status]),
    ]);
    expect(strip(runInvestigation(new ToyVulnerableApp()))).toBe(strip(runInvestigation(new ToyVulnerableApp())));
  });
});

describe('adversarial cases', () => {
  it('B suggestive endpoint name, safe behavior -> FALSIFIED (not SUPPORTED)', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    expect(vOf(t, 'hyp:AUTH_BYPASS::/admin-backup-public').assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('D remediation applied but behavior unchanged -> outcome NOT verified, verdict unchanged', () => {
    const app = new ToyVulnerableApp({ brokenRemediation: true });
    const h = hyp(runInvestigation(app), 'hyp:AUTH_BYPASS::/admin');
    const before = runSecurityTest(h, app, 'before');
    applyRemediation(app, createRemediation(app, h)!);
    const after = retest(h, app, 'after');
    const outcome = verifySecurityOutcome(before, after);
    expect(outcome.verified).toBe(false);
    expect(judgeVerdict(h, after).assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });

  it('C two supported hypotheses, no relation evidence -> edge INCONCLUSIVE by construction (covered by test 6)', () => {
    const t = runInvestigation(new ToyVulnerableApp());
    expect(buildAttackPath(t.hypotheses).every((e) => e.status === 'INCONCLUSIVE')).toBe(true);
  });

  it('E relation-specific evidence: each edge has its OWN R1+R2 tests, status from the pair, never from the hypothesis verdict', () => {
    const app = new ToyVulnerableApp();
    const t = runInvestigation(app);
    const edges = executeRelationTests(app, t.hypotheses);
    expect(edges.every((e) => e.derivedFromTestIds.length === 2)).toBe(true);
    expect(edges.find((e) => e.fromAssetId === 'ENDPOINT::/admin')?.status).toBe('SUPPORTED_WITHIN_PROTOCOL');
    // The boundary correctly guards cross-owner reads on /profile — edge FALSIFIED,
    // even though the hypothesis's own single-arm test also came back FALSIFIED
    // (this does not prove the edge logic is independent by itself, but the
    // R1/R2 pair used to reach it is genuinely distinct code from judgeVerdict).
    expect(edges.find((e) => e.fromAssetId === 'AUTH_BOUNDARY::/profile')?.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('outcome verification positive case -> VERIFIED', () => {
    const app = new ToyVulnerableApp();
    const h = hyp(runInvestigation(app), 'hyp:AUTH_BYPASS::/admin');
    const before = runSecurityTest(h, app, 'before');
    applyRemediation(app, createRemediation(app, h)!);
    const after = retest(h, app, 'after');
    const outcome = verifySecurityOutcome(before, after);
    expect(outcome.verified).toBe(true);
  });

  it('invented remediation id rejected', () => {
    expect(() => new ToyVulnerableApp().applyRemediation('rem-1')).toThrow(/UNKNOWN_REMEDIATION_CONTROL/);
  });
});

describe('seam to Science Memory (SavedCyberInvestigation)', () => {
  function makeFakeStorage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    };
  }

  it('a real kernel run maps to a well-formed CyberInvestigationResult and saves to Science Memory', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const app = new ToyVulnerableApp();
    const trace = runInvestigation(app);
    const h = hyp({ hypotheses: trace.hypotheses, verdicts: trace.verdicts } as ReturnType<typeof runInvestigation>, 'hyp:AUTH_BYPASS::/admin');
    const before = trace.tests.find((t) => t.hypothesisId === h.hypothesisId)!;
    const remediation = createRemediation(app, h)!;
    applyRemediation(app, remediation);
    const retestResult = retest(h, app, 'after');
    const retestVerdict = judgeVerdict(h, retestResult);

    const result = toCyberInvestigationResult('inv-real-1', 'Investigate the toy app for vulnerabilities.', trace, { remediation, retestResult, retestVerdict });
    expect(isWellFormedCyberInvestigation(result)).toBe(true);

    const saved = buildSavedCyberInvestigation(result);
    const experiment = saveCyberInvestigationToMemory(saved);
    expect(experiment.cyberInvestigation).toBeDefined();
    expect(replaySavedCyberInvestigation(experiment).status).toBe('MATCH');

    // Sanity: the remediation genuinely changed behavior for this real run, not a fixture coincidence.
    expect(before.observedResult.statusCode).toBe(200);
    expect(retestResult.observedResult.statusCode).toBe(403);
  });

  it('a real ADAPTIVE run (the loop Chat/CyberWorkspace actually use) maps to a well-formed, savable CyberInvestigationResult that carries the loop\'s own live conflicts through to Memory', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const adaptive = runAdaptiveInvestigation(new ToyVulnerableApp());
    // The whole point of this bridge: a hypothesis genuinely remediated mid-run is SUPPORTED before
    // the fix and FALSIFIED on the independent post-fix retest — a real conflict, not a hand fixture.
    expect(adaptive.conflicts.length).toBeGreaterThan(0);

    const result = toCyberInvestigationResultFromAdaptive('inv-adaptive-1', 'Adaptive investigation of the toy app.', adaptive);
    expect(isWellFormedCyberInvestigation(result)).toBe(true);
    expect(result.conflicts).toEqual(adaptive.conflicts);
    expect(result.attackPath).toBeNull();

    const saved = buildSavedCyberInvestigation(result);
    const experiment = saveCyberInvestigationToMemory(saved);
    expect(experiment.cyberInvestigation?.result.conflicts).toEqual(adaptive.conflicts);
    expect(replaySavedCyberInvestigation(experiment).status).toBe('MATCH');
  });
});

describe('chat intent runs the real Cyber kernel inline (ETAP 1.5), through the one command layer', () => {
  it('recognises cyber-investigation phrasing in both languages and returns a runCyber action, not a second engine', async () => {
    const { resolveCommand } = await import('../core/scienceChat/resolveCommand');
    for (const phrase of ['dochodzenie bezpieczenstwa', 'test penetracyjny', 'podatnosc', 'auth bypass', 'attack surface', 'pentest']) {
      const out = resolveCommand(phrase, null);
      expect(out.action, phrase).toEqual({ type: 'runCyber' });
      expect(out.tag, phrase).toBe('MODEL');
    }
  });
});
