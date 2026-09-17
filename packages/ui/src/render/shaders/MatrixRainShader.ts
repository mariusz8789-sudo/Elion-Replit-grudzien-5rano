/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';

export interface MatrixRainUniforms {
  uTime: { value: number };
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
}

export const MATRIX_RAIN_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const MATRIX_RAIN_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
float hash(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  float columns = 96.0;
  float column = floor(vUv.x * columns);
  float speed = 0.2 + hash(column + 11.0) * 0.8;
  float y = fract(vUv.y * 0.5 + uTime * speed * 0.12);
  float cell = floor(y * 48.0);
  float glyph = step(0.58, hash(column * 7.13 + cell * 3.71));
  float head = smoothstep(0.12, 0.0, fract(y * 48.0)) * glyph;
  float trail = pow(1.0 - fract(y), 2.0) * 0.35;
  float intensity = clamp(head + trail, 0.0, 1.0);
  gl_FragColor = vec4(uColor * intensity, intensity * uOpacity);
}`;

export function createMatrixRainMaterial(time = 0, color = 0x00ffc8): THREE.ShaderMaterial {
  const uniforms: MatrixRainUniforms = {
    uTime: { value: time },
    uColor: { value: new THREE.Color(color) },
    uOpacity: { value: 0.9 },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: MATRIX_RAIN_VERTEX_SHADER,
    fragmentShader: MATRIX_RAIN_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function updateMatrixRainMaterial(material: THREE.Material, t: number): void {
  const shader = material as THREE.ShaderMaterial;
  if (shader.uniforms?.uTime) shader.uniforms.uTime.value = t;
}
