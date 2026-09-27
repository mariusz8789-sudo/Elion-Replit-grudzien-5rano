import { describe, expect, it } from 'vitest';
import { parseTemporalSceneRequest } from '../core/lookingGlass/urbanTransformation/temporalSceneRequestParser';

describe('parseTemporalSceneRequest — deterministic grammar over the temporal cinematic examples', () => {
  it('"show me London in 1920" -> location=london, year=1920', () => {
    const { request, unresolved } = parseTemporalSceneRequest('show me London in 1920');
    expect(request.location).toEqual({ name: 'london' });
    expect(request.time).toEqual({ year: 1920 });
    expect(unresolved).not.toContain('location');
    expect(unresolved).not.toContain('time');
  });

  it('"generate a video of Warsaw in 1905" -> location=warsaw, year=1905', () => {
    const { request } = parseTemporalSceneRequest('generate a video of Warsaw in 1905');
    expect(request.location).toEqual({ name: 'warsaw' });
    expect(request.time).toEqual({ year: 1905 });
  });

  it('"make a video of Warsaw from 1900 to 2026" -> startYear/endYear, TRANSFORMATION', () => {
    const { request } = parseTemporalSceneRequest('make a video of Warsaw from 1900 to 2026');
    expect(request.time).toEqual({ startYear: 1900, endYear: 2026 });
    expect(request.scene.type).toBe('TRANSFORMATION');
  });

  it('"every 10 years" combined with a start year resolves an interval', () => {
    const { request } = parseTemporalSceneRequest('show me this place every 10 years from 1900 to 2026');
    expect(request.time).toEqual({ startYear: 1900, endYear: 2026, intervalYears: 10 });
  });

  it('three or more explicit years resolve as an explicit list, not a range', () => {
    const { request } = parseTemporalSceneRequest('show me the same street in 1900, 1950, 2000 and 2026');
    expect(request.time.years).toEqual([1900, 1950, 2000, 2026]);
  });

  it('"generate a 30 second walking video through New York in 1935" -> WALK, duration, year', () => {
    const { request } = parseTemporalSceneRequest('generate a 30 second walking video through New York in 1935');
    expect(request.location).toEqual({ name: 'new-york' });
    expect(request.time).toEqual({ year: 1935 });
    expect(request.scene.type).toBe('WALK');
    expect(request.scene.durationSeconds).toBe(30);
    expect(request.viewpoint).toBe('ANCHORED_HUMAN');
  });

  it('"show me the city center in 1912 during rain" -> weather=rain', () => {
    const { request } = parseTemporalSceneRequest('show me the city center in 1912 during rain');
    expect(request.time).toEqual({ year: 1912 });
    expect(request.atmosphere.weather).toBe('rain');
  });

  it('"show the transformation from 1900 to 2026" -> TRANSFORMATION explicit keyword', () => {
    const { request } = parseTemporalSceneRequest('show the transformation from 1900 to 2026');
    expect(request.scene.type).toBe('TRANSFORMATION');
    expect(request.time).toEqual({ startYear: 1900, endYear: 2026 });
  });

  it('an unrecognised location is honestly reported as unresolved, never guessed', () => {
    const { request, unresolved } = parseTemporalSceneRequest('show me Atlantis in 1920');
    expect(request.location).toBeNull();
    expect(unresolved).toContain('location');
  });

  it('is deterministic — the same text parses to the same request twice', () => {
    const a = parseTemporalSceneRequest('Warsaw 1900 to 2026');
    const b = parseTemporalSceneRequest('Warsaw 1900 to 2026');
    expect(a).toEqual(b);
  });

  it('a Polish acceptance-test phrasing resolves location and two explicit years', () => {
    const { request } = parseTemporalSceneRequest('Wygeneruj 5 sekund filmu pokazującego tę samą ulicę w Warszawie w 1900 i 2026.');
    expect(request.location).toEqual({ name: 'warsaw' });
    expect(request.time.years).toEqual([1900, 2026]);
    expect(request.scene.durationSeconds).toBe(5);
  });
});
