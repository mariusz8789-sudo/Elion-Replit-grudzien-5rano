import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HOLOGRAPHIC_COMPANION_CLASS,
  HOLOGRAPHIC_COMPANION_EPISTEMIC,
  companionModeForAgentState,
  createHolographicResearchCompanion,
} from '../core/three/holographicResearchCompanion';

describe('holographic research companion', () => {
  it('projects the existing agent state into deterministic visual modes', () => {
    expect(companionModeForAgentState('IDLE', false)).toBe('IDLE');
    expect(companionModeForAgentState('IDLE', true)).toBe('LISTENING');
    expect(companionModeForAgentState('MOVING_TO_TARGET', false)).toBe('LISTENING');
    expect(companionModeForAgentState('OBSERVING', false)).toBe('SPEAKING');
    expect(companionModeForAgentState('REPORTING', true)).toBe('SPEAKING');
    expect(companionModeForAgentState('EXECUTING', false)).toBe('POINTING');
  });

  it('builds a visibly holographic, honestly-labelled figure outside the twin chamber', () => {
    const companion = createHolographicResearchCompanion(THREE);
    expect(companion.root.name).toBe('holographic-research-companion');
    expect(companion.root.userData).toMatchObject({
      classification: HOLOGRAPHIC_COMPANION_CLASS,
      epistemicStatus: HOLOGRAPHIC_COMPANION_EPISTEMIC,
      connectedChat: 'SCIENCE_CHAT',
      autonomousConsciousness: false,
    });
    expect(Math.hypot(companion.root.position.x, companion.root.position.z)).toBeGreaterThan(3);
    expect(companion.root.getObjectByName('holographic-scientist-rig')).toBeTruthy();
    expect(companion.root.getObjectByName('holographic-companion-projector')).toBeTruthy();
    expect(companion.root.getObjectByName('holographic-companion-data-points')).toBeTruthy();

    const materials: THREE.Material[] = [];
    companion.root.getObjectByName('holographic-scientist-rig')?.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      materials.push(...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    });
    expect(materials.length).toBeGreaterThan(8);
    expect(materials.every((material) => material.transparent && !material.depthWrite && material.blending === THREE.AdditiveBlending)).toBe(true);

    companion.update(1, 'IDLE');
    expect(companion.getDiagnostics()).toEqual({
      classification: 'VISUAL_AI_COMPANION',
      epistemicStatus: 'MODEL',
      mode: 'IDLE',
      connectedChat: 'SCIENCE_CHAT',
      autonomousConsciousness: false,
    });
    companion.engage(1, 2);
    companion.update(2, 'IDLE');
    expect(companion.getDiagnostics().mode).toBe('LISTENING');
    companion.update(4, 'REPORTING');
    expect(companion.getDiagnostics().mode).toBe('SPEAKING');
    companion.update(5, 'EXECUTING');
    expect(companion.getDiagnostics().mode).toBe('POINTING');
    companion.dispose();
  });
});
