import { describe, it, expect } from 'vitest';
import {
  computeWorldStateFingerprint, quantizeForFingerprint,
  type WorldStateSnapshot,
} from '../core/matrixFoundation/worldStateFingerprint';
import { computeEventTraceFingerprint } from '../core/events/eventTraceFingerprint';
import { computeRuleSetFingerprint, type RuleSetDescriptor } from '../core/matrixFoundation/ruleSetFingerprint';
import { runHeadlessSteps, type HeadlessRunPlan } from '../core/matrixFoundation/headlessStepper';
import { computeReplayVerdict } from '../core/matrixFoundation/replayVerdict';
import { EventRegistry, provenanceFromModel } from '../core/events';
import type { GenesisEventInput } from '../core/events/genesisEvent';

/**
 * MATRIX FOUNDATION — the concrete gaps docs/MATRIX_WORLD_POC_READINESS_AUDIT.md
 * (verdict: NEEDS_FOUNDATION) named as MISSING: worldStateFingerprint,
 * eventTraceFingerprint, ruleSetFingerprint, plus the two supporting
 * primitives the recommendation section called for (a headless, non-wall-
 * clock stepper, and a generic replay-verdict decision). No Matrix World
 * implementation, no agents, no City3D/Earthquake/Epidemic Core change —
 * every symbol under test is a new, pure, domain-neutral module.
 */

describe('worldStateFingerprint — deterministic world state', () => {
  const snapshot = (over: Partial<WorldStateSnapshot> = {}): WorldStateSnapshot => ({
    tick: 5,
    entities: [
      { id: 1, kind: 'agent', x: 10.123456789, y: 20, state: 'S' },
      { id: 2, kind: 'agent', x: 30, y: 40, state: 'I' },
    ],
    ...over,
  });

  it('the same snapshot fingerprints identically across two independent calls', async () => {
    const a = await computeWorldStateFingerprint(snapshot());
    const b = await computeWorldStateFingerprint(snapshot());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('entity array order does not affect the fingerprint — identity depends on WHO is where, not iteration order', async () => {
    const forward = snapshot();
    const shuffled = snapshot({ entities: [...forward.entities].reverse() });
    expect(await computeWorldStateFingerprint(shuffled)).toBe(await computeWorldStateFingerprint(forward));
  });

  it('a real difference in one entity\'s state changes the fingerprint', async () => {
    const base = await computeWorldStateFingerprint(snapshot());
    const changed = await computeWorldStateFingerprint(
      snapshot({ entities: [{ id: 1, kind: 'agent', x: 10.123456789, y: 20, state: 'E' }, { id: 2, kind: 'agent', x: 30, y: 40, state: 'I' }] }),
    );
    expect(changed).not.toBe(base);
  });

  it('a different tick changes the fingerprint even with identical entities', async () => {
    const a = await computeWorldStateFingerprint(snapshot({ tick: 5 }));
    const b = await computeWorldStateFingerprint(snapshot({ tick: 6 }));
    expect(a).not.toBe(b);
  });

  it('cross-platform floating-point noise below the quantization threshold does not flip the fingerprint', async () => {
    const a = await computeWorldStateFingerprint(snapshot({ entities: [{ id: 1, kind: 'agent', x: 10.1234561, y: 20, state: 'S' }] }));
    const b = await computeWorldStateFingerprint(snapshot({ entities: [{ id: 1, kind: 'agent', x: 10.1234562, y: 20, state: 'S' }] }));
    expect(a).toBe(b);
  });

  it('quantizeForFingerprint rounds to the requested precision', () => {
    expect(quantizeForFingerprint(1.0000004, 6)).toBe(1.0);
    expect(quantizeForFingerprint(1.0000006, 6)).toBe(1.000001);
  });
});

describe('eventTraceFingerprint — event trace identity', () => {
  const input = (over: Partial<GenesisEventInput> = {}): GenesisEventInput => ({
    type: 'matrix.tick', timestamp: 1, affectedEntities: [{ kind: 'agent', id: 1 }], parameters: {},
    provenance: provenanceFromModel({ modelId: 'matrix-foundation-test', seed: 1 }), ...over,
  });

  it('the same ordered trace fingerprints identically', async () => {
    const registryA = new EventRegistry({ modelId: 'm' });
    const registryB = new EventRegistry({ modelId: 'm' });
    registryA.add(input());
    registryB.add(input());
    const a = await computeEventTraceFingerprint(registryA.all());
    const b = await computeEventTraceFingerprint(registryB.all());
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('order IS significant — reordering the same events changes the fingerprint', async () => {
    const registry = new EventRegistry({ modelId: 'm' });
    registry.add(input({ timestamp: 1 }));
    registry.add(input({ timestamp: 2 }));
    const forward = registry.all();
    const reversed = [...forward].reverse();
    expect(await computeEventTraceFingerprint(reversed)).not.toBe(await computeEventTraceFingerprint(forward));
  });

  it('a tampered field in one event changes the trace fingerprint', async () => {
    const registry = new EventRegistry({ modelId: 'm' });
    registry.add(input());
    const original = registry.all();
    const tampered = [{ ...original[0], severity: 0.9 }];
    expect(await computeEventTraceFingerprint(tampered)).not.toBe(await computeEventTraceFingerprint(original));
  });

  it('an empty trace fingerprints deterministically and does not throw', async () => {
    await expect(computeEventTraceFingerprint([])).resolves.toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ruleSetFingerprint — declared identity for a set of rules', () => {
  const ruleSet = (over: Partial<RuleSetDescriptor> = {}): RuleSetDescriptor => ({
    ruleSetId: 'matrix-poc-rules-v1',
    rules: [{ ruleId: 'rule.a', version: '1.0.0' }, { ruleId: 'rule.b', version: '1.0.0' }],
    ...over,
  });

  it('the same rule set fingerprints identically', async () => {
    expect(await computeRuleSetFingerprint(ruleSet())).toBe(await computeRuleSetFingerprint(ruleSet()));
  });

  it('declaration order does not matter', async () => {
    const forward = ruleSet();
    const reordered = ruleSet({ rules: [...forward.rules].reverse() });
    expect(await computeRuleSetFingerprint(reordered)).toBe(await computeRuleSetFingerprint(forward));
  });

  it('a version bump on one rule changes the fingerprint', async () => {
    const a = await computeRuleSetFingerprint(ruleSet());
    const b = await computeRuleSetFingerprint(ruleSet({ rules: [{ ruleId: 'rule.a', version: '1.0.1' }, { ruleId: 'rule.b', version: '1.0.0' }] }));
    expect(a).not.toBe(b);
  });

  it('a different ruleSetId changes the fingerprint even with identical rules', async () => {
    const a = await computeRuleSetFingerprint(ruleSet({ ruleSetId: 'v1' }));
    const b = await computeRuleSetFingerprint(ruleSet({ ruleSetId: 'v2' }));
    expect(a).not.toBe(b);
  });
});

describe('runHeadlessSteps — deterministic, non-wall-clock stepping', () => {
  it('calls stepFn exactly `steps` times, in order, with the fixed dt and a zero-based index', () => {
    const plan: HeadlessRunPlan = { steps: 5, dt: 0.25 };
    const calls: Array<{ dt: number; i: number }> = [];
    runHeadlessSteps(plan, (dt, i) => calls.push({ dt, i }));
    expect(calls).toEqual([
      { dt: 0.25, i: 0 }, { dt: 0.25, i: 1 }, { dt: 0.25, i: 2 }, { dt: 0.25, i: 3 }, { dt: 0.25, i: 4 },
    ]);
  });

  it('zero steps calls stepFn zero times', () => {
    let calls = 0;
    runHeadlessSteps({ steps: 0, dt: 0.1 }, () => { calls += 1; });
    expect(calls).toBe(0);
  });

  it('two independent runs of the same plan produce identical call sequences — no wall-clock dependency', () => {
    const plan: HeadlessRunPlan = { steps: 4, dt: 0.05 };
    const seqA: number[] = []; const seqB: number[] = [];
    runHeadlessSteps(plan, (_dt, i) => seqA.push(i));
    runHeadlessSteps(plan, (_dt, i) => seqB.push(i));
    expect(seqB).toEqual(seqA);
  });
});

describe('computeReplayVerdict — generic, never a false MATCH', () => {
  it('MATCH only when both fingerprints are present and equal', () => {
    expect(computeReplayVerdict({
      inputsAvailable: true, recordFound: true, recordedFingerprint: 'abc', recomputedFingerprint: 'abc',
    })).toBe('MATCH');
  });

  it('DRIFT when fingerprints genuinely differ', () => {
    expect(computeReplayVerdict({
      inputsAvailable: true, recordFound: true, recordedFingerprint: 'abc', recomputedFingerprint: 'def',
    })).toBe('DRIFT');
  });

  it('NOT_REPRODUCIBLE when the record itself was not found — never a fabricated MATCH', () => {
    expect(computeReplayVerdict({
      inputsAvailable: true, recordFound: false, recordedFingerprint: null, recomputedFingerprint: 'def',
    })).toBe('NOT_REPRODUCIBLE');
  });

  it('NOT_REPRODUCIBLE when required inputs are unavailable, even if a recorded fingerprint exists', () => {
    expect(computeReplayVerdict({
      inputsAvailable: false, recordFound: true, recordedFingerprint: 'abc', recomputedFingerprint: 'abc',
    })).toBe('NOT_REPRODUCIBLE');
  });

  it('BLOCKED takes precedence over everything else, including a matching fingerprint', () => {
    expect(computeReplayVerdict({
      inputsAvailable: true, recordFound: true, recordedFingerprint: 'abc', recomputedFingerprint: 'abc',
      blockedReason: 'capability fence rejected replay',
    })).toBe('BLOCKED');
  });
});

describe('Matrix Foundation modules import nothing from City3D, GIS, live data, or Scientific Core', () => {
  it('no forbidden substring appears in any matrixFoundation or eventTraceFingerprint source', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const coreDir = join(here, '..', 'core');
    const forbidden = ['city3d', 'cityagent', 'roadnetwork', 'epidemiccity', 'worldenginecontract', 'hospitalresource', 'scenarioengine', 'discoveryengine', 'resolvecontacts', '@react-three', 'leaflet', 'mapbox'];
    const files = [
      ...readdirSync(join(coreDir, 'matrixFoundation')).map((f) => join(coreDir, 'matrixFoundation', f)),
      join(coreDir, 'events', 'eventTraceFingerprint.ts'),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        for (const term of forbidden) expect(line.toLowerCase()).not.toContain(term);
      }
    }
  });
});
