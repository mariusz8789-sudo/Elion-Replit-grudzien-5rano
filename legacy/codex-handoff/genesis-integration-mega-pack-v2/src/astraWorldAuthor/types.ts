/**
 * FIX (red-team finding, historical epistemic taxonomy): V1 declared its own local
 * `EpistemicLabel` with zero import from any host taxonomy. It happens to share the
 * exact same 4 values as the canonical taxonomy this mega-pack already established
 * (`../historicalEpistemic/epistemicTaxonomy.ts`, itself reconciling World Director V1
 * and D-141 V1's own independent declarations) — so this re-exports the canonical type
 * instead of re-declaring a fifth copy of it.
 */
export type { EpistemicLabel } from "../historicalEpistemic/epistemicTaxonomy.js";
import type { EpistemicLabel } from "../historicalEpistemic/epistemicTaxonomy.js";

export type WorldKind =
  | "MODERN_CITY"
  | "HISTORICAL_RECONSTRUCTION"
  | "SCIENTIFIC_LAB"
  | "CERN_LIKE_RESEARCH_COMPLEX"
  | "MARS"
  | "OCEAN"
  | "MOLECULAR_CELLULAR"
  | "FUTURE_WORLD"
  | "CUSTOM";

export type PopulationMode = "OFF" | "SPARSE" | "NORMAL" | "CROWD";
export type NavigationMode = "WALK" | "FLY" | "OBSERVER" | "CINEMATIC";
export type RealismMode = "SCIENTIFIC" | "RECONSTRUCTION" | "CINEMATIC";

export interface WorldAuthorRequest {
  requestId: string;
  userPrompt: string;
  worldKind: WorldKind;
  year?: number;
  epochLabel?: string;
  locationLabel?: string;
  population: PopulationMode;
  timeOfDay: "DAWN" | "DAY" | "SUNSET" | "NIGHT";
  weather: "CLEAR" | "CLOUDY" | "RAIN" | "FOG" | "DUST" | "CUSTOM";
  navigation: NavigationMode[];
  realism: RealismMode;
  scientificGoals: string[];
  requiredCapabilities: string[];
  forbiddenElements: string[];
  targetRuntime: "THREE" | "UNREAL_FUTURE_POC";
  qualityTarget: "MOBILE" | "WEB_BALANCED" | "HIGH";
}

export interface LayoutZone {
  id: string;
  kind: "ROAD" | "BUILDING" | "LAB_ROOM" | "OPEN_SPACE" | "TERRAIN" | "TUNNEL" | "HALL" | "WATER" | "OTHER";
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  rotationYDeg?: number;
  tags: string[];
}

export interface AssetRequirement {
  id: string;
  semanticRole: string;
  query: string;
  preferredSources: string[];
  allowedLicenses: string[];
  formatPreferences: string[];
  maxTrianglesHint?: number;
  maxTextureSizeHint?: number;
  mustBeSeparateMeshes?: boolean;
  mustSupportPicking?: boolean;
  provenanceRequired: boolean;
}

export interface ProceduralCodeTask {
  id: string;
  title: string;
  targetSubsystem:
    | "WORLD_GENERATOR"
    | "GEOMETRY"
    | "ASSET_PLACEMENT"
    | "LIGHTING"
    | "POPULATION"
    | "WEATHER"
    | "CAMERA"
    | "INTERACTION"
    | "UI";
  objective: string;
  constraints: string[];
  acceptance: string[];
}

export interface LightingProfile {
  environment: string;
  keyLight: string;
  fillLight: string;
  practicalLights: string[];
  exposureNotes: string[];
  materialNotes: string[];
}

export interface HistoricalClaim {
  entityOrFeature: string;
  label: EpistemicLabel;
  rationale: string;
  sourceRefs: string[];
}

export interface SceneVariant {
  id: string;
  label: string;
  changes: string[];
}

export interface CanonicalWorldSpecPatch {
  title: string;
  worldKind: WorldKind;
  environment: Record<string, string | number | boolean | null>;
  population: Record<string, string | number | boolean | null>;
  navigation: NavigationMode[];
  capabilityRequests: string[];
  metadata: Record<string, string | number | boolean | null>;
}

export interface WorldAuthorProposal {
  schemaVersion: "1";
  requestId: string;
  title: string;
  summary: string;
  canonicalSpecPatch: CanonicalWorldSpecPatch;
  layout: LayoutZone[];
  assets: AssetRequirement[];
  proceduralTasks: ProceduralCodeTask[];
  lighting: LightingProfile;
  variants: SceneVariant[];
  historicalClaims: HistoricalClaim[];
  warnings: string[];
  authorModel?: string;
}

export interface ValidatedWorldAuthorProposal extends WorldAuthorProposal {
  validation: {
    valid: true;
    checkedAt: string;
    issues: [];
  };
}

export interface RejectedWorldAuthorProposal {
  proposal: WorldAuthorProposal;
  validation: {
    valid: false;
    checkedAt: string;
    issues: string[];
  };
}
