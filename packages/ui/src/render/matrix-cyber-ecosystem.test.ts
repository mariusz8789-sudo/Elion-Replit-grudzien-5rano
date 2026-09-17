import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { createCyberEcosystem } from './GenesisCyberEcosystem.js';
import { MATRIX_RAIN_FRAGMENT_SHADER, createMatrixRainMaterial, updateMatrixRainMaterial } from './shaders/MatrixRainShader.js';

describe('matrix cyber ecosystem contracts', () => {
  it('creates deterministic instance counts', () => {
    const a = createCyberEcosystem({ seed: 7, agents: 4, traffic: 3 });
    const b = createCyberEcosystem({ seed: 7, agents: 4, traffic: 3 });
    expect(a.group.children.length).toBe(5);
    expect((a.group.children[1] as THREE.InstancedMesh).count).toBe((b.group.children[1] as THREE.InstancedMesh).count);
    a.dispose(); b.dispose();
  });
  it('updates only from supplied simulation time', () => {
    const ecosystem = createCyberEcosystem({ seed: 11 });
    ecosystem.update({ t: 4 });
    expect(ecosystem.group.children[1].rotation.y).toBeCloseTo(0.12);
    ecosystem.dispose();
  });
  it('binds Matrix time uniform without random or wall clock', () => {
    const material = createMatrixRainMaterial();
    updateMatrixRainMaterial(material, 12.5);
    expect(material.uniforms.uTime.value).toBe(12.5);
    expect(MATRIX_RAIN_FRAGMENT_SHADER).not.toContain('random');
    material.dispose();
  });
  it('contains proprietary headers', () => {
    const path = fileURLToPath(new URL('./GenesisCyberEcosystem.ts', import.meta.url));
    expect(readFileSync(path, 'utf8')).toContain('Proprietary / All Rights Reserved - Genesis OS');
  });
});
