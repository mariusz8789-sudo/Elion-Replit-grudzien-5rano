import type { DeterministicPort } from '../contracts';
import type { CaptureFrameRecord, CaptureManifest } from './cinematicTypes';
export function buildCaptureManifest(args:{readonly captureId:string;readonly fps:number;readonly width:number;readonly height:number;readonly frames:readonly CaptureFrameRecord[];readonly deterministic:DeterministicPort}):CaptureManifest{const core={captureId:args.captureId,fps:args.fps,width:args.width,height:args.height,frames:args.frames}; return {...core,fingerprint:args.deterministic.fingerprint(core)}}
