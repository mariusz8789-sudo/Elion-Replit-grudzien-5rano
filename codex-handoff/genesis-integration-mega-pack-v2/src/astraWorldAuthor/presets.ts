import type { WorldAuthorRequest } from "./types.js";

export function makeCernLikeRequest(id: string): WorldAuthorRequest {
  return {
    requestId: id,
    userPrompt: "Create a CERN-like particle-physics research complex with detector halls, tunnels, control rooms and scientific overlays.",
    worldKind: "CERN_LIKE_RESEARCH_COMPLEX",
    population: "NORMAL",
    timeOfDay: "DAY",
    weather: "CLEAR",
    navigation: ["WALK", "FLY", "CINEMATIC"],
    realism: "SCIENTIFIC",
    scientificGoals: ["particle-physics visualization", "detector hall exploration"],
    requiredCapabilities: ["SCIENTIFIC_INTERIORS", "EVIDENCE", "CINEMATIC_CAPTURE"],
    forbiddenElements: ["unsupported claim of exact CERN reconstruction"],
    targetRuntime: "THREE",
    qualityTarget: "HIGH"
  };
}

export function makeJerusalemReconstructionRequest(id: string): WorldAuthorRequest {
  return {
    requestId: id,
    userPrompt: "Create a historical reconstruction of Jerusalem around year 30, sunset, population off.",
    worldKind: "HISTORICAL_RECONSTRUCTION",
    year: 30,
    epochLabel: "1st century CE",
    locationLabel: "Jerusalem",
    population: "OFF",
    timeOfDay: "SUNSET",
    weather: "CLEAR",
    navigation: ["WALK", "OBSERVER", "CINEMATIC"],
    realism: "RECONSTRUCTION",
    scientificGoals: ["historical reconstruction with explicit uncertainty labels"],
    requiredCapabilities: ["HISTORICAL_EPISTEMIC_LABELS"],
    forbiddenElements: ["claiming exact historical truth without evidence"],
    targetRuntime: "THREE",
    qualityTarget: "HIGH"
  };
}

export function makeMarsRequest(id: string): WorldAuthorRequest {
  return {
    requestId: id,
    userPrompt: "Create an explorable Mars research base with exterior terrain, habitat, lab and rover zone.",
    worldKind: "MARS",
    population: "SPARSE",
    timeOfDay: "DAY",
    weather: "DUST",
    navigation: ["WALK", "FLY", "CINEMATIC"],
    realism: "SCIENTIFIC",
    scientificGoals: ["planetary research visualization"],
    requiredCapabilities: ["TERRAIN", "SCIENTIFIC_INTERIORS"],
    forbiddenElements: ["Earth-like vegetation without explicit cinematic labeling"],
    targetRuntime: "THREE",
    qualityTarget: "HIGH"
  };
}

export function makeMolecularLabRequest(id: string): WorldAuthorRequest {
  return {
    requestId: id,
    userPrompt: "Create a molecular biology laboratory with microscopy, robotics and a Human Digital Twin station.",
    worldKind: "SCIENTIFIC_LAB",
    population: "SPARSE",
    timeOfDay: "DAY",
    weather: "CLEAR",
    navigation: ["WALK", "CINEMATIC"],
    realism: "SCIENTIFIC",
    scientificGoals: ["molecular visualization", "human digital twin"],
    requiredCapabilities: ["MOLECULE_LAB", "HUMAN_DIGITAL_TWIN", "SCIENTIFIC_INTERIORS"],
    forbiddenElements: ["invented medical capabilities"],
    targetRuntime: "THREE",
    qualityTarget: "HIGH"
  };
}
