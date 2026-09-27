import { TEST_ONLY_HASH_PORT } from "../hashReplay/testHash.js";
import type { HashPort } from "../hashReplay/hashPort.js";

/** No Unreal Engine toolchain execution is implemented or claimed anywhere in this
 * package — protocol/wire-format data only, for a future POC (real repo currently has
 * no Unreal integration, THREE.js is the only integrated real-time renderer). Fix area
 * 4: fingerprinting now goes through an injected HashPort instead of a private local
 * fnv1a32/canonicalJson pair. */
export interface UnrealEntityPacket {
  id: string;
  type: string;
  parentId?: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number, number];
    scale: [number, number, number];
  };
  assetRef?: string;
  visible: boolean;
  semanticLabels: string[];
  interactionTargetId?: string;
  provenanceRefs: string[];
}

export interface GenesisUnrealFramePacket {
  schemaVersion: "1";
  worldId: string;
  simulationTime: number;
  frameIndex: number;
  entities: UnrealEntityPacket[];
  fingerprint: string;
}

export function makeUnrealFramePacket(
  input: Omit<GenesisUnrealFramePacket, "schemaVersion" | "fingerprint">,
  hashPort: HashPort = TEST_ONLY_HASH_PORT
): GenesisUnrealFramePacket {
  const payload = { schemaVersion: "1" as const, ...input };
  return { ...payload, fingerprint: hashPort.fingerprint(payload) };
}
