import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCyberEcosystem } from './GenesisCyberEcosystem.js';
import { MATRIX_RAIN_FRAGMENT_SHADER, createMatrixRainMaterial, updateMatrixRainMaterial } from './shaders/MatrixRainShader.js';

describe('matrix cyber ecosystem contracts', () => {
  const deps = {
    chrome: (options: { obsidian?: boolean } = {}) => new THREE.MeshStandardMaterial({ color: options.obsidian ? 0x0a0a0f : 0xb8c4cc, metalness: 0.9, roughness: 0.12 }),
    emissive: (color: number, intensity = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity }),
  };
  it('creates deterministic instance counts', () => {
    const a = createCyberEcosystem(deps, { seed: 7, bounds: 40, agents: 4, cars: 3 });
    const b = createCyberEcosystem(deps, { seed: 7, bounds: 40, agents: 4, cars: 3 });
    expect(a.counts.AGENT).toBe(4);
    expect(a.counts.CAR).toBe(b.counts.CAR);
    a.dispose(); b.dispose();
  });
  it('updates only from supplied simulation time', () => {
    const ecosystem = createCyberEcosystem(deps, { seed: 11, bounds: 40 });
    ecosystem.update(0.016, 4);
    expect(ecosystem.counts.CAT).toBe(6);
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
