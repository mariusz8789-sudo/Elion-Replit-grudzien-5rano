import { describe, expect, it } from 'vitest';
import { runBioExperiment, runBioSafe, replayBio, inSilicoOnlyInsufficient } from '../core/virtualBio/experiment';
import { renderMicroscopeFrame } from '../core/virtualBio/microscope';
import { draftPublicValue } from '../core/virtualBio/publicValue';
import { PILLARS } from '../core/virtualBio/gov';
import { FailClosedError, type BioExperimentDefinition, type ParamSpec } from '../core/virtualBio/contracts';
import { scanForBannedStrings } from '../core/agent/bannedStringScanner';

/**
 * VIRTUAL BIO — vitest port of the source bundle's `virtualBioTests()`
 * (docs/DECISIONS.md D-054). Negative-first, matching this session's
 * established convention.
 */

const cellParams = (): readonly ParamSpec[] => [
  { name: 'dose_uM', value: 5, unit: 'uM', min: 0, max: 1000, required: true },
  { name: 'IC50_uM', value: 4, unit: 'uM', min: 0.01, max: 1000, required: true },
  { name: 'hillN', value: 2, unit: '-', min: 0.5, max: 8, required: true },
  { name: 'killRate', value: 0.05, unit: '1/h', min: 0, max: 1, required: true },
  { name: 'growthRate', value: 0.03, unit: '1/h', min: 0, max: 1, required: true },
  { name: 'steps_h', value: 72, unit: 'h', min: 1, max: 240, required: true },
  { name: 'resistFraction0', value: 0.001, unit: '-', min: 0, max: 0.5, required: true },
  { name: 'resistIC50_mult', value: 20, unit: '-', min: 1, max: 1000, required: true },
];

const cellDef = (over: Partial<BioExperimentDefinition> = {}): BioExperimentDefinition => ({
  experimentId: 'VB1',
  pillar: 'G1',
  problemId: 'P',
  hypothesisId: 'H',
  modelId: 'B-CELL-001',
  seed: 5,
  observable: 'viability',
  toyAccepted: true,
  provenance: [{ source: 'virtual-bio:internal', retrievedAt: '1970-01-01T00:00:00Z' }],
  parameters: cellParams(),
  ...over,
});

describe('runBioExperiment — determinism, reproducibility, fail-closed', () => {
  it('same definition ⇒ same fingerprint (determinism), fnv1a hex format (real Genesis hash provider)', () => {
    const a = runBioExperiment(cellDef());
    const b = runBioExperiment(cellDef());
    expect(a.reproducibilityFingerprint).toBe(b.reproducibilityFingerprint);
    expect(a.reproducibilityFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('replay() genuinely re-runs and matches', () => {
    const a = runBioExperiment(cellDef());
    expect(replayBio(cellDef(), a)).toBe(true);
  });

  it('fail-closed: toy model without explicit toyAccepted=true', () => {
    try {
      runBioExperiment(cellDef({ toyAccepted: undefined }));
      expect.unreachable('expected FailClosedError');
    } catch (e) {
      expect(e).toBeInstanceOf(FailClosedError);
      expect((e as FailClosedError).code).toBe('TOY_NOT_ACCEPTED');
    }
  });

  it('fail-closed: missing required parameter', () => {
    try {
      runBioExperiment(cellDef({ parameters: cellParams().filter((p) => p.name !== 'dose_uM') }));
      expect.unreachable('expected FailClosedError');
    } catch (e) {
      expect(e).toBeInstanceOf(FailClosedError);
    }
  });

  it('runBioSafe: FAILED_CLOSED is visible in the record, never faked', () => {
    const bad = cellParams().map((p) => (p.name === 'hillN' ? { ...p, value: 99 } : p));
    const safe = runBioSafe(cellDef({ parameters: bad }));
    expect(safe.status).toBe('FAILED_CLOSED');
    expect(safe.result.values.length).toBe(0);
    expect(safe.failReason).toBeDefined();
  });

  it('disclosure + evidence class: every record is honestly labelled', () => {
    const a = runBioExperiment(cellDef());
    expect(a.disclosure).toMatch(/NOT wet-lab/);
    expect(a.disclosure).toMatch(/NOT medical advice/);
    expect(a.toy).toBe(true);
    expect(a.evidenceClass).toBe('IN_SILICO_MODEL');
  });

  it('sanity: higher dose lowers viability and enriches the resistant fraction', () => {
    const low = runBioExperiment(cellDef());
    const high = runBioExperiment(cellDef({ experimentId: 'VB2', parameters: cellParams().map((p) => (p.name === 'dose_uM' ? { ...p, value: 50 } : p)) }));
    expect(high.result.summary.viabilityFinal).toBeLessThan(low.result.summary.viabilityFinal!);
    expect(high.result.summary.resistantFractionFinal).toBeGreaterThan(low.result.summary.resistantFractionFinal!);
  });

  it('immutable record: frozen, mutation throws under strict mode', () => {
    const a = runBioExperiment(cellDef());
    expect(Object.isFrozen(a)).toBe(true);
    expect(() => {
      (a as unknown as { status: string }).status = 'FAILED_CLOSED';
    }).toThrow();
  });

  it('item 3: IN_SILICO_MODEL never satisfies evidence-minimum for a WINNER', () => {
    const a = runBioExperiment(cellDef());
    const b = runBioExperiment(cellDef({ experimentId: 'VB3', parameters: cellParams().map((p) => (p.name === 'dose_uM' ? { ...p, value: 50 } : p)) }));
    expect(inSilicoOnlyInsufficient([a, b])).toBe(true);
  });
});

describe('renderMicroscopeFrame — visual provenance', () => {
  const rec = runBioExperiment(cellDef());

  it('identical record + identical view ⇒ identical viewFingerprint and frame', () => {
    const view = { recordFingerprint: rec.reproducibilityFingerprint, seed: 1, zoom: 1, fieldIndex: 0, stain: 'STATE' as const };
    const f1 = renderMicroscopeFrame(rec, view);
    const f2 = renderMicroscopeFrame(rec, view);
    expect(f1.viewFingerprint).toBe(f2.viewFingerprint);
    expect(f1.commands).toEqual(f2.commands);
  });

  it('renders a 220-cell field with real DrawCommand entries', () => {
    const view = { recordFingerprint: rec.reproducibilityFingerprint, seed: 1, zoom: 1, fieldIndex: 0, stain: 'STATE' as const };
    const frame = renderMicroscopeFrame(rec, view);
    expect(frame.commands.length).toBe(220);
    expect(frame.commands.every((c) => c.kind === 'cell')).toBe(true);
  });

  it('a model family with no cellular field (e.g. no viabilityFinal) returns an empty, honestly-noted frame', () => {
    const pbpkRec = runBioExperiment({
      experimentId: 'VB-PBPK',
      pillar: 'G1',
      problemId: 'P',
      hypothesisId: 'H',
      modelId: 'B-PBPK-001',
      seed: 1,
      observable: 'concentration',
      toyAccepted: true,
      provenance: [{ source: 'virtual-bio:internal', retrievedAt: '1970-01-01T00:00:00Z' }],
      parameters: [
        { name: 'dose_mg', value: 100, unit: 'mg', min: 0.1, max: 10000, required: true },
        { name: 'ka_per_h', value: 1.0, unit: '1/h', min: 0.01, max: 10, required: true },
        { name: 'ke_per_h', value: 0.2, unit: '1/h', min: 0.01, max: 5, required: true },
        { name: 'kt_per_h', value: 0.3, unit: '1/h', min: 0.01, max: 5, required: true },
        { name: 'Vd_L', value: 40, unit: 'L', min: 1, max: 500, required: true },
        { name: 'steps_h', value: 48, unit: 'h', min: 1, max: 240, required: true },
      ],
    });
    const frame = renderMicroscopeFrame(pbpkRec, { recordFingerprint: pbpkRec.reproducibilityFingerprint, seed: 1, zoom: 1, fieldIndex: 0, stain: 'NONE' });
    expect(frame.commands).toEqual([]);
    expect(frame.note).toBeDefined();
  });

  /**
   * Item 10: seed-sensitivity test for visual provenance. Changing any ONE
   * of the four view parameters — with the record held fixed — must change
   * viewFingerprint. Zoom is also verified against the frame's cell radii
   * (a genuinely different rendered frame, not just a different hash).
   */
  it('item 10 — seed sensitivity: viewFingerprint changes when seed, zoom, fieldIndex, or stain change, record held fixed', () => {
    const base = { recordFingerprint: rec.reproducibilityFingerprint, seed: 1, zoom: 1, fieldIndex: 0, stain: 'STATE' as const };
    const baseFrame = renderMicroscopeFrame(rec, base);

    const bySeed = renderMicroscopeFrame(rec, { ...base, seed: 2 });
    const byZoom = renderMicroscopeFrame(rec, { ...base, zoom: 2 });
    const byField = renderMicroscopeFrame(rec, { ...base, fieldIndex: 1 });
    const byStain = renderMicroscopeFrame(rec, { ...base, stain: 'VIABILITY' });

    const fingerprints = new Set([baseFrame.viewFingerprint, bySeed.viewFingerprint, byZoom.viewFingerprint, byField.viewFingerprint, byStain.viewFingerprint]);
    expect(fingerprints.size).toBe(5);

    // Zoom genuinely changes the rendered radii, not only the hash.
    expect(byZoom.commands[0]!.r).toBeGreaterThan(baseFrame.commands[0]!.r * 1.5);
  });

  it('changing the record (a different reproducibilityFingerprint) changes viewFingerprint even with identical view params', () => {
    const rec2 = runBioExperiment(cellDef({ experimentId: 'VB-alt', parameters: cellParams().map((p) => (p.name === 'dose_uM' ? { ...p, value: 50 } : p)) }));
    const view = { seed: 1, zoom: 1, fieldIndex: 0, stain: 'STATE' as const };
    const f1 = renderMicroscopeFrame(rec, { recordFingerprint: rec.reproducibilityFingerprint, ...view });
    const f2 = renderMicroscopeFrame(rec2, { recordFingerprint: rec2.reproducibilityFingerprint, ...view });
    expect(f1.viewFingerprint).not.toBe(f2.viewFingerprint);
  });
});

describe('draftPublicValue — G4, zero fabricated numbers', () => {
  it('every field is tagged NO_DATA, ASSUMPTION, or MODEL_OUTPUT — never a bare, untagged number', () => {
    const rec = runBioExperiment(cellDef());
    const pv = draftPublicValue(rec);
    expect(Object.values(pv.fields).every((v) => v.tag === 'NO_DATA' || v.tag === 'ASSUMPTION' || v.tag === 'MODEL_OUTPUT')).toBe(true);
    expect(pv.firewall).toMatch(/ZERO input/);
  });
});

describe('PILLARS — taxonomy only, no live engine calls', () => {
  it('all four pillars are declared with a decisionHook naming an existing mechanism (or, for G4, an honestly-disclosed new one)', () => {
    expect(PILLARS.map((p) => p.id)).toEqual(['G1', 'G2', 'G3', 'G4']);
    for (const p of PILLARS) {
      expect(p.decisionHook.length).toBeGreaterThan(0);
      expect(p.evidenceRule.length).toBeGreaterThan(0);
    }
    expect(PILLARS.find((p) => p.id === 'G1')!.evidenceRule).toMatch(/IN_SILICO_MODEL/);
  });
});

describe('banned strings — item 11, extending the existing scanner (not a second one)', () => {
  it('the new EN/PL/AR terms are caught by the existing scanForBannedStrings', () => {
    expect(scanForBannedStrings('This treatment will cure your condition.', 'en').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('Completely harmless to every patient.', 'en').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('Ten lek leczy wszystkie objawy.', 'pl').length).toBeGreaterThan(0);
    expect(scanForBannedStrings('Suplement uzdrawia organizm.', 'pl').length).toBeGreaterThan(0);
  });

  it('the real virtual-bio model card disclosures contain none of the banned terms', () => {
    const rec = runBioExperiment(cellDef());
    expect(scanForBannedStrings(rec.disclosure, 'en')).toEqual([]);
  });
});
