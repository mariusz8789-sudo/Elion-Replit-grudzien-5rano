import { distance } from '../vectorMath';
import type { CameraState } from '../contracts';
export interface DiscontinuityDecision { readonly resetHistory:boolean; readonly reasons:readonly string[] }
export function detectTemporalDiscontinuity(previous:CameraState|undefined,next:CameraState,explicitCut:boolean):DiscontinuityDecision{const reasons:string[]=[]; if(explicitCut) reasons.push('EXPLICIT_CUT'); if(previous){if(distance(previous.position,next.position)>4) reasons.push('CAMERA_POSITION_JUMP'); if(distance(previous.target,next.target)>6) reasons.push('CAMERA_TARGET_JUMP'); if(Math.abs(previous.fovDegrees-next.fovDegrees)>18) reasons.push('FOV_JUMP');} return {resetHistory:reasons.length>0,reasons};}
