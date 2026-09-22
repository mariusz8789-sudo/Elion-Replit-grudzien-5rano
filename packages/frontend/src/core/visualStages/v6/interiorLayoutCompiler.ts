import type { DeterministicPort, Vec3 } from '../contracts';
import { catalogFor } from './interiorCatalog';
import type { AssetSlot, CompiledInterior, InteriorAsset, ScientificInteriorSpec } from './interiorTypes';
function slotPosition(index:number,total:number,width:number,depth:number):Vec3{const left=index%2===0; const row=Math.floor(index/2); const rows=Math.max(1,Math.ceil(total/2)); const z=-depth/2+1.2+(row/Math.max(1,rows-1))*Math.max(0,depth-2.4); return [left?-width/2+1.1:width/2-1.1,0,z]}
export function compileScientificInterior(spec:ScientificInteriorSpec,d:DeterministicPort):CompiledInterior{
  if(spec.bounds.widthM<4||spec.bounds.depthM<4||spec.bounds.heightM<2.4) throw new Error('Scientific interior bounds are too small');
  const catalog=catalogFor(spec.roomKind);
  const selected=[...catalog];
  for(const capability of spec.requestedCapabilities){if(!selected.some(a=>a.capabilities.includes(capability))){const fallback=catalog.find(a=>a.capabilities.length>0); if(fallback) selected.push({...fallback,assetKind:`${fallback.assetKind}-${capability}` ,capabilities:[...fallback.capabilities,capability]});}}
  const slots:AssetSlot[]=selected.map((asset,i)=>{const capability=asset.capabilities[0]; const core={slotId:`${spec.interiorId}-slot-${i}`,kind:asset.assetKind.includes('bench')?'BENCH' as const:asset.assetKind.includes('sink')?'SINK' as const:asset.assetKind.includes('display')||asset.assetKind.includes('console')?'DISPLAY' as const:asset.assetKind.includes('sample')?'SAMPLE_STATION' as const:'INSTRUMENT' as const,position:slotPosition(i,selected.length,spec.bounds.widthM,spec.bounds.depthM),yawDegrees:i%2===0?90:-90,footprintM:asset.nominalFootprintM}; return capability===undefined?core:{...core,requiredCapability:capability};});
  const assets:InteriorAsset[]=selected.map((asset,i)=>{const slot=slots[i]; if(!slot) throw new Error('slot missing'); const jitter=(d.stableUnit(`${spec.seed}:${i}`)-0.5)*0.04; return {entityId:`${spec.interiorId}:${asset.assetKind}:${i}`,assetKind:asset.assetKind,slotId:slot.slotId,position:[slot.position[0]+jitter,slot.position[1],slot.position[2]-jitter],scale:[1,1,1],yawDegrees:slot.yawDegrees,capabilities:asset.capabilities,provenance:spec.provenance};});
  const occupied=selected.reduce((sum,a)=>sum+a.nominalFootprintM[0]*a.nominalFootprintM[1],0);
  const walkableAreaM2=Math.max(0,spec.bounds.widthM*spec.bounds.depthM-occupied);
  const data={interiorId:spec.interiorId,roomKind:spec.roomKind,slots,assets,walkableAreaM2};
  return {...data,fingerprint:d.fingerprint(data)};
}
