import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Współdzielone fragmenty post-processingu — wydzielone z Einstein Lab
 * (pierwszy konsument) w momencie, gdy Universe Lab stał się DRUGIM
 * realnym konsumentem (nie hipotetycznym) tego samego efektu: kinowe
 * rozjaśnienie sceny 3D przy wejściu, jeden mnożnik nad całym
 * skomponowanym obrazem zamiast osobnej animacji opacity per-materiał.
 */

/** Standardowy fullscreen-quad vertex shader — identyczny wzorzec co three.js CopyShader/wszystkie ShaderPass. */
export const FULLSCREEN_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FADE_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform float uFade;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb * uFade, 1.0);
}`;

/** Tworzy skonfigurowany ShaderPass mnożący finalny obraz przez `uFade` (0..1) — kinowe rozjaśnienie wejścia. */
export function createFadePass(ShaderPassCtor: typeof ShaderPass, initialFade: number): InstanceType<typeof ShaderPass> {
  return new ShaderPassCtor({
    uniforms: { tDiffuse: { value: null }, uFade: { value: initialFade } },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: FADE_FRAGMENT,
  });
}
