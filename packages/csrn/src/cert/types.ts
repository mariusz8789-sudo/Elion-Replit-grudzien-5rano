/**
 * CSRN CERTIFICATE MODEL — answers, machine-verifiably: what was claimed,
 * from which evidence, what provenance leads to it, what integrity
 * fingerprints protect it, who issued it, and whether it is signed.
 *
 * Every field here is named after a REAL Genesis concept it is meant to
 * carry, not a fictional placeholder (see `../genesisAdapter.ts`):
 *   - `Evidence.evidenceUri`         — a real Genesis `evidence://` string,
 *                                      produced by Genesis's OWN codec
 *                                      (`experimentFabric/evidenceUri.ts`).
 *                                      CSRN does not parse or re-encode it —
 *                                      duplicating that codec here would be
 *                                      exactly the "second evidence system"
 *                                      this package must not become.
 *   - `Evidence.evidencePackId` /
 *     `evidenceChainId`              — `SavedExperiment.evidencePackId` /
 *                                      `evidenceChainId` (or the equivalent
 *                                      per-hypothesis fields nested in
 *                                      `hypothesisLoop.outcomes[]` /
 *                                      `discoveryLoop.evidenceChain[]`).
 *   - `Evidence.replayCapsuleId`     — `SavedExperiment.replayIdentity.capsuleId`.
 *   - `Provenance.previousCycleId` /
 *     `previousCycleFingerprint` /
 *     `resolvedFrom`                — exactly `SavedDiscoveryLoopCampaignProvenance`
 *                                      (`researchCampaign.ts` chaining, persisted
 *                                      via `scienceMemory.ts`).
 *   - `Claim.predictionSourceExperimentId` — `SavedRealExperimentVerification`'s
 *                                      own field of the same name.
 */

export interface Claim {
  readonly claimId: string;
  readonly statement: string;
  readonly domain: string;
  readonly hypothesisId?: string | null;
  readonly predictionSourceExperimentId?: string | null;
}

export interface Evidence {
  readonly evidencePackId: string | null;
  readonly evidenceChainId: string | null;
  /** A real Genesis `evidence://` URI — see file header. Opaque to CSRN. */
  readonly evidenceUri: string;
  readonly replayCapsuleId?: string | null;
  /** A real Genesis replay-addressable URI, if one exists for this evidence — opaque to CSRN, same reasoning as `evidenceUri`. */
  readonly replayUri?: string | null;
}

export interface ProvenanceStep {
  readonly step: number;
  readonly action: string;
  readonly inputFingerprint: string;
  readonly outputFingerprint: string;
  readonly timestamp: string;
}

export interface Provenance {
  readonly provenanceTrail: readonly ProvenanceStep[];
  readonly previousCycleId?: string | null;
  readonly previousCycleFingerprint?: string | null;
  readonly resolvedFrom?: string | null;
}

export interface Integrity {
  readonly hashAlgorithm: 'SHA-256';
  readonly claimFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly provenanceFingerprint: string;
  /**
   * The fingerprint ECDSA actually signs — of the certificate WITHOUT its
   * `signature` field and WITHOUT this field itself (see
   * `builder.ts::computeSignedPayloadFingerprint`). Deliberately distinct
   * from `computeCertificateFingerprint` (of the FULL, possibly-signed
   * certificate, used only for storage/identification): conflating the two
   * is exactly the circular-dependency bug this model exists to avoid — a
   * certificate's identity fingerprint must never be the thing its own
   * signature protects.
   */
  readonly signedPayloadFingerprint: string;
}

export interface Signature {
  readonly algorithm: 'ECDSA-P256-SHA256';
  /** JSON-serialized JWK — see `crypto/signing.ts::publicKeyToString`. */
  readonly publicKey: string;
  readonly signatureValue: string;
  readonly signedAt: string;
}

export interface Certificate {
  readonly certId: string;
  readonly issuedAt: string;
  readonly issuer: string;
  readonly claim: Claim;
  readonly evidence: Evidence;
  readonly provenance: Provenance;
  readonly integrity: Integrity;
  readonly signature: Signature | null;
}

export interface UnsignedCertificateInput {
  readonly certId: string;
  readonly issuedAt: string;
  readonly issuer: string;
  readonly claim: Claim;
  readonly evidence: Evidence;
  readonly provenance: Provenance;
}
