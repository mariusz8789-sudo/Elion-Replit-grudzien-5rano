import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { SURPASS2_PINNED_SHA256, forgedBytes, realBytes, realClaimCounts, runTamperChallenge } from '../core/reviewer/tamperChallenge';

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

describe('reviewer tamper challenge', () => {
  it('the published anchor is the SHA-256 of the pinned SURPASS-2 bytes', () => {
    expect(sha(realBytes())).toBe(SURPASS2_PINNED_SHA256);
  });

  it('reads the real counts the claim is judged on', () => {
    const c = realClaimCounts();
    expect(c.exposed).toEqual({ arm: '15 mg Tirzepatide', affected: 65, atRisk: 470 });
    expect(c.reference).toEqual({ arm: '1 mg Semaglutide', affected: 54, atRisk: 469 });
  });

  it('forging one number changes the bytes and only that number', () => {
    const forged = forgedBytes(30);
    expect(sha(forged)).not.toBe(SURPASS2_PINNED_SHA256);
    expect(sha(forgedBytes(65))).toBe(SURPASS2_PINNED_SHA256);
  });

  it('real bytes: CONTRADICTED, no certificate; forged bytes after a freeze: FAIL CLOSED', async () => {
    const out = await runTamperChallenge(30);
    expect(out.real.matchesAnchor).toBe(true);
    expect(out.real.result.kind).toBe('RUN');
    if (out.real.result.kind === 'RUN') {
      expect(out.real.result.verdict).toBe('CONTRADICTED');
      expect(out.real.result.certificate).toBeNull();
    }
    expect(out.forged.matchesAnchor).toBe(false);
    expect(out.forged.result.kind).toBe('EXECUTION_BLOCKED');
    if (out.forged.result.kind === 'EXECUTION_BLOCKED') expect(out.forged.result.code).toBe('INVALID_EVIDENCE_PROVENANCE');
  });

  it('the honest boundary: forged bytes with no prior freeze pass the arithmetic, and only the anchor exposes them', async () => {
    const out = await runTamperChallenge(30);
    expect(out.unanchored.result.kind).toBe('RUN');
    if (out.unanchored.result.kind === 'RUN') expect(out.unanchored.result.verdict).toBe('SUBSTANTIATED');
    expect(out.unanchored.matchesAnchor).toBe(false);
  });

  it('rejects a nonsense forged count', () => {
    expect(() => forgedBytes(-1)).toThrow();
    expect(() => forgedBytes(1.5)).toThrow();
  });
});
