import type { UnsignedCertificateInput } from '@genesis-os/csrn';
import { formatEvidenceUri } from '../experimentFabric/evidenceUri';
import type { SavedExperiment } from '../scienceMemory';

/**
 * GENESIS → CSRN CERTIFICATE ADAPTER — the ONE place a real, already-saved
 * Genesis record becomes a CSRN `UnsignedCertificateInput`. This is an
 * ADAPTER, not a second evidence system: every field below is read
 * straight off the real `SavedExperiment` (produced by
 * `saveScientificDiscoveryLoopToMemory`/`researchCampaign.ts`), never
 * invented or duplicated:
 *
 *   - `evidence.evidenceUri` is built with Genesis's OWN `evidenceUri.ts`
 *     codec — this module does not parse or re-encode `evidence://` itself.
 *   - `evidence.evidencePackId`/`evidenceChainId` come from the first
 *     hypothesis outcome that actually has one
 *     (`hypothesisLoop.outcomes[].evidencePackId/evidenceChainId`) — a
 *     BLOCKED hypothesis's `null` evidence is never silently upgraded to a
 *     fabricated id.
 *   - `evidence.replayCapsuleId` is `replayIdentity.capsuleId`, if the
 *     record carries one — never invented when absent.
 *   - `provenance.previousCycleId`/`previousCycleFingerprint`/
 *     `resolvedFrom` are exactly `discoveryLoop.campaignProvenance`
 *     (`researchCampaign.ts` chaining) — `null` for a campaign's first
 *     cycle, which genuinely has no previous cycle to point at.
 *   - `provenance.provenanceTrail` carries ONE step whose fingerprints are
 *     Genesis's own (`hypothesisLoop.preregistrationFingerprint` →
 *     `discoveryLoop.discoveryLoopFingerprint`, or the previous cycle's
 *     fingerprint → this cycle's, when chained) — never re-hashed into a
 *     different scheme; CSRN's `ProvenanceStep` fingerprints are opaque
 *     strings, so Genesis's existing fingerprint format is exactly what
 *     belongs there.
 */
export function buildCertificateInputFromDiscoveryLoop(saved: SavedExperiment, certId: string, issuer: string): UnsignedCertificateInput {
  if (saved.hypothesisLoop === undefined || saved.discoveryLoop === undefined) {
    throw new Error(`buildCertificateInputFromDiscoveryLoop: record ${saved.id} is not a discovery-loop record (missing hypothesisLoop/discoveryLoop).`);
  }
  const hypothesisLoop = saved.hypothesisLoop;
  const discoveryLoop = saved.discoveryLoop;

  const outcomeWithEvidence = hypothesisLoop.outcomes.find((outcome) => outcome.evidencePackId !== null);
  const evidencePackId = outcomeWithEvidence?.evidencePackId ?? null;
  const evidenceChainId = outcomeWithEvidence?.evidenceChainId ?? null;
  if (evidencePackId === null) {
    throw new Error(`buildCertificateInputFromDiscoveryLoop: record ${saved.id} has no hypothesis outcome with a real evidencePackId — nothing to build evidence:// from.`);
  }

  const campaignProvenance = discoveryLoop.campaignProvenance;
  const provenanceStep = campaignProvenance === undefined
    ? {
        step: 1,
        action: 'discovery-loop-preregistration-to-result',
        inputFingerprint: hypothesisLoop.preregistrationFingerprint,
        outputFingerprint: discoveryLoop.discoveryLoopFingerprint,
        timestamp: saved.createdAt,
      }
    : {
        step: 1,
        action: 'research-campaign-cycle',
        inputFingerprint: campaignProvenance.previousCycleFingerprint,
        outputFingerprint: discoveryLoop.discoveryLoopFingerprint,
        timestamp: saved.createdAt,
      };

  return {
    certId,
    issuedAt: saved.createdAt,
    issuer,
    claim: {
      claimId: saved.id,
      statement: discoveryLoop.statement,
      domain: saved.labId,
    },
    evidence: {
      evidencePackId,
      evidenceChainId,
      evidenceUri: formatEvidenceUri({ evidencePackId, evidenceChainId }),
      replayCapsuleId: saved.replayIdentity?.capsuleId ?? null,
    },
    provenance: {
      provenanceTrail: [provenanceStep],
      previousCycleId: campaignProvenance?.previousCycleId ?? null,
      previousCycleFingerprint: campaignProvenance?.previousCycleFingerprint ?? null,
      resolvedFrom: campaignProvenance?.resolvedFrom ?? null,
    },
  };
}
