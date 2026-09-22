import type { InteriorAsset } from './interiorTypes';
export type InteractionKind='INSPECT'|'USE'|'LOAD_SAMPLE'|'CAPTURE'|'MEASURE'|'OPEN_PANEL';
export interface InteractionTarget { readonly entityId:string; readonly interactions:readonly InteractionKind[] }
export function interactionsFor(asset:InteriorAsset):InteractionTarget{
 const set=new Set<InteractionKind>(['INSPECT']);
 if(asset.capabilities.includes('image-capture')){set.add('USE');set.add('CAPTURE');}
 if(asset.capabilities.includes('measurement')){set.add('USE');set.add('MEASURE');set.add('LOAD_SAMPLE');}
 if(asset.capabilities.includes('sample-loading')) set.add('LOAD_SAMPLE');
 if(asset.capabilities.includes('visualization')) set.add('OPEN_PANEL');
 return {entityId:asset.entityId,interactions:[...set]};
}
