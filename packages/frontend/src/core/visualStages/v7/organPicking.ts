import type { HumanDigitalTwinManifest, HumanHierarchyNode } from './humanHierarchy';
export interface PickResult { readonly hit:boolean; readonly node?:HumanHierarchyNode; readonly reason:string }
export function pickHumanNode(manifest:HumanDigitalTwinManifest,entityId:string):PickResult{const node=manifest.nodes.find(n=>n.nodeId===entityId); return node?{hit:true,node,reason:'CANONICAL_ENTITY_ID_MATCH'}:{hit:false,reason:'NO_HIERARCHY_NODE'};}
