import type { ScientificRoomKind } from './interiorTypes';
export interface InteriorLightingProfile { readonly ambientLux:number; readonly taskLux:number; readonly colorTemperatureK:number; readonly contrastRatio:number; readonly glareControl:'LOW'|'MEDIUM'|'HIGH' }
export function lightingFor(kind:ScientificRoomKind):InteriorLightingProfile{
 const common={ambientLux:350,taskLux:700,colorTemperatureK:4300,contrastRatio:2.0,glareControl:'MEDIUM' as const};
 if(kind==='IMAGING') return {ambientLux:70,taskLux:180,colorTemperatureK:4000,contrastRatio:4,glareControl:'HIGH'};
 if(kind==='CLEANROOM') return {ambientLux:500,taskLux:900,colorTemperatureK:5000,contrastRatio:1.6,glareControl:'HIGH'};
 if(kind==='COMPUTE') return {ambientLux:220,taskLux:450,colorTemperatureK:4000,contrastRatio:2.5,glareControl:'HIGH'};
 return common;
}
