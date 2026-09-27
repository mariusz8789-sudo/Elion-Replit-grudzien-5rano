import { describe, expect, it } from 'vitest';
import { getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { directSw4World, isSw4WorldPrompt } from '../core/worldDirector/sw4WorldDirectorAdapter';

describe('World Director SW-4 production binding', () => {
  it('routes only explicit SW-4/SEIR/epidemic prompts', () => {
    expect(isSw4WorldPrompt('Create an SW-4 epidemic city with real SEIR.')).toBe(true);
    expect(isSw4WorldPrompt('Zbuduj miasto epidemiologiczne SEIR.')).toBe(true);
    expect(isSw4WorldPrompt('Create a Mars research world.')).toBe(false);
  });

  it('runs, replays and projects the exact canonical SW-4 WorldGraph for the existing renderer', () => {
    const directed = directSw4World('Create an SW-4 epidemic city with real SEIR.');
    const frame = getFrameState(directed.engine);
    const graphicsFrame = toGraphicsWorldFrame(frame);
    const population = graphicsFrame.entities.find((entity) => entity.id === directed.renderState.populationId);

    expect(directed.replayStatus).toBe('MATCH');
    expect(directed.renderState.solverId).toBe('epidemic-seir-rk4');
    expect(directed.renderState.tick).toBe(30);
    expect(directed.renderState.infected).toBeGreaterThan(25);
    expect(directed.evidence.replay.verdict).toBe('MATCH');
    expect(directed.evidence.scientificContentFingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(directed.camera.roadEntityId).toBeTruthy();
    expect(population).toBeTruthy();
    expect(population?.grounding).toBe('MODELED');
    expect(directed.renderState.grounding).toBe('MODEL_ESTIMATE');
    expect(directed.renderState.disclosure).toContain('not a direct observation');
  });

  it('refuses an unrelated prompt instead of silently producing SW-4', () => {
    expect(() => directSw4World('Create a Mars research world.')).toThrow('SW4_WORLD_PROMPT_REQUIRED');
  });
});
