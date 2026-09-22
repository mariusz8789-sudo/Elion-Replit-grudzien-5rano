import type { ProvenanceRef, Vec3 } from '../contracts';
export type ScientificRoomKind = 'WET_LAB'|'IMAGING'|'SPECTROSCOPY'|'COMPUTE'|'BIOLOGY'|'MATERIALS'|'CLEANROOM'|'GENERAL';
export type AssetSlotKind = 'BENCH'|'INSTRUMENT'|'STORAGE'|'SINK'|'HOOD'|'DISPLAY'|'SAMPLE_STATION'|'DOOR'|'WINDOW';
export interface RoomBounds { readonly widthM:number; readonly depthM:number; readonly heightM:number }
export interface AssetSlot { readonly slotId:string; readonly kind:AssetSlotKind; readonly position:Vec3; readonly yawDegrees:number; readonly footprintM: readonly [number,number]; readonly requiredCapability?:string }
export interface ScientificInteriorSpec { readonly interiorId:string; readonly roomKind:ScientificRoomKind; readonly bounds:RoomBounds; readonly seed:string; readonly requestedCapabilities:readonly string[]; readonly provenance:readonly ProvenanceRef[] }
export interface InteriorAsset { readonly entityId:string; readonly assetKind:string; readonly slotId:string; readonly position:Vec3; readonly scale:Vec3; readonly yawDegrees:number; readonly capabilities:readonly string[]; readonly provenance:readonly ProvenanceRef[] }
export interface CompiledInterior { readonly interiorId:string; readonly roomKind:ScientificRoomKind; readonly slots:readonly AssetSlot[]; readonly assets:readonly InteriorAsset[]; readonly walkableAreaM2:number; readonly fingerprint:string }
