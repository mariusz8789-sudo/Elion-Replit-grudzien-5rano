/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type PostQuality = 'cinematic' | 'balanced' | 'performance';
export interface PostPipelineOptions { readonly width: number; readonly height: number; readonly selects?: THREE.Mesh[]; }
export interface LensParams { readonly rs: number; readonly glass: number; readonly center?: readonly [number, number]; }
export interface PostPipelineHandle {
  readonly composer: EffectComposer;
  setQuality(q: PostQuality): void;
  setLens(p: LensParams): void;
  setLightScreen(v: readonly [number, number]): void;
  /** God-rays only where a lamp is actually in frame; on elsewhere they are just haze over the room. */
  setScatter(on: boolean): void;
  update(dt: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}
const QUAD_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
/** Volumetric light scattering (god-rays) toward projected tunnel lights. */
const SCATTER_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D tDiffuse; uniform vec2 uLightScreen; uniform float uDensity; uniform float uDecay; uniform float uExposure;
void main(){
  const float SAMPLES = 48.0;
  vec2 dir = (uLightScreen - vUv) / SAMPLES;
  vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
  // The cut-off decides what counts as a light source. At 0.55 every lit wall panel qualified, so the
  // pass smeared the whole frame into haze instead of drawing rays from the lamps.
  for (int i = 0; i < 48; i++) { uv += dir; vec3 s = texture2D(tDiffuse, clamp(uv,0.0,1.0)).rgb; float l = dot(s, vec3(0.2126,0.7152,0.0722)); acc += s * step(0.88, l) * w; w *= uDecay; }
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  gl_FragColor = vec4(base + acc * (uDensity * uExposure / SAMPLES), 1.0);
}`;
/** Screen-space gravitational lensing + armored-glass refraction with chromatic split (ties to EventHorizonShader). */
const LENS_FRAG = `precision highp float; varying vec2 vUv;
uniform sampler2D tDiffuse; uniform float uRs; uniform float uGlass; uniform float uTime; uniform vec2 uCenter;
void main(){
  vec2 p = vUv - uCenter; float r = length(p) + 1e-6;
  float defl = uRs / max(r, 0.03);
  vec2 bent = p * (1.0 - defl * 0.25) + vec2(-p.y, p.x) * defl * 0.06;
  vec2 glass = vec2(sin(vUv.y * 90.0 + uTime), cos(vUv.x * 70.0 - uTime * 0.7)) * uGlass * 0.0016;
  vec2 uv = uCenter + bent + glass;
  // The split must be proportional to how far the pass ACTUALLY bent the ray. It used to be a fraction of
  // the pixel's own radius, so with no horizon and no glass every edge in the room still came out
  // rainbow-fringed. Now rs = 0 and glass = 0 make this pass the identity, as they should.
  vec2 chr = glass * 1.6 + (bent - p);
  float cr = texture2D(tDiffuse, uv + chr).r;
  float cg = texture2D(tDiffuse, uv).g;
  float cb = texture2D(tDiffuse, uv - chr).b;
  gl_FragColor = vec4(cr, cg, cb, 1.0);
}`;
export function createCernPostPipeline(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostPipelineOptions): PostPipelineHandle {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const ssao = new SSAOPass(scene, camera, opts.width, opts.height);
  ssao.kernelRadius = 0.35; ssao.minDistance = 0.0008; ssao.maxDistance = 0.08;
  composer.addPass(ssao);
  let ssr: SSRPass | null = null;
  try { ssr = new SSRPass({ renderer, scene, camera, width: opts.width, height: opts.height, selects: opts.selects ?? [], groundReflector: null }); ssr.thickness = 0.018; ssr.maxDistance = 0.4; composer.addPass(ssr); } catch { ssr = null; }
  // Strength 1.15 over a 0.82 threshold bloomed everything the tone mapper had already brought under
  // 1.0 — the hall came out as white fog with the geometry lost inside it. Bloom belongs to what is
  // genuinely brighter than white: the lamps, the beam, the horizon.
  const bloom = new UnrealBloomPass(new THREE.Vector2(opts.width, opts.height), 0.38, 0.5, 1.0);
  composer.addPass(bloom);
  const scatter = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uLightScreen: { value: new THREE.Vector2(0.5, 0.62) }, uDensity: { value: 0.16 }, uDecay: { value: 0.965 }, uExposure: { value: 0.55 } }, vertexShader: QUAD_VERT, fragmentShader: SCATTER_FRAG });
  composer.addPass(scatter);
  const lens = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uRs: { value: 0 }, uGlass: { value: 0.6 }, uTime: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) } }, vertexShader: QUAD_VERT, fragmentShader: LENS_FRAG });
  composer.addPass(lens);
  composer.addPass(new OutputPass());
  let quality: PostQuality = 'cinematic';
  let scatterOn = false;
  const apply = (): void => { ssao.enabled = quality !== 'performance'; if (ssr) ssr.enabled = quality === 'cinematic'; scatter.enabled = scatterOn && quality !== 'performance'; bloom.enabled = true; };
  apply();
  return {
    composer,
    setQuality: (q) => { quality = q; apply(); },
    setScatter: (on) => { scatterOn = on; apply(); },
    setLens: (p) => { (lens.uniforms.uRs as { value: number }).value = p.rs; (lens.uniforms.uGlass as { value: number }).value = p.glass; if (p.center) (lens.uniforms.uCenter as { value: THREE.Vector2 }).value.set(p.center[0], p.center[1]); },
    setLightScreen: (v) => { (scatter.uniforms.uLightScreen as { value: THREE.Vector2 }).value.set(v[0], v[1]); },
    update: (dt) => { (lens.uniforms.uTime as { value: number }).value += dt; composer.render(dt); },
    resize: (w, h) => { composer.setSize(w, h); ssao.setSize(w, h); if (ssr) ssr.setSize(w, h); bloom.setSize(w, h); },
    dispose: () => { ssao.dispose(); if (ssr) ssr.dispose(); bloom.dispose(); scatter.dispose(); lens.dispose(); composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); },
  };
}
