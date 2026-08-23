import { describe, expect, it } from 'vitest';
import { runDiscoveryCase } from '../core/discovery/discoveryEngine';
import { executeDiscoveryCase, discoveryModelIdentity, DISCOVERY_LIMITATIONS } from '../core/discovery/discoveryExecution';
import { replayDiscoveryCase, replayDiscoveryCaseWithTolerance } from '../core/discovery/discoveryReplay';
import { deriveDiscoveryConclusion } from '../core/discovery/discoveryConclusion';
import { createDiscoveryEvidencePack, serializeDiscoveryEvidencePack } from '../core/discovery/discoveryEvidence';
import { evaluateGate, promoteCase, highestEarnedStatus, type DiscoveryCase, type DiscoveryCaseSpec } from '../core/discovery/discoveryCase';

const conditions = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };

const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
  hypothesis: {
    statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych względem braku interwencji.',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.' },
    assumptions: ['Wykrywalność objawowych jest natychmiastowa.'],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'ISOLATION',
  initialConditions: conditions,
  ...over,
});

describe('Discovery Engine — the full path runs on the real model', () => {
  it('takes a question through to a conclusion backed by evidence', () => {
    const c = runDiscoveryCase(spec());
    expect(c.status).toBe('SUPPORTED');
    expect(c.question).toBeTruthy();
    expect(c.arms).toHaveLength(2);
    expect(c.comparison!.status).toBe('COMPLETED');
    expect(c.replay!.status).toBe('MATCH');
    expect(c.conclusion!.verdict).toBe('SUPPORTED');
    expect(c.evidence!.missingFields).toEqual([]);
    expect(c.followUp).toBeDefined();
  });

  it('carries every field the Discovery Case schema requires', () => {
    const c = runDiscoveryCase(spec());
    for (const key of ['caseId', 'question', 'hypothesis', 'model', 'parameters', 'seed', 'initialConditions',
      'scenarios', 'inputFingerprint', 'runFingerprint', 'comparison', 'evidence', 'replay', 'limitations',
      'conclusion', 'followUp'] as const) {
      expect(c[key]).not.toBeUndefined();
    }
    expect(c.limitations.length).toBeGreaterThan(0);
  });

  it('reads model identity from the router registry instead of inventing a version', () => {
    const identity = discoveryModelIdentity();
    expect(identity.modelId).toBe('epidemic-city');
    expect(identity.modelVersion).toBe('1.0.0');
    expect(identity.engine).toBe('genesis-epidemic-city@1.0.0');
    expect(runDiscoveryCase(spec()).model).toEqual(identity);
  });

  it('results come from real runs — the arms carry actual day series', () => {
    const c = runDiscoveryCase(spec());
    for (const arm of c.arms) {
      expect(arm.run.status).toBe('COMPLETED');
      expect(arm.run.series).toHaveLength(conditions.days);
      expect(arm.run.resultFingerprint).toBeTruthy();
      expect(arm.summary).not.toBeNull();
    }
  });

  it('records real, distinguishable outcomes for the two arms', () => {
    const c = runDiscoveryCase(spec());
    const [baseline, variant] = c.arms;
    expect(baseline.summary!.peakInfectious).toBeGreaterThan(variant.summary!.peakInfectious);
    expect(baseline.run.resultFingerprint).not.toBe(variant.run.resultFingerprint);
  });
});

describe('Discovery Engine — determinism and fingerprint integrity', () => {
  it('the same spec produces an identical case, fingerprints included', () => {
    const a = runDiscoveryCase(spec());
    const b = runDiscoveryCase(spec());
    expect(b.caseId).toBe(a.caseId);
    expect(b.inputFingerprint).toBe(a.inputFingerprint);
    expect(b.runFingerprint).toBe(a.runFingerprint);
    expect(b.evidence!.evidencePackId).toBe(a.evidence!.evidencePackId);
  });

  it('a different seed is a different case and a different run', () => {
    const a = runDiscoveryCase(spec());
    const b = runDiscoveryCase(spec({ initialConditions: { ...conditions, seed: 778 } }));
    expect(b.caseId).not.toBe(a.caseId);
    expect(b.runFingerprint).not.toBe(a.runFingerprint);
  });

  it('changing only the hypothesis changes the case id but not the run fingerprint', () => {
    const a = runDiscoveryCase(spec());
    const b = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, statement: 'Inne sformułowanie tej samej hipotezy.' },
    }));
    expect(b.caseId).not.toBe(a.caseId);
    // Przebieg modelu nie zależy od tego, jak nazwaliśmy hipotezę.
    expect(b.runFingerprint).toBe(a.runFingerprint);
  });

  it('the evidence pack id changes when the verdict changes', () => {
    const supported = runDiscoveryCase(spec());
    const notSupported = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'peakInfectious', relation: 'greater-than', rationale: 'odwrotny kierunek' } },
    }));
    expect(notSupported.conclusion!.verdict).toBe('NOT_SUPPORTED');
    expect(notSupported.evidence!.evidencePackId).not.toBe(supported.evidence!.evidencePackId);
  });

  it('the serialized pack is stable across identical runs', () => {
    const a = serializeDiscoveryEvidencePack(runDiscoveryCase(spec()).evidence!);
    const b = serializeDiscoveryEvidencePack(runDiscoveryCase(spec()).evidence!);
    expect(b).toBe(a);
  });
});

describe('Discovery Engine — comparison blocking', () => {
  it('accepts a pair that differs by exactly one lever', () => {
    const c = runDiscoveryCase(spec());
    expect(c.comparison!.controlledDifference).toBe('isolate');
    expect(c.comparison!.observedDifferences).toEqual(['isolate']);
  });

  it('blocks a confounded pair that differs by two levers', () => {
    const c = runDiscoveryCase(spec({ baselineScenario: 'ISOLATION', variantScenario: 'CONTACT_REDUCTION' }));
    expect(c.comparison!.status).toBe('COMPARISON_BLOCKED');
    expect(c.comparison!.blockedReason).toBe('CONFOUNDED_MULTIPLE_DIFFERENCES');
    expect([...c.comparison!.observedDifferences].sort()).toEqual(['isolate', 'restrictions']);
    expect(c.comparison!.metrics).toEqual([]);
    expect(c.status).toBe('BLOCKED');
  });

  it('blocks a pair with no difference at all — a repeat is not an experiment', () => {
    const c = runDiscoveryCase(spec({ baselineScenario: 'BASELINE', variantScenario: 'BASELINE' }));
    expect(c.comparison!.blockedReason).toBe('NO_CONTROLLED_DIFFERENCE');
    expect(c.status).toBe('BLOCKED');
  });

  it('treats hospital capacity as the controlled difference when the epidemic levers match', () => {
    const c = runDiscoveryCase(spec({
      variantScenario: 'HEALTHCARE_EXPANSION',
      hypothesis: {
        ...spec().hypothesis,
        falsification: { metric: 'totalUnmetCareDays', relation: 'less-than', rationale: 'Więcej łóżek to mniej dni bez opieki.' },
      },
      baseParams: { severeRate: 0.5 },
      hospitalCapacity: { totalBeds: 1, icuBeds: 0, icuShareOfAdmissions: 0.22 },
    }));
    expect(c.comparison!.status).toBe('COMPLETED');
    expect(c.comparison!.controlledDifference).toBe('hospital-capacity');
    // Pakiet pojemności zmienia dwa parametry naraz i sprawa mówi to wprost.
    expect(c.comparison!.observedDifferences).toEqual(['hospital.icuBeds', 'hospital.totalBeds']);
    expect(c.comparison!.message).toContain('nie da się z tego porównania rozdzielić');
    expect(c.conclusion!.verdict).toBe('SUPPORTED');
    expect(c.limitations.join(' ')).toContain('nie rozstrzyga');
  });

  it('a blocked comparison can never reach a substantive verdict', () => {
    const c = runDiscoveryCase(spec({ baselineScenario: 'ISOLATION', variantScenario: 'CONTACT_REDUCTION' }));
    expect(c.conclusion!.verdict).toBe('INSUFFICIENT_EVIDENCE');
    expect(evaluateGate(c, 'SUPPORTED').allowed).toBe(false);
    expect(evaluateGate(c, 'EVIDENCE_VERIFIED').allowed).toBe(false);
  });
});

describe('Discovery Engine — replay and drift detection', () => {
  it('replay recomputes the model and matches', () => {
    const c = runDiscoveryCase(spec());
    const replay = replayDiscoveryCase(c);
    expect(replay.status).toBe('MATCH');
    expect(replay.arms).toHaveLength(2);
    for (const arm of replay.arms) expect(arm.actualRunFingerprint).toBe(arm.expectedRunFingerprint);
  });

  it('detects drift and names exactly what differs', () => {
    const c = runDiscoveryCase(spec());
    const tamperedArm = {
      ...c.arms[0],
      run: { ...c.arms[0].run, summary: { ...c.arms[0].run.summary!, peakInfectious: 999 }, resultFingerprint: 'deadbeef' },
    };
    const tampered: DiscoveryCase = { ...c, arms: [tamperedArm, c.arms[1]] };
    const replay = replayDiscoveryCase(tampered);
    expect(replay.status).toBe('DRIFT');
    const fields = replay.arms.flatMap((a) => a.differences.map((d) => d.field));
    expect(fields).toContain('summary.peakInfectious');
    const diff = replay.arms[0].differences.find((d) => d.field === 'summary.peakInfectious')!;
    expect(diff.expected).toBe(999);
    expect(diff.actual).toBe(c.arms[0].summary!.peakInfectious);
    expect(replay.message).toContain('summary.peakInfectious');
  });

  it('detects drift in the day series, not only in the summary', () => {
    const c = runDiscoveryCase(spec());
    const series = [...c.arms[0].run.series];
    series[10] = { ...series[10], infectious: series[10].infectious + 7 };
    const tampered: DiscoveryCase = {
      ...c,
      arms: [{ ...c.arms[0], run: { ...c.arms[0].run, series } }, c.arms[1]],
    };
    const replay = replayDiscoveryCase(tampered);
    expect(replay.status).toBe('DRIFT');
    expect(replay.arms[0].differences.map((d) => d.field)).toContain('firstDifferingDay');
  });

  it('reports WITHIN_TOLERANCE when the numbers reproduce but the fingerprint does not', () => {
    const c = runDiscoveryCase(spec());
    const tampered: DiscoveryCase = {
      ...c,
      arms: [{ ...c.arms[0], run: { ...c.arms[0].run, resultFingerprint: 'deadbeef' } }, c.arms[1]],
    };
    const replay = replayDiscoveryCase(tampered);
    expect(replay.status).toBe('WITHIN_TOLERANCE');
    expect(replay.arms[0].differences.map((d) => d.field)).toEqual(['resultFingerprint']);
  });

  it('a declared tolerance absorbs a small metric difference but not a large one', () => {
    const c = runDiscoveryCase(spec());
    const shift = (by: number): DiscoveryCase => ({
      ...c,
      arms: [{ ...c.arms[0], run: { ...c.arms[0].run, summary: { ...c.arms[0].run.summary!, totalDeaths: c.arms[0].summary!.totalDeaths + by }, resultFingerprint: 'x' } }, c.arms[1]],
    });
    expect(replayDiscoveryCaseWithTolerance(shift(1), 2).status).toBe('WITHIN_TOLERANCE');
    expect(replayDiscoveryCaseWithTolerance(shift(5), 2).status).toBe('DRIFT');
  });

  it('reports NOT_REPRODUCIBLE when the case carries no recorded run', () => {
    const c = runDiscoveryCase(spec());
    expect(replayDiscoveryCase({ ...c, arms: [] }).status).toBe('NOT_REPRODUCIBLE');
  });

  it('an unverified replay blocks the conclusion', () => {
    const c = runDiscoveryCase(spec());
    const drifted = replayDiscoveryCaseWithTolerance({
      ...c,
      arms: [{ ...c.arms[0], run: { ...c.arms[0].run, summary: { ...c.arms[0].run.summary!, totalDeaths: 99 } } }, c.arms[1]],
    }, 0);
    expect(drifted.status).toBe('DRIFT');
    expect(deriveDiscoveryConclusion(c, c.comparison, drifted).verdict).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('Discovery Engine — missing model capability', () => {
  it('refuses a scenario the model cannot express and says why', () => {
    const c = runDiscoveryCase(spec({ variantScenario: 'VACCINATION' }));
    expect(c.status).toBe('NOT_MODELED');
    expect(c.notModeledReason).toBeTruthy();
    expect(c.arms).toEqual([]);
    expect(c.runFingerprint).toBeNull();
  });

  it('a NOT_MODELED case is never replayed or concluded into a result', () => {
    const c = runDiscoveryCase(spec({ variantScenario: 'TRANSPORT_REDUCTION' }));
    expect(replayDiscoveryCase(c).status).toBe('BLOCKED');
    expect(deriveDiscoveryConclusion(c, null, null).verdict).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('the retired school-closure placeholder points at the real scenario that replaced it', () => {
    const c = runDiscoveryCase(spec({ variantScenario: 'SCHOOL_CLOSURE_ONLY' }));
    expect(c.status).toBe('NOT_MODELED');
    expect(c.notModeledReason).toContain('SCHOOL_CLOSURE');
    // Dźwignia już istnieje, więc realny scenariusz musi się wykonać.
    const real = runDiscoveryCase(spec({ variantScenario: 'SCHOOL_CLOSURE' }));
    expect(real.status).not.toBe('NOT_MODELED');
    expect(real.comparison!.controlledDifference).toBe('closeSchools');
  });
});

describe('Discovery Engine — conclusion is derived, not written', () => {
  it('reverses the verdict when the predeclared criterion points the other way', () => {
    const c = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'peakInfectious', relation: 'greater-than', rationale: 'odwrotny kierunek' } },
    }));
    expect(c.conclusion!.verdict).toBe('NOT_SUPPORTED');
    expect(c.status).toBe('EVIDENCE_VERIFIED');
  });

  it('returns PARTIALLY_SUPPORTED when a supporting criterion fails', () => {
    const c = runDiscoveryCase(spec({
      hypothesis: {
        ...spec().hypothesis,
        supportingCriteria: [{ metric: 'totalUnmetCareDays', relation: 'less-than', rationale: 'oczekiwano spadku, którego nie ma' }],
      },
    }));
    expect(c.conclusion!.primary!.met).toBe(true);
    expect(c.conclusion!.supporting[0].met).toBe(false);
    expect(c.conclusion!.verdict).toBe('PARTIALLY_SUPPORTED');
    expect(c.status).toBe('PARTIALLY_SUPPORTED');
  });

  it('refuses a series-only relation on a two-arm comparison', () => {
    const c = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'peakInfectious', relation: 'monotonic-decrease', rationale: 'wymaga sweepu' } },
    }));
    expect(c.conclusion!.primary!.met).toBe(false);
    expect(c.conclusion!.primary!.explanation).toContain('sweep');
  });

  it('refuses a criterion whose metric the model does not report', () => {
    const c = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'hospitalStaffBurnout', relation: 'less-than', rationale: 'metryka nie istnieje' } },
    }));
    expect(c.conclusion!.primary!.met).toBe(false);
    expect(c.conclusion!.primary!.baseline).toBeNull();
    expect(c.conclusion!.verdict).toBe('NOT_SUPPORTED');
  });

  it('an equality criterion without a tolerance is refused rather than guessed', () => {
    const c = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'totalDeaths', relation: 'equal-within-tolerance', expectedValue: 5, rationale: 'brak tolerancji' } },
    }));
    expect(c.conclusion!.primary!.explanation).toContain('tolerancji');
    expect(c.conclusion!.verdict).toBe('NOT_SUPPORTED');
  });

  it('the basis cites the model, the seed, the controlled difference and the replay verdict', () => {
    const basis = runDiscoveryCase(spec()).conclusion!.basis.join('\n');
    expect(basis).toContain('epidemic-city@1.0.0');
    expect(basis).toContain('ziarno: 777');
    expect(basis).toContain('kontrolowana różnica: isolate');
    expect(basis).toContain('odtworzenie: MATCH');
    expect(basis).toContain('peakInfectious');
  });

  it('every conclusion carries the model limitations plus the cohort provenance', () => {
    const limitations = runDiscoveryCase(spec()).conclusion!.limitations;
    for (const l of DISCOVERY_LIMITATIONS) expect(limitations).toContain(l);
    expect(DISCOVERY_LIMITATIONS.join(' ')).toContain('nie jest prognozą');
    // Domyślny profil jest neutralny i sprawa musi to powiedzieć wprost.
    expect(limitations.join(' ')).toContain('NEUTRALNY');
  });
});

describe('Discovery Engine — quality gates refuse unearned status', () => {
  it('a freshly executed case has no verdict to claim yet', () => {
    const executed = executeDiscoveryCase(spec());
    expect(evaluateGate(executed, 'REPLAY_VERIFIED').allowed).toBe(false);
    expect(evaluateGate(executed, 'EVIDENCE_VERIFIED').missing).toContain('complete evidence pack');
    expect(evaluateGate(executed, 'SUPPORTED').allowed).toBe(false);
    expect(highestEarnedStatus(executed)).toBe('COMPLETED');
  });

  it('promoteCase refuses and leaves the case untouched when evidence is missing', () => {
    const executed = executeDiscoveryCase(spec());
    const { case: unchanged, gate } = promoteCase(executed, 'SUPPORTED');
    expect(gate.allowed).toBe(false);
    expect(gate.missing.length).toBeGreaterThan(0);
    expect(unchanged.status).toBe(executed.status);
  });

  it('a case stripped of its evidence pack loses EVIDENCE_VERIFIED and everything above it', () => {
    const c = runDiscoveryCase(spec());
    const stripped: DiscoveryCase = { ...c, evidence: null };
    expect(evaluateGate(stripped, 'REPLAY_VERIFIED').allowed).toBe(true);
    expect(evaluateGate(stripped, 'EVIDENCE_VERIFIED').allowed).toBe(false);
    expect(evaluateGate(stripped, 'SUPPORTED').allowed).toBe(false);
    expect(highestEarnedStatus(stripped)).toBe('REPLAY_VERIFIED');
  });

  it('a SUPPORTED label cannot be attached to a NOT_SUPPORTED conclusion', () => {
    const c = runDiscoveryCase(spec({
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'peakInfectious', relation: 'greater-than', rationale: 'odwrotny kierunek' } },
    }));
    const gate = evaluateGate(c, 'SUPPORTED');
    expect(gate.allowed).toBe(false);
    expect(gate.missing.join(' ')).toContain('NOT_SUPPORTED');
  });

  it('BLOCKED and NOT_MODELED require a stated reason', () => {
    const c = runDiscoveryCase(spec());
    expect(evaluateGate(c, 'BLOCKED').missing).toContain('blockedReason');
    expect(evaluateGate(c, 'NOT_MODELED').missing).toContain('notModeledReason');
  });

  it('promotes when the evidence is genuinely there', () => {
    const c = runDiscoveryCase(spec());
    const { case: promoted, gate } = promoteCase({ ...c, status: 'DRAFT' }, 'SUPPORTED');
    expect(gate.allowed).toBe(true);
    expect(promoted.status).toBe('SUPPORTED');
  });
});

describe('Discovery Engine — evidence completeness', () => {
  it('a complete pack lists every element the brief requires', () => {
    const pack = runDiscoveryCase(spec()).evidence!;
    expect(pack.model.modelVersion).toBe('1.0.0');
    expect(Object.keys(pack.parameters).length).toBeGreaterThan(0);
    expect(pack.seed).toBe(777);
    expect(Object.keys(pack.inputFingerprints)).toContain('case');
    expect(Object.values(pack.runFingerprints).every((f) => typeof f === 'string')).toBe(true);
    expect(pack.comparison.status).toBe('COMPLETED');
    expect(pack.replay.status).toBe('MATCH');
    expect(pack.limitations.length).toBeGreaterThan(0);
    expect(pack.conclusion.verdict).toBe('SUPPORTED');
    expect(pack.missingFields).toEqual([]);
    expect(pack.disclaimer).toContain('nie jest odkryciem');
  });

  it('names what is missing instead of quietly passing', () => {
    const c = runDiscoveryCase(spec());
    const brokenReplay = { ...c.replay!, status: 'DRIFT' as const };
    const pack = createDiscoveryEvidencePack(c, c.comparison!, brokenReplay, c.conclusion!);
    expect(pack.missingFields.join(' ')).toContain('replay verification');
    expect(pack.missingFields.length).toBeGreaterThan(0);
  });

  it('a pack over a blocked comparison is explicitly incomplete', () => {
    const c = runDiscoveryCase(spec({ baselineScenario: 'ISOLATION', variantScenario: 'CONTACT_REDUCTION' }));
    const pack = createDiscoveryEvidencePack(c, c.comparison!, c.replay!, c.conclusion!);
    expect(pack.missingFields.join(' ')).toContain('comparison');
  });

  it('the pack records one input fingerprint per arm plus the case itself', () => {
    const pack = runDiscoveryCase(spec()).evidence!;
    expect(Object.keys(pack.inputFingerprints).sort()).toEqual(['baseline:BASELINE', 'case', 'variant:ISOLATION']);
  });
});
