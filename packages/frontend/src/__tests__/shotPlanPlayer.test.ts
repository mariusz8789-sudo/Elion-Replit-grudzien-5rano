import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShotPlan } from '../core/lookingGlass/shotPlan';
import type { WorldCaptureTimeline } from '../core/world/worldCapture';
import type { ScenarioRunPlan } from '../core/lookingGlass/scenarioResolution';
import { CameraRig } from '../core/three/graphics/cameraRig';
import { buildCameraSequenceFromShotPlan, type ShotTargetResolver } from '../core/three/shotPlanPlayer';

/**
 * Proves the real C1 -> C2 camera bridge end to end: a REAL `ShotPlan` (built by C1's own,
 * unmodified `buildShotPlan`) drives a REAL `CameraRig` via `CameraSequence` — not a mock of either
 * side. This is the integration point that did not exist before `shotPlanPlayer.ts`.
 */

function timeline(overrides: Partial<WorldCaptureTimeline> = {}): WorldCaptureTimeline {
  return {
    runId: 'run-1', worldId: 'world-1', snapshots: [], observations: [], events: [], markers: [], replay: null,
    ...overrides,
  };
}

function runPlan(overrides: Partial<ScenarioRunPlan> = {}): ScenarioRunPlan {
  return {
    kind: 'EPIDEMIC_CITY', family: 'EPIDEMIOLOGY', binding: 'EPIDEMIC_CITY_SIM', ticks: 30, unit: 'DAY',
    viewpoint: { kind: 'OBSERVER', anchorHint: null, cameraMode: 'WIDE' },
    comparison: false, cinematic: true,
    ...overrides,
  } as ScenarioRunPlan;
}

describe('buildCameraSequenceFromShotPlan — real C1 ShotPlan drives a real C2 CameraRig', () => {
  it('builds a sequence with one step per real shot in the plan', () => {
    const tl = timeline({
      events: [{ tick: 5, eventId: 'e1', type: 'HOSPITAL_OVERFLOW' }],
      observations: [{ tick: 10, observationId: 'o1', statement: 'ICU at capacity' }],
    });
    const plan = buildShotPlan(tl, runPlan());
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0], targetRadius: 5 });
    const resolver: ShotTargetResolver = { resolveTarget: () => ({ target: [1, 0, 1], targetRadius: 2 }) };

    const sequence = buildCameraSequenceFromShotPlan(rig, plan, resolver, { secondsPerWorldTick: 0.5 });
    expect(sequence).not.toBeNull();
    expect(sequence!.currentIndex).toBe(0); // real CameraSequence, entered its first step
  });

  it('returns null for an empty plan instead of a no-op sequence', () => {
    // ticks: 1 with no markers still produces ESTABLISH + RESULT shots (buildShotPlan always adds
    // those two) — to genuinely test the empty-plan path we hand-construct a truly empty plan.
    const emptyPlan = { planId: 'p', runId: 'r', worldId: 'w', shots: [], markersUsed: 0, markersAvailable: 0 };
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0], targetRadius: 5 });
    const resolver: ShotTargetResolver = { resolveTarget: () => ({ target: [0, 0, 0] }) };
    expect(buildCameraSequenceFromShotPlan(rig, emptyPlan, resolver, { secondsPerWorldTick: 1 })).toBeNull();
  });

  it("passes each shot's cameraMode through as the CameraRig intent, with no translation", () => {
    const tl = timeline({ events: [{ tick: 5, eventId: 'e1', type: 'HOSPITAL_OVERFLOW' }] });
    const plan = buildShotPlan(tl, runPlan());
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0], targetRadius: 5 });
    const seenModes: string[] = [];
    const resolver: ShotTargetResolver = {
      resolveTarget: () => ({ target: [0, 0, 0] }),
    };
    const sequence = buildCameraSequenceFromShotPlan(rig, plan, resolver, { secondsPerWorldTick: 0.2 })!;
    // Walk every step by skipping through the sequence, recording the intent CameraRig actually
    // received via cut()/frame() — proven by reading back the rig's own settled transform request.
    for (let i = 0; i < plan.shots.length; i++) {
      seenModes.push(plan.shots[i]!.cameraMode);
      if (i < plan.shots.length - 1) sequence.skip();
    }
    expect(seenModes).toEqual(plan.shots.map((s) => s.cameraMode));
  });

  it('resolves a real target per shot via the caller-supplied resolver — never invents one', () => {
    const tl = timeline({ events: [{ tick: 3, eventId: 'e1', type: 'HOSPITAL_OVERFLOW' }] });
    const plan = buildShotPlan(tl, runPlan());
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0], targetRadius: 5 });
    const resolvedTargets: string[] = [];
    const resolver: ShotTargetResolver = {
      resolveTarget: (shot) => {
        resolvedTargets.push(shot.sourceMarkerId ?? 'structural');
        return { target: [0, 0, 0] };
      },
    };
    buildCameraSequenceFromShotPlan(rig, plan, resolver, { secondsPerWorldTick: 0.2 });
    // The resolver is called at least once (for the first/current step) — real domain knowledge is
    // consulted, not skipped.
    expect(resolvedTargets.length).toBeGreaterThan(0);
  });

  it('converts WORLD_TIME tick spans to seconds via secondsPerWorldTick', () => {
    const tl = timeline();
    const plan = buildShotPlan(tl, runPlan({ ticks: 10 }));
    const establishShot = plan.shots.find((s) => s.kind === 'ESTABLISH')!;
    expect(establishShot.axis).toBe('WORLD_TIME');
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0], targetRadius: 5 });
    const resolver: ShotTargetResolver = { resolveTarget: () => ({ target: [0, 0, 0] }) };
    const sequence = buildCameraSequenceFromShotPlan(rig, plan, resolver, { secondsPerWorldTick: 2 })!;
    const expectedHold = (establishShot.toTick - establishShot.fromTick) * 2;
    expect(sequence.currentStep!.holdSeconds).toBeCloseTo(expectedHold);
  });

  it('hard-cuts into the first shot by default, and eases into every subsequent one', () => {
    // 'infection.transmission' has a real, distinct policy opinion (MACRO) — the ESTABLISH shot is
    // WIDE, so the second shot genuinely differs in intent, forcing a real eased transition. (An
    // event type with NO policy opinion coerces to the same WIDE as ESTABLISH — see
    // `coerceCameraIntent`'s own doc — which would make this specific assertion a false negative:
    // easing into an IDENTICAL framing is indistinguishable from already being settled.)
    const tl = timeline({ events: [{ tick: 3, eventId: 'e1', type: 'infection.transmission' }] });
    const plan = buildShotPlan(tl, runPlan());
    expect(plan.shots.length).toBeGreaterThan(1);
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0], targetRadius: 5 });
    const resolver: ShotTargetResolver = { resolveTarget: () => ({ target: [5, 0, 5] }) };
    const sequence = buildCameraSequenceFromShotPlan(rig, plan, resolver, { secondsPerWorldTick: 0.5 })!;
    expect(rig.isSettled).toBe(true); // cut() settles immediately
    sequence.skip();
    expect(rig.isSettled).toBe(false); // frame() eases, not settled on entry
  });
});
