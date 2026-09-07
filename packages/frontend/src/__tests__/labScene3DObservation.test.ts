import { describe, expect, it } from 'vitest';
import { LabScene3D } from '../core/three/labScene3D';
import type { ScenarioDaySample } from '../core/simulation/scenarioEngine';

/**
 * Looking Glass 2.1 — lab target resolution, CameraIntent dispatch onto the
 * EXISTING `focusScientific`/`returnToFirstPerson` flight mechanism, and the
 * new `showDay` read of an already-computed series. Bypasses `init()` (real
 * texture/DOM setup this test environment doesn't provide) and drives the
 * public API surface directly, same pattern as `epidemicCity3DObservation.
 * test.ts` and the pre-existing `highFidelitySlice3DOrbitDirection.test.ts`.
 */

function daySample(day: number, bedOccupancy: number): ScenarioDaySample {
  return {
    day,
    susceptible: 0, exposed: 0, infectious: 0, recovered: 0, deceased: 0, isolated: 0, hospitalized: 0,
    hospital: { status: 'NORMAL', occupiedBeds: 0, occupiedIcu: 0, unmetCare: 0, bedOccupancy, icuOccupancy: 0 },
  } as unknown as ScenarioDaySample;
}

describe('LabScene3D.resolveNamedLabTarget — the lab has exactly one real addressable object', () => {
  it('recognises the vessel under every real synonym used in this codebase', () => {
    const sim = new LabScene3D();
    expect(sim.resolveNamedLabTarget('the reaction vessel')).toBe(true);
    expect(sim.resolveNamedLabTarget('the substance')).toBe(true);
    expect(sim.resolveNamedLabTarget('the apparatus')).toBe(true);
    expect(sim.resolveNamedLabTarget('naczynie')).toBe(true);
  });

  it('honestly reports false for anything else — never a guessed camera move', () => {
    const sim = new LabScene3D();
    expect(sim.resolveNamedLabTarget('the pump')).toBe(false);
    expect(sim.resolveNamedLabTarget('the door')).toBe(false);
  });
});

describe('LabScene3D.applyObservationCameraIntent — dispatches onto the existing fixed shots', () => {
  it('WIDE/CINEMATIC read as the establishing HALA shot; every other intent as the vessel-facing NAUKOWA shot', () => {
    const sim = new LabScene3D();
    sim.applyObservationCameraIntent('WIDE');
    expect(sim.getStats().fixedKind).toBe(4); // WIDE -> 'HALA' per fixedKindCode
    const sim2 = new LabScene3D();
    sim2.applyObservationCameraIntent('SCIENTIST_POV');
    expect(sim2.getStats().fixedKind).toBe(1); // SCIENTIFIC
    const sim3 = new LabScene3D();
    sim3.applyObservationCameraIntent('MACRO');
    expect(sim3.getStats().fixedKind).toBe(1);
  });

  it('leaves the camera phase in FLIGHT immediately — a real transition, not an instant teleport', () => {
    const sim = new LabScene3D();
    sim.applyObservationCameraIntent('SCIENTIFIC');
    expect(sim.getStats().cameraPhase).toBe(1); // FLIGHT per phaseCode
  });
});

describe('LabScene3D.showDay — reads the existing per-day application, honestly', () => {
  it('returns false and applies nothing when no run has produced a series yet', () => {
    const sim = new LabScene3D();
    expect(sim.showDay(0)).toBe(false);
  });

  it('applies the real day sample from an already-computed series', () => {
    const sim = new LabScene3D();
    sim.playSeries([daySample(0, 0.1), daySample(1, 0.4), daySample(2, 0.9)], 'A');
    expect(sim.showDay(2)).toBe(true);
    expect(sim.getStats().vesselFraction).toBeCloseTo(0.9);
    expect(sim.getStats().dayIndex).toBe(2);
  });

  it('honestly returns false for an out-of-range day — never fabricates one', () => {
    const sim = new LabScene3D();
    sim.playSeries([daySample(0, 0.1)], 'A');
    expect(sim.showDay(5)).toBe(false);
  });
});
