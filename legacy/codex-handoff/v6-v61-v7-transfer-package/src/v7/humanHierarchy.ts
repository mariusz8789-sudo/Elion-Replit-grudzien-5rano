import type { EpistemicStatus, ProvenanceRef, Vec3 } from '../contracts';
export type HumanScaleLevel='BODY'|'ORGAN_SYSTEM'|'ORGAN'|'TISSUE'|'CELL'|'ORGANELLE'|'MOLECULE';
export const LEVEL_ORDER:readonly HumanScaleLevel[]=['BODY','ORGAN_SYSTEM','ORGAN','TISSUE','CELL','ORGANELLE','MOLECULE'];
export interface HumanHierarchyNode { readonly nodeId:string; readonly parentId:string|null; readonly level:HumanScaleLevel; readonly label:string; readonly nominalSizeM:number; readonly position:Vec3; readonly modelAssetId:string; readonly epistemicStatus:EpistemicStatus; readonly confidence:number; readonly resolutionM:number; readonly provenance:readonly ProvenanceRef[]; readonly metadata:Readonly<Record<string,string>> }
export interface HumanDigitalTwinManifest { readonly manifestId:string; readonly subjectKind:'GENERIC_REFERENCE'|'DIGITAL_TWIN'; readonly nodes:readonly HumanHierarchyNode[]; readonly fingerprint:string; readonly limitations:readonly string[] }
