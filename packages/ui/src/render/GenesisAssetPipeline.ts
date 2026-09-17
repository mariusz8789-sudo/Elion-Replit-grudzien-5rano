/* Proprietary / All Rights Reserved - Genesis OS */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface AssetResult { readonly ok: boolean; readonly scene?: THREE.Group; readonly error?: string; }
export interface AssetPipeline { load(url: string): Promise<AssetResult>; disposeCached(): void; }

export function createAssetPipeline(): AssetPipeline {
  const loader = new GLTFLoader();
  const cache = new Map<string, Promise<AssetResult>>();
  return {
    load(url) {
      if (!/^https?:\/\/|^\//.test(url)) return Promise.resolve({ ok: false, error: 'ASSET_URL_NOT_ALLOWED' });
      const existing = cache.get(url); if (existing) return existing;
      const request = loader.loadAsync(url).then((gltf) => ({ ok: true, scene: gltf.scene })).catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'LOAD_FAILED' }));
      cache.set(url, request); return request;
    },
    disposeCached() { cache.clear(); },
  };
}
