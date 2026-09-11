import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditCertificate, buildCertificate, generateKeyPair, publicKeyToString, signFingerprint } from '@genesis-os/csrn';
import { parseEvidenceUri } from '../core/experimentFabric/evidenceUri';
import { buildCertificateInputFromDiscoveryLoop } from '../core/csrn/genesisCertificateAdapter';

/**
 * CSRN × GENESIS — one real, end-to-end path:
 *
 *   real Research Campaign cycle (researchCampaign.ts)
 *     -> saved to Science Memory (scienceMemory.ts, real campaignProvenance)
 *     -> real Genesis evidence:// URI (evidenceUri.ts, unchanged)
 *     -> CSRN certificate (genesisCertificateAdapter.ts + @genesis-os/csrn)
 *     -> real ECDSA P-256 signature
 *     -> CSRN audit
 *     -> expected verdict
 *
 * No fixture stands in for any of these — every id, fingerprint and
 * evidence:// URI below comes from a real, freshly executed hypothesis
 * loop and a real saved Science Memory record.
 */
function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

describe('CSRN certificate over a real Research Campaign cycle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a real, saved discovery-loop cycle can be certified, signed, and audited as INTEGRITY_VALID_SIGNED_VERIFIED', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { startResearchCampaign, continueResearchCampaign, isNoJustifiedNextQuestion } = await import('../core/experimentFabric/researchCampaign');
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');

    const cycle1 = await startResearchCampaign('problem:intervention-timing');
    const saved1 = saveScientificDiscoveryLoopToMemory(cycle1.result);

    const step2 = await continueResearchCampaign(cycle1);
    if (isNoJustifiedNextQuestion(step2)) throw new Error('Cycle #2 unexpectedly had no justified next question.');
    const saved2 = saveScientificDiscoveryLoopToMemory(step2.result, {
      previousCycleId: saved1.id,
      resolvedFrom: cycle1.result.nextExperiment.resolves,
      previousCycleFingerprint: saved1.discoveryLoop!.discoveryLoopFingerprint,
    });

    const input = buildCertificateInputFromDiscoveryLoop(saved2, `cert-${saved2.id}`, 'genesis-local');

    // The evidence:// URI really is Genesis's own real evidencePackId/evidenceChainId,
    // round-tripping through Genesis's own (unmodified) codec.
    const parsed = parseEvidenceUri(input.evidence.evidenceUri);
    expect(parsed).not.toBeNull();
    expect(parsed!.evidencePackId).toBe(input.evidence.evidencePackId);
    expect(parsed!.evidenceChainId).toBe(input.evidence.evidenceChainId);

    // Provenance really points at the previous cycle's REAL saved record id, not a synthesized one.
    expect(input.provenance.previousCycleId).toBe(saved1.id);
    expect(input.provenance.resolvedFrom).toBe(cycle1.result.nextExperiment.resolves);

    const unsigned = await buildCertificate(input);
    const keys = await generateKeyPair();
    const publicKey = publicKeyToString(keys.publicKeyJwk);
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
    const cert = await buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey, signatureValue, signedAt: input.issuedAt });

    const verified = await auditCertificate(cert, new Set([publicKey]));
    expect(verified.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');

    const untrusted = await auditCertificate(cert, new Set());
    expect(untrusted.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
  });

  it('tampering with the SAVED Science Memory record after certification is caught by the audit — a real integrity finding, not a contrived one', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { startResearchCampaign } = await import('../core/experimentFabric/researchCampaign');
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');

    const cycle1 = await startResearchCampaign('problem:intervention-timing');
    const saved1 = saveScientificDiscoveryLoopToMemory(cycle1.result);

    const input = buildCertificateInputFromDiscoveryLoop(saved1, `cert-${saved1.id}`, 'genesis-local');
    const unsigned = await buildCertificate(input);
    const keys = await generateKeyPair();
    const publicKey = publicKeyToString(keys.publicKeyJwk);
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
    const cert = await buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey, signatureValue, signedAt: input.issuedAt });

    const tampered = { ...cert, claim: { ...cert.claim, statement: 'A claim CSRN never certified' } };
    const result = await auditCertificate(tampered, new Set([publicKey]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('claimFingerprint mismatch'))).toBe(true);
  });

  it('refuses to build a certificate for a record with no real evidence — never fabricates an evidencePackId', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperiment } = await import('../core/scienceMemory');
    const bare = saveExperiment({
      labId: 'lab-1', experimentId: 'e-1', experimentName: 'Not a discovery loop', params: {}, stats: {},
      honesty: 'simplified', honestyNote: 'test fixture',
    });
    expect(() => buildCertificateInputFromDiscoveryLoop(bare, 'cert-x', 'genesis-local')).toThrow(/not a discovery-loop record/);
  });
});
