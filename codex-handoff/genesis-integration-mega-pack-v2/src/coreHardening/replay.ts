import { TEST_ONLY_HASH_PORT } from "../hashReplay/testHash.js";
import type { HashPort } from "../hashReplay/hashPort.js";

/** ADAPTER/VALIDATOR UTILITY (fix area 6). Fingerprinting now goes through an injected
 * `HashPort` (fix area 4) instead of a private local fnv1a32. */
export interface ExecutionCapsule {
  id: string;
  dataRefs: string[];
  codeCommit: string;
  solverId: string;
  solverVersion: string;
  environmentFingerprint: string;
  parameters: Record<string, unknown>;
  seed?: string | number;
  worldStateFingerprint?: string;
  commandFingerprints: string[];
  outputFingerprint: string;
}

export type ReplayStatus = "REPRODUCIBLE" | "DRIFT_DETECTED" | "NOT_REPRODUCIBLE";

export interface ReplayVerification {
  status: ReplayStatus;
  drift: string[];
  capsuleFingerprint: string;
}

export function capsuleFingerprint(capsule: ExecutionCapsule, hashPort: HashPort = TEST_ONLY_HASH_PORT): string {
  return hashPort.fingerprint(capsule);
}

export function verifyReplay(
  expected: ExecutionCapsule,
  actual: ExecutionCapsule,
  hashPort: HashPort = TEST_ONLY_HASH_PORT
): ReplayVerification {
  const drift: string[] = [];
  if (expected.codeCommit !== actual.codeCommit) drift.push("codeCommit");
  if (expected.solverId !== actual.solverId) drift.push("solverId");
  if (expected.solverVersion !== actual.solverVersion) drift.push("solverVersion");
  if (expected.environmentFingerprint !== actual.environmentFingerprint) drift.push("environmentFingerprint");
  if (expected.outputFingerprint !== actual.outputFingerprint) drift.push("outputFingerprint");
  if (hashPort.fingerprint(expected.parameters) !== hashPort.fingerprint(actual.parameters)) drift.push("parameters");
  if (hashPort.fingerprint(expected.dataRefs) !== hashPort.fingerprint(actual.dataRefs)) drift.push("dataRefs");

  const status: ReplayStatus =
    drift.length === 0
      ? "REPRODUCIBLE"
      : drift.includes("outputFingerprint")
        ? "NOT_REPRODUCIBLE"
        : "DRIFT_DETECTED";

  return {
    status,
    drift,
    capsuleFingerprint: capsuleFingerprint(actual, hashPort)
  };
}
