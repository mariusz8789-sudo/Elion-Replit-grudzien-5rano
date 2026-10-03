import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { designScientificExperiment, executeScientificExperiment, parseScienceChatMessage } from '../core/experimentFabric';
import { comparableProtocolArms, compareProtocolArms, defaultProtocolArmPair } from '../core/experimentFabric/protocolArmComparison';
import { pilotAbDisclaimer, pilotAbSeed, pilotAbStatus, pilotAbText } from '../components/pilot/pilotAbText';

/**
 * Port of claude/ab-counterfactual 9b4ca0a4: the Pilot compares two arms of an
 * executed protocol through the EXISTING `compareCounterfactual`.
 */
function schwarzschildChain() {
  const design = designScientificExperiment({
    hypothesis: {
      statement: 'W granicach modelu Schwarzschilda promień horyzontu rośnie monotonicznie wraz z masą.',
      domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild', declaredAssumptions: [],
      falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Prerejestrowana relacja dla kolejnych mas.' },
    },
    baselineRequest: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
    sweep: { parameter: 'massSolar', values: [1, 2], label: 'Masa M☉' },
    repetitionsPerArm: 2,
  });
  return executeScientificExperiment(design);
}

describe('A/B over the protocol arms (Pilot)', () => {
  const chain = schwarzschildChain();

  it('offers only arms that were designed and executed', () => {
    const options = comparableProtocolArms(chain);
    expect(options.length).toBe(chain.arms.length);
    expect(options.every((o) => chain.arms.some((a) => a.armId === o.armId))).toBe(true);
  });

  it('defaults to a pair whose parameters differ, never a self-comparison', () => {
    const pair = defaultProtocolArmPair(chain)!;
    expect(pair.baselineArmId).not.toBe(pair.variantArmId);
    const a = chain.design.arms.find((arm) => arm.armId === pair.baselineArmId)!;
    const b = chain.design.arms.find((arm) => arm.armId === pair.variantArmId)!;
    expect(JSON.stringify(a.request.parameters)).not.toBe(JSON.stringify(b.request.parameters));
  });

  it('passes the stored arm requests to compareCounterfactual and checks fingerprints against the protocol', () => {
    const pair = defaultProtocolArmPair(chain)!;
    const result = compareProtocolArms(chain, pair.baselineArmId, pair.variantArmId)!;
    expect(result.comparison.status).toBe('COMPLETED');
    const changed = result.comparison.parameterDifferences.filter((d) => d.changed).map((d) => d.key);
    expect(changed).toContain('massSolar');
    const radius = result.comparison.metrics.find((m) => m.key === 'radiusKm')!;
    // r_s = 2GM/c² is linear in mass: the ratio of radii equals the ratio of masses.
    const massA = Number(result.comparison.parameterDifferences.find((d) => d.key === 'massSolar')!.baseline);
    const massB = Number(result.comparison.parameterDifferences.find((d) => d.key === 'massSolar')!.variant);
    expect(radius.variant / radius.baseline).toBeCloseTo(massB / massA, 9);
    expect(result.fingerprintsMatchProtocol).toBe(true);
  });

  it('refuses a self-comparison and unknown arms instead of inventing a delta', () => {
    const id = chain.arms[0]!.armId;
    expect(compareProtocolArms(chain, id, id)).toBeNull();
    expect(compareProtocolArms(chain, id, 'no-such-arm')).toBeNull();
  });

  it('has no pair below two arms', () => {
    expect(defaultProtocolArmPair({ ...chain, arms: chain.arms.slice(0, 1) })).toBeNull();
  });
});

describe('A/B panel text is plain PL/EN and keeps unknown codes visible', () => {
  it('names every comparison status and seed status in both languages', () => {
    for (const code of ['COMPLETED', 'BLOCKED_INVALID_REQUEST', 'BLOCKED_MODEL_MISMATCH', 'INCOMPLETE_RUN', 'NO_SHARED_NUMERIC_METRICS']) {
      expect(pilotAbStatus(code, 'pl')).not.toBe(code);
      expect(pilotAbStatus(code, 'en')).not.toBe(code);
    }
    for (const code of ['MATCHED', 'MISMATCHED', 'UNSPECIFIED', 'DETERMINISTIC_NO_SEED']) expect(pilotAbSeed(code, 'en')).not.toBe(code);
    expect(pilotAbStatus('SOMETHING_NEW', 'en')).toBe('SOMETHING_NEW');
  });

  it('shows the contract disclaimer verbatim in Polish and an English rendering otherwise', () => {
    expect(pilotAbDisclaimer('KONTRAKT', true, 'pl')).toBe('KONTRAKT');
    expect(pilotAbDisclaimer('KONTRAKT', true, 'en')).toBe(pilotAbText('disclaimer', 'en'));
    expect(pilotAbDisclaimer('KONTRAKT', false, 'en')).toBe(pilotAbText('disclaimerNotRun', 'en'));
  });

  it('the Pilot screen calls the real comparison and renders its result (wiring, not just an import)', () => {
    const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
    const pilot = readFileSync(join(SRC, 'components', 'ExperimentPilotScreen.tsx'), 'utf8');
    expect(pilot).toMatch(/compareProtocolArms\(\s*protocolEvidence\s*,/);
    expect(pilot).toMatch(/defaultProtocolArmPair\(\s*evidence\s*\)/);
    expect(pilot).toMatch(/data-testid="pilot-ab-panel"/);
    expect(pilot).toMatch(/abResult\.comparison\.metrics\.map/);
    // Customer UI shows capabilities, not raw engine names.
    expect(pilot).not.toMatch(/comparison\.model\?\.engine/);
  });
});
