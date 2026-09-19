import type * as THREE_NS from 'three';

/**
 * VISUAL REALITY GATE — the flagship pack's scene-density check, in the kit
 * convention (no `three` import; the scene and renderer are passed in).
 * It measures what a "flagship laboratory shot" needs before anyone looks
 * at pixels: enough triangles, enough opaque set dressing, a transparent
 * hero layer. Thresholds are the pack's own; draw calls come from the
 * renderer's own counters, never estimated. Pixel-level acceptance stays
 * with the VisualFidelityHarness in packages/e2e (the Eyes).
 */

export interface VisualRealityResult {
  readonly pass: boolean;
  readonly polygonCount: number;
  readonly drawCalls: number;
  readonly opaqueMeshes: number;
  readonly transparentMeshes: number;
  readonly reasons: readonly string[];
}

export const FLAGSHIP_VISUAL_THRESHOLDS = { minPolygons: 200_000, minOpaqueMeshes: 35, minTransparentMeshes: 1 } as const;

export function evaluateVisualReality(scene: THREE_NS.Scene, renderer: THREE_NS.WebGLRenderer | null, thresholds = FLAGSHIP_VISUAL_THRESHOLDS): VisualRealityResult {
  let polygonCount = 0; let opaqueMeshes = 0; let transparentMeshes = 0;
  scene.traverse((obj) => {
    const mesh = obj as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (geometry) {
      const index = geometry.getIndex(); const position = geometry.getAttribute('position');
      const instances = (mesh as unknown as { isInstancedMesh?: boolean; count?: number }).isInstancedMesh ? ((mesh as unknown as { count: number }).count) : 1;
      polygonCount += (index ? index.count / 3 : position ? position.count / 3 : 0) * instances;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of materials) { if (m && m.transparent) transparentMeshes++; else opaqueMeshes++; }
  });
  const reasons: string[] = [];
  if (polygonCount < thresholds.minPolygons) reasons.push(`Scene density is likely too low for a flagship laboratory shot (${Math.round(polygonCount)} < ${thresholds.minPolygons} triangles).`);
  if (opaqueMeshes < thresholds.minOpaqueMeshes) reasons.push(`Insufficient set dressing / visible scene structure (${opaqueMeshes} opaque meshes).`);
  if (transparentMeshes < thresholds.minTransparentMeshes) reasons.push('No glass/transparent hero layer detected.');
  return { pass: reasons.length === 0, polygonCount: Math.round(polygonCount), drawCalls: renderer?.info.render.calls ?? 0, opaqueMeshes, transparentMeshes, reasons };
}
