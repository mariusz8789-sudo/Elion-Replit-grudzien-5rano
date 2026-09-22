import type { ScientificRoomKind } from './interiorTypes';
export interface CatalogAsset { readonly assetKind:string; readonly capabilities:readonly string[]; readonly nominalFootprintM:readonly [number,number]; readonly minClearanceM:number }
const CATALOG: Readonly<Record<ScientificRoomKind, readonly CatalogAsset[]>> = {
  WET_LAB:[{assetKind:'lab-bench',capabilities:['work-surface'],nominalFootprintM:[1.8,0.75],minClearanceM:0.9},{assetKind:'fume-hood',capabilities:['ventilation','chemical-work'],nominalFootprintM:[1.5,0.9],minClearanceM:1.0},{assetKind:'sink',capabilities:['water'],nominalFootprintM:[0.8,0.6],minClearanceM:0.8}],
  IMAGING:[{assetKind:'microscope',capabilities:['microscopy','image-capture'],nominalFootprintM:[0.8,0.8],minClearanceM:1.0},{assetKind:'dark-display',capabilities:['visualization'],nominalFootprintM:[1.2,0.3],minClearanceM:0.8}],
  SPECTROSCOPY:[{assetKind:'spectrometer',capabilities:['spectroscopy','measurement'],nominalFootprintM:[1.2,0.8],minClearanceM:1.0},{assetKind:'sample-station',capabilities:['sample-loading'],nominalFootprintM:[0.7,0.7],minClearanceM:0.8}],
  COMPUTE:[{assetKind:'compute-rack',capabilities:['compute'],nominalFootprintM:[0.8,1.0],minClearanceM:1.0},{assetKind:'analysis-console',capabilities:['visualization','analysis'],nominalFootprintM:[1.5,0.7],minClearanceM:0.8}],
  BIOLOGY:[{assetKind:'biosafety-cabinet',capabilities:['contained-biology'],nominalFootprintM:[1.5,0.8],minClearanceM:1.0},{assetKind:'incubator',capabilities:['incubation'],nominalFootprintM:[0.8,0.8],minClearanceM:0.8},{assetKind:'microscope',capabilities:['microscopy','image-capture'],nominalFootprintM:[0.8,0.8],minClearanceM:1.0}],
  MATERIALS:[{assetKind:'materials-bench',capabilities:['sample-prep'],nominalFootprintM:[1.8,0.8],minClearanceM:0.9},{assetKind:'spectrometer',capabilities:['spectroscopy','measurement'],nominalFootprintM:[1.2,0.8],minClearanceM:1.0},{assetKind:'thermal-stage',capabilities:['thermal-control'],nominalFootprintM:[0.8,0.8],minClearanceM:0.8}],
  CLEANROOM:[{assetKind:'clean-bench',capabilities:['clean-work'],nominalFootprintM:[1.8,0.8],minClearanceM:1.2},{assetKind:'air-shower',capabilities:['air-control'],nominalFootprintM:[1.2,1.2],minClearanceM:1.0}],
  GENERAL:[{assetKind:'lab-bench',capabilities:['work-surface'],nominalFootprintM:[1.8,0.75],minClearanceM:0.9},{assetKind:'analysis-console',capabilities:['visualization','analysis'],nominalFootprintM:[1.5,0.7],minClearanceM:0.8}],
};
export function catalogFor(kind:ScientificRoomKind):readonly CatalogAsset[]{return CATALOG[kind]}
