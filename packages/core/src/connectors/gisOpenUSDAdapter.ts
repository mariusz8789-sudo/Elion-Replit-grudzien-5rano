/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../expansionHash.js';
export interface GisFeature { readonly id: string; readonly kind: 'terrain' | 'node' | 'link'; readonly coordinates: readonly number[]; readonly attributes?: Readonly<Record<string, unknown>>; }
export interface OpenUsdPrim { readonly path: string; readonly typeName: string; readonly attributes?: Readonly<Record<string, unknown>>; }
export interface EcsSpatialEntity { readonly entityId: string; readonly kind: string; readonly position: readonly [number, number, number]; readonly attrs: Readonly<Record<string, unknown>>; readonly source: 'GIS' | 'OPENUSD'; readonly grounded: boolean; readonly fingerprint: string; }
export interface WorldGraphPatch { readonly addNodes: readonly EcsSpatialEntity[]; readonly patchFingerprint: string; }
const toPos = (c: readonly number[]): readonly [number, number, number] => [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0];
/** Deterministic GIS/OpenUSD → C3 ECS spatial entity adapter (no network, no geometry authoring). */
export class GisOpenUSDAdapter {
  ingestGis(features: readonly GisFeature[]): readonly EcsSpatialEntity[] {
    return features.map(f => ({ entityId: 'GIS-' + f.id, kind: f.kind, position: toPos(f.coordinates), attrs: f.attributes ?? {}, source: 'GIS', grounded: true, fingerprint: sha256hex(stableStringify({ src: 'GIS', f })) }));
  }
  ingestUsd(prims: readonly OpenUsdPrim[]): readonly EcsSpatialEntity[] {
    return prims.map(p => { const a = p.attributes ?? {}; const c = (a['xyz'] as readonly number[] | undefined) ?? [0, 0, 0];
      return { entityId: 'USD-' + p.path.replace(/[^a-zA-Z0-9]/g, '_'), kind: p.typeName, position: toPos(c), attrs: a, source: 'OPENUSD', grounded: typeof a['verified'] === 'boolean' ? (a['verified'] as boolean) : false, fingerprint: sha256hex(stableStringify({ src: 'OPENUSD', p })) }; });
  }
  ingestBoth(features: readonly GisFeature[], prims: readonly OpenUsdPrim[]): readonly EcsSpatialEntity[] { return [...this.ingestGis(features), ...this.ingestUsd(prims)]; }
  toWorldGraphPatch(entities: readonly EcsSpatialEntity[]): WorldGraphPatch { return { addNodes: entities, patchFingerprint: sha256hex(stableStringify(entities.map(e => e.fingerprint))) }; }
  validate(entities: readonly EcsSpatialEntity[]): readonly string[] {
    const errs: string[] = [];
    for (const e of entities) { if (!Number.isFinite(e.position[0]) || !Number.isFinite(e.position[1]) || !Number.isFinite(e.position[2])) errs.push('NON_FINITE_POSITION:' + e.entityId); if (!e.grounded) errs.push('UNGROUND_FLAG:' + e.entityId); }
    return errs;
  }
}
