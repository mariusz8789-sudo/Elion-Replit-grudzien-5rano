import { describe, expect, it } from 'vitest';
import { PUMP_PIPE_DEFAULTS } from '../core/engineeringGraph/pumpPipe';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import {
  buildGenesisScientificCity3,
  FLAGSHIP_RAINFALL_INTENSITY_MM_PER_HOUR,
  GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID,
  HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE,
  PUMP_TRIPPED_EVENT_TYPE,
  rainfallLoadedPumpFlowM3S,
} from '../core/worldModel/domains/genesisScientificCity3';
import {
  applyRainfallIntensity,
  RAINFALL_CATCHMENT_DEFAULTS,
  RAINFALL_INTENSITY_CODE,
  RAINFALL_INTENSITY_STATES,
  RAINFALL_RUNOFF_SOLVER_ID,
  rainfallIntensityCode,
  rainfallIntensityLabel,
  rationalMethodPeakRunoffM3S,
} from '../core/worldModel/domains/rainfallRunoff';
import { getEventHistoryFor } from '../core/worldModel/queries/worldQueries';
import { TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * PHASE 5 — ENVIRONMENT / RAINFALL RUNOFF.
 *
 * The claim under test is narrow and checkable: rainfall intensity now REACHES
 * the real hydraulics model through a real hydrological method, so the pump
 * trips because of the physics rather than because a script said ×4.
 */
const DT = 1;

function runCity(rainfallAtTick: number) {
  const city = buildGenesisScientificCity3({ rainfallAtTick });
  const engine = new TemporalEngine(city.graph);
  for (let i = 0; i < 8; i++) engine.advance(DT, city.updater);
  return { city, engine };
}

describe('The rational method itself, Q = C*i*A', () => {
  it('computes real SI runoff from mm/h, and the reference catchment matches its own arithmetic', () => {
    // 80 mm/h over 8000 m2 at C=0.85: 0.85 * (80/3.6e6 m/s) * 8000 m2.
    const expected = 0.85 * (80 / 3_600_000) * 8000;
    expect(rationalMethodPeakRunoffM3S(80, 8000, 0.85)).toBeCloseTo(expected, 12);
    expect(expected).toBeCloseTo(0.151111, 5);
  });

  it('is linear in intensity — the property that makes a counterfactual meaningful', () => {
    const full = rationalMethodPeakRunoffM3S(80, 8000, 0.85);
    const half = rationalMethodPeakRunoffM3S(40, 8000, 0.85);
    expect(half).toBeCloseTo(full / 2, 12);
  });

  it('degrades malformed input to zero runoff rather than poisoning hydraulics with NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      expect(rationalMethodPeakRunoffM3S(bad, 8000, 0.85)).toBe(0);
      expect(rationalMethodPeakRunoffM3S(80, bad, 0.85)).toBe(0);
      expect(rationalMethodPeakRunoffM3S(80, 8000, bad)).toBe(0);
    }
    // C is a fraction: more than all of the rain cannot run off.
    expect(rationalMethodPeakRunoffM3S(80, 8000, 5)).toBe(rationalMethodPeakRunoffM3S(80, 8000, 1));
  });

  it('Rule 3: intensity bands are numeric codes on the conventional meteorological thresholds', () => {
    expect(rainfallIntensityCode(0)).toBe(RAINFALL_INTENSITY_CODE.NONE);
    expect(rainfallIntensityCode(1)).toBe(RAINFALL_INTENSITY_CODE.LIGHT);
    expect(rainfallIntensityCode(5)).toBe(RAINFALL_INTENSITY_CODE.MODERATE);
    expect(rainfallIntensityCode(25)).toBe(RAINFALL_INTENSITY_CODE.HEAVY);
    expect(rainfallIntensityCode(80)).toBe(RAINFALL_INTENSITY_CODE.VIOLENT);
    for (const nonsense of [-1, 99, Number.NaN]) expect(RAINFALL_INTENSITY_STATES).toContain(rainfallIntensityLabel(nonsense));
  });
});

describe('The environment node is really solved, not an inert context marker', () => {
  it('the city binds it to the runoff solver at construction, so tick 0 already carries real state', () => {
    const city = buildGenesisScientificCity3({});
    const environment = city.graph.getEntity(GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID);
    expect(environment.domainBinding?.solverId).toBe(RAINFALL_RUNOFF_SOLVER_ID);
    expect(environment.domainState?.catchmentAreaM2).toBe(RAINFALL_CATCHMENT_DEFAULTS.catchmentAreaM2);
    expect(environment.grounding).toBe('MODEL_ESTIMATE');
    // Dry by default: a world with no storm has no runoff, and says so.
    expect(environment.domainState?.peakRunoffM3S).toBe(0);
    expect(environment.statusLabel).toBe('RAINFALL_NONE');
  });

  it('an intervention on intensity flows through the solver into a real runoff figure', () => {
    const city = buildGenesisScientificCity3({});
    const engine = new TemporalEngine(city.graph);
    engine.advance(DT, city.updater);

    applyRainfallIntensity(engine, GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID, 30);
    engine.advance(DT, city.updater);

    const environment = engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID);
    expect(environment.domainState?.rainfallIntensityMmPerHour).toBe(30);
    expect(environment.domainState?.peakRunoffM3S).toBeCloseTo(rationalMethodPeakRunoffM3S(30, 8000, 0.85), 12);
    expect(environment.domainState?.intensityCode).toBe(RAINFALL_INTENSITY_CODE.HEAVY);
  });

  it('a negative intensity is rejected, not clamped into a weaker storm', () => {
    const city = buildGenesisScientificCity3({});
    const engine = new TemporalEngine(city.graph);
    expect(() => applyRainfallIntensity(engine, GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID, -10)).toThrow(/non-negative/);
  });

  it('Rule 3 at the C2 boundary: the band reaches the frame as a NUMBER, prose only alongside it', () => {
    const city = buildGenesisScientificCity3({});
    const engine = new TemporalEngine(city.graph);
    applyRainfallIntensity(engine, GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID, 80);
    engine.advance(DT, city.updater);

    const frame = toGraphicsWorldFrame(getFrameState(engine));
    const environment = frame.entities.find((entity) => entity.id === GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID)!;
    expect(environment.scalars!.intensityCode).toBe(RAINFALL_INTENSITY_CODE.VIOLENT);
    expect(environment.scalars!.peakRunoffM3S).toBeGreaterThan(0);
    expect(RAINFALL_INTENSITY_STATES).toContain(environment.status as (typeof RAINFALL_INTENSITY_STATES)[number]);
  });
});

describe('Intensity now decides the cascade — the whole point of the phase', () => {
  it('the flagship 80 mm/h storm still trips the pump and interrupts hospital water', () => {
    const { city, engine } = runCity(2);
    const pumpEvents = getEventHistoryFor(engine, city.pumpPipeId);
    const hospitalEvents = getEventHistoryFor(engine, city.hospitalBuildingId);
    expect(pumpEvents.some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE)).toBe(true);
    expect(hospitalEvents.some((e) => e.type === HOSPITAL_SERVICE_INTERRUPTED_EVENT_TYPE)).toBe(true);
  });

  it('the loaded flow is the rational method applied to the flagship intensity, not a magic multiplier', () => {
    const loaded = rainfallLoadedPumpFlowM3S(FLAGSHIP_RAINFALL_INTENSITY_MM_PER_HOUR);
    expect(loaded).toBeCloseTo(PUMP_PIPE_DEFAULTS.volumetricFlow + rationalMethodPeakRunoffM3S(80, 8000, 0.85), 12);
    // It lands near the old fixed x4 — the reference cascade is preserved, which is why this
    // change is a re-derivation of the same scenario rather than a different one.
    expect(loaded / PUMP_PIPE_DEFAULTS.volumetricFlow).toBeCloseTo(4.02, 2);
  });

  it('a lighter storm produces a genuinely smaller load, monotonically', () => {
    const flows = [0, 5, 20, 80].map((i) => rainfallLoadedPumpFlowM3S(i));
    for (let i = 1; i < flows.length; i++) expect(flows[i]).toBeGreaterThan(flows[i - 1]);
    expect(flows[0]).toBe(PUMP_PIPE_DEFAULTS.volumetricFlow); // no rain, no added load at all
  });

  it('below the catchment\'s real overload crossing the pump does NOT trip — an emergent threshold, not a script', () => {
    // The 100 m head-loss trip threshold is crossed at ~18.3 mm/h for this catchment and this
    // pipe. 10 mm/h is real rain (the "heavy" band opens there) and must survive it; 25 mm/h
    // must not. Neither outcome is written anywhere — both fall out of Darcy-Weisbach.
    const engineAt = (intensity: number) => {
      const city = buildGenesisScientificCity3({});
      const engine = new TemporalEngine(city.graph);
      const pump = engine.graph.getEntity(city.pumpPipeId);
      engine.applyExternalPatch(city.pumpPipeId, {
        domainState: { ...pump.domainState, volumetricFlow: rainfallLoadedPumpFlowM3S(intensity) },
      });
      for (let i = 0; i < 6; i++) engine.advance(DT, city.updater);
      return getEventHistoryFor(engine, city.pumpPipeId).some((e) => e.type === PUMP_TRIPPED_EVENT_TYPE);
    };
    expect(engineAt(10)).toBe(false);
    expect(engineAt(25)).toBe(true);
  });
});

describe('Replay stays intact with a fifth solver in the world', () => {
  it('scrubTo reconstructs the environment node exactly, storm included', () => {
    const { city, engine } = runCity(2);
    const live = engine.graph.getEntity(GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID);
    const replayed = engine.scrubTo(engine.tick).getEntity(GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID);
    expect(replayed.domainState).toEqual(live.domainState);
    expect(engine.scrubTo(0).getEntity(GENESIS_SCIENTIFIC_CITY_ENVIRONMENT_ID).domainBinding?.solverId).toBe(RAINFALL_RUNOFF_SOLVER_ID);
    expect(city.couplings[0].grounding).toBe('MODEL_ESTIMATE'); // upgraded from PROCEDURAL_APPROXIMATION
  });
});
