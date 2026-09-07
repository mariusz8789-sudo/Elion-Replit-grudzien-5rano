import { describe, expect, it } from 'vitest';
import { parseObservationIntent } from '../core/lookingGlass/observationIntent';
import { resolveCameraIntent, resolveTransitionKind } from '../core/lookingGlass/observationExecution';

describe('Looking Glass 2.1 — resolveCameraIntent: composed from EXISTING tables, not a new one', () => {
  it('a named perspective wins over the mode default', () => {
    const intent = parseObservationIntent('Show me the hospital as a scientist.');
    expect(intent.perspective).toBe('SCIENTIST_POV');
    expect(resolveCameraIntent(intent)).toBe('HUMAN_EYE'); // SCIENTIST_POV's own cameraIntent in perspective.ts
  });

  it('falls back to the mode default when no perspective is named', () => {
    const systemIntent = parseObservationIntent('Give me the system view.');
    expect(resolveCameraIntent(systemIntent)).toBe('WIDE');
  });

  it('SCIENTIST mode (the default) resolves through SCIENTIST_POV', () => {
    const intent = parseObservationIntent('Show me the hospital.');
    expect(intent.mode).toBeNull();
    expect(resolveCameraIntent(intent)).toBe('HUMAN_EYE'); // MODE_VIEWPOINT.SCIENTIST -> SCIENTIST_POV -> HUMAN_EYE
  });

  it('an explicit scale word overrides both perspective and mode', () => {
    const wide = parseObservationIntent('Show me the whole system from above.');
    expect(resolveCameraIntent(wide)).toBe('WIDE');
    const macro = parseObservationIntent('Zoom in on the substance.');
    expect(resolveCameraIntent(macro)).toBe('MACRO');
  });

  it('is deterministic: same sentence, same CameraIntent, every time', () => {
    const a = resolveCameraIntent(parseObservationIntent('Focus on the pump.'));
    const b = resolveCameraIntent(parseObservationIntent('Focus on the pump.'));
    expect(a).toBe(b);
  });
});

describe('Looking Glass 2.1 — resolveTransitionKind: deterministic, text-driven', () => {
  it('"focus on"/"zoom into" reads as a CUT', () => {
    expect(resolveTransitionKind(parseObservationIntent('Focus on the pump.'))).toBe('CUT');
    expect(resolveTransitionKind(parseObservationIntent('Zoom into the affected building.'))).toBe('CUT');
  });

  it('"show the whole city"/"from above" reads as CINEMATIC', () => {
    expect(resolveTransitionKind(parseObservationIntent('Show the city from above.'))).toBe('CINEMATIC');
  });

  it('an explicit WIDE scale reads as CINEMATIC even without the establishing words', () => {
    const intent = parseObservationIntent('Show me the whole system from above.');
    expect(intent.scale).toBe('WIDE');
    expect(resolveTransitionKind(intent)).toBe('CINEMATIC');
  });

  it('a bare "go to"/"take me to" is a plain SMOOTH reposition', () => {
    expect(resolveTransitionKind(parseObservationIntent('Go to the hospital.'))).toBe('SMOOTH');
    expect(resolveTransitionKind(parseObservationIntent('Take me to the laboratory.'))).toBe('SMOOTH');
  });
});
