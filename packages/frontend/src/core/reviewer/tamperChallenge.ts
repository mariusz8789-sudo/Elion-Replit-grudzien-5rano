import { canonicalJson } from '../events/hash';
import { EvidenceConnectorStore } from '../evidenceConnectors/store';
import { hashBytes } from '../evidenceConnectors/hashing';
import type { ConnectorPort } from '../evidenceConnectors/contracts';
import surpass2Raw from '../biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';
import { runClaimAudit, type ClaimAuditBlocked, type ClaimAuditResult } from '../govServices/govClaimAudit';
import { D063_CLAIM_TEXT, D063_SURPASS2_SOURCE, d063ParseClaims } from '../govServices/govServiceRuns';

/**
 * REVIEWER TAMPER CHALLENGE — "don't believe us, try to cheat it".
 *
 * A grant reviewer does not trust a description of an audit engine; they
 * trust what happens when they try to fool it. This module runs the real
 * D-063 claim audit (same engine, same parser, same custody store class the
 * `/console` gov panel uses) three times inside the reviewer's own browser:
 *
 *   A. REAL      — the pinned SURPASS-2 bytes. The real counts refuse the
 *                  sponsor-direction claim: CONTRADICTED, no certificate.
 *   B. FORGED    — the reviewer rewrites ONE number (diarrhoea cases in the
 *                  15 mg tirzepatide arm) low enough that the claim would
 *                  look true, and feeds it through the SAME custody chain
 *                  that already froze the real bytes. Custody sees the
 *                  content drift and the audit FAILS CLOSED. No certificate.
 *   C. UNANCHORED — the same forged bytes in a FRESH store with no prior
 *                  freeze. This is shown on purpose: the arithmetic alone
 *                  would now say SUBSTANTIATED. The only thing that exposes
 *                  the forgery is that its SHA-256 differs from the anchor
 *                  published in this repository (`SURPASS2_PINNED_SHA256`).
 *                  That is the honest boundary of the protection: custody
 *                  catches a change against a known anchor; it cannot make
 *                  forged data true.
 *
 * Nothing here is mocked: every verdict is what `runClaimAudit` returned.
 */

/** SHA-256 of `canonicalJson(surpass2Raw)` — the bytes every PRODUCTION run hashes. Pinned by `reviewerTamperChallenge.test.ts`. */
export const SURPASS2_PINNED_SHA256 = 'b671812b1d40150e652801e5ccb5ec793a454b3d63b090ea0923e4dab65b4ed9';

export const TAMPER_TERM = 'Diarrhoea';
export const TAMPER_EXPOSED_ARM = '15 mg Tirzepatide';
export const TAMPER_REFERENCE_ARM = '1 mg Semaglutide';

interface RawStat { groupId: string; numAffected: number | null; numAtRisk: number | null }
interface RawEvent { term: string; stats: RawStat[] }
interface RawGroup { id: string; title: string }
interface RawTrial { adverseEvents: { eventGroups: RawGroup[]; otherEvents: RawEvent[]; seriousEvents: RawEvent[] } }

export interface ArmCount {
  readonly arm: string;
  readonly affected: number;
  readonly atRisk: number;
}

function statFor(trial: RawTrial, armTitle: string): RawStat {
  const group = trial.adverseEvents.eventGroups.find((g) => g.title === armTitle);
  const event = [...trial.adverseEvents.otherEvents, ...trial.adverseEvents.seriousEvents].find((e) => e.term === TAMPER_TERM);
  const stat = event?.stats.find((s) => s.groupId === group?.id);
  if (stat === undefined || stat.numAffected === null || stat.numAtRisk === null) {
    throw new Error(`tamper challenge: no ${TAMPER_TERM} counts for "${armTitle}" in the pinned record`);
  }
  return stat;
}

/** The real counts the claim is judged on, read from the pinned record. */
export function realClaimCounts(): { readonly exposed: ArmCount; readonly reference: ArmCount } {
  const trial = surpass2Raw as unknown as RawTrial;
  const e = statFor(trial, TAMPER_EXPOSED_ARM);
  const r = statFor(trial, TAMPER_REFERENCE_ARM);
  return {
    exposed: { arm: TAMPER_EXPOSED_ARM, affected: e.numAffected!, atRisk: e.numAtRisk! },
    reference: { arm: TAMPER_REFERENCE_ARM, affected: r.numAffected!, atRisk: r.numAtRisk! },
  };
}

export function realBytes(): Uint8Array {
  return new TextEncoder().encode(canonicalJson(surpass2Raw));
}

/** The pinned record with exactly ONE number rewritten: exposed-arm diarrhoea cases. */
export function forgedBytes(forgedAffected: number): Uint8Array {
  if (!Number.isInteger(forgedAffected) || forgedAffected < 0) throw new Error('tamper challenge: forged count must be a non-negative integer');
  const trial = JSON.parse(JSON.stringify(surpass2Raw)) as RawTrial;
  statFor(trial, TAMPER_EXPOSED_ARM).numAffected = forgedAffected;
  return new TextEncoder().encode(canonicalJson(trial));
}

const replay = (bytes: Uint8Array): ConnectorPort => ({ fetchBytes: async () => bytes });
const now = (): string => '1970-01-01T00:00:00Z';

function audit(store: EvidenceConnectorStore, bytes: Uint8Array): Promise<ClaimAuditResult | ClaimAuditBlocked> {
  return runClaimAudit({
    mode: 'PRODUCTION',
    claimText: D063_CLAIM_TEXT,
    sources: [D063_SURPASS2_SOURCE],
    store,
    port: replay(bytes),
    parseClaims: d063ParseClaims,
    now,
  });
}

export interface TamperRun {
  readonly sha256: string;
  readonly matchesAnchor: boolean;
  readonly result: ClaimAuditResult | ClaimAuditBlocked;
}

export interface TamperChallengeOutcome {
  readonly claim: string;
  readonly anchorSha256: string;
  readonly forgedAffected: number;
  readonly real: TamperRun;
  readonly forged: TamperRun;
  readonly unanchored: TamperRun;
}

export async function runTamperChallenge(forgedAffected: number): Promise<TamperChallengeOutcome> {
  const real = realBytes();
  const forged = forgedBytes(forgedAffected);
  const realSha = await hashBytes(real, 'sha256');
  const forgedSha = await hashBytes(forged, 'sha256');

  const custody = new EvidenceConnectorStore();
  const realResult = await audit(custody, real);
  const forgedResult = await audit(custody, forged);
  const unanchoredResult = await audit(new EvidenceConnectorStore(), forged);

  return {
    claim: D063_CLAIM_TEXT,
    anchorSha256: SURPASS2_PINNED_SHA256,
    forgedAffected,
    real: { sha256: realSha, matchesAnchor: realSha === SURPASS2_PINNED_SHA256, result: realResult },
    forged: { sha256: forgedSha, matchesAnchor: forgedSha === SURPASS2_PINNED_SHA256, result: forgedResult },
    unanchored: { sha256: forgedSha, matchesAnchor: forgedSha === SURPASS2_PINNED_SHA256, result: unanchoredResult },
  };
}
