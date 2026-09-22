import type { CanonicalVisualRuntimePort, DeterministicPort, EvidenceSink, VisualEntityState } from '../contracts';
import { emitStageEvidence } from '../evidence';
import { compileScientificInterior } from './interiorLayoutCompiler';
import { interactionsFor } from './interiorInteraction';
import { lightingFor } from './interiorLighting';
import type { CompiledInterior, ScientificInteriorSpec } from './interiorTypes';
export interface InteriorRuntimeResult { readonly compiled:CompiledInterior; readonly interactionCount:number; readonly lightingFingerprint:string }
export function instantiateScientificInterior(args:{readonly spec:ScientificInteriorSpec;readonly deterministic:DeterministicPort;readonly evidence:EvidenceSink;readonly visual:CanonicalVisualRuntimePort}):InteriorRuntimeResult{
 const compiled=compileScientificInterior(args.spec,args.deterministic); const lighting=lightingFor(args.spec.roomKind); let interactionCount=0;
 for(const asset of compiled.assets){const entity:VisualEntityState={entityId:asset.entityId,kind:`lab:${asset.assetKind}`,position:asset.position,scale:asset.scale,labels:{interiorId:compiled.interiorId,slotId:asset.slotId,capabilities:asset.capabilities.join(',')},scalarState:{yawDegrees:asset.yawDegrees},visible:true}; args.visual.upsertEntity(entity); interactionCount+=interactionsFor(asset).interactions.length;}
 const result={compiled,interactionCount,lightingFingerprint:args.deterministic.fingerprint(lighting)};
 emitStageEvidence({sink:args.evidence,deterministic:args.deterministic,type:'SCIENTIFIC_INTERIOR_INSTANTIATED',stage:'V6',modelId:'scientific-interior-v6',input:args.spec,result,epistemicStatus:'SIMULATION',evidenceClass:'DERIVED',provenance:args.spec.provenance});
 return result;
}
