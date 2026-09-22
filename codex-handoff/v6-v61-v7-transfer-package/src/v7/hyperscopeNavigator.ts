import { LEVEL_ORDER, type HumanDigitalTwinManifest, type HumanHierarchyNode, type HumanScaleLevel } from './humanHierarchy';
export interface HyperscopeStep { readonly fromNodeId:string; readonly toNodeId:string; readonly fromLevel:HumanScaleLevel; readonly toLevel:HumanScaleLevel; readonly zoomRatio:number; readonly allowed:boolean; readonly reason:string }
export class HyperscopeNavigator { constructor(private readonly manifest:HumanDigitalTwinManifest){}
 node(id:string):HumanHierarchyNode{const n=this.manifest.nodes.find(x=>x.nodeId===id); if(!n) throw new Error(`Unknown human node ${id}`); return n}
 descend(fromNodeId:string,toNodeId:string):HyperscopeStep{const a=this.node(fromNodeId),b=this.node(toNodeId); const direct=b.parentId===a.nodeId; const levelOk=LEVEL_ORDER.indexOf(b.level)===LEVEL_ORDER.indexOf(a.level)+1; const allowed=direct&&levelOk&&b.nominalSizeM<a.nominalSizeM; return {fromNodeId:a.nodeId,toNodeId:b.nodeId,fromLevel:a.level,toLevel:b.level,zoomRatio:a.nominalSizeM/b.nominalSizeM,allowed,reason:allowed?'DIRECT_MONOTONIC_DESCENT':'INVALID_SCALE_TRANSITION'};}
 pathTo(nodeId:string):readonly HumanHierarchyNode[]{const byId=new Map(this.manifest.nodes.map(n=>[n.nodeId,n])); const path:HumanHierarchyNode[]=[]; let cur=byId.get(nodeId); while(cur){path.unshift(cur); cur=cur.parentId?byId.get(cur.parentId):undefined;} return path;}
}
