import type { CameraState, Vec3 } from '../contracts';
export type ShotKind='ESTABLISHING'|'DOLLY'|'ORBIT'|'MACRO'|'POV'|'TRANSITION';
export interface CameraKeyframe { readonly timeS:number; readonly position:Vec3; readonly target:Vec3; readonly fovDegrees:number; readonly focusDistance:number; readonly apertureFStop:number; readonly exposureEv:number }
export interface CinematicShot { readonly shotId:string; readonly kind:ShotKind; readonly durationS:number; readonly fps:number; readonly keyframes:readonly CameraKeyframe[]; readonly cutBefore:boolean; readonly description:string }
export interface SampledCamera { readonly timeS:number; readonly frameIndex:number; readonly camera:CameraState; readonly temporalHistoryReset:boolean }
export interface CaptureFrameRecord { readonly shotId:string; readonly frameIndex:number; readonly timeS:number; readonly cameraFingerprint:string; readonly renderFingerprint:string; readonly temporalHistoryReset:boolean }
export interface CaptureManifest { readonly captureId:string; readonly fps:number; readonly width:number; readonly height:number; readonly frames:readonly CaptureFrameRecord[]; readonly fingerprint:string }
