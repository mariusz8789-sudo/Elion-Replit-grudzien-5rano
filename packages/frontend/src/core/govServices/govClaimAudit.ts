import { parseProblem } from '../orchestrator/nl';
import type { ProblemRecord } from '../orchestrator/contracts';
import { verifyEvidenceCustody, type EvidenceCustodyResult } from '../orchestrator/evidenceCustody';
import type { EvidenceConnectorStore } from '../evidenceConnectors/store';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import { preRegister, freeze } from '../agent/genesisAdjudicationProtocol';
import { asEvidenceClass } from '../orchestrator/winnerGate';
import { DEFAULT_EVIDENCE_CLASS_RANK } from '../agent/evidenceProvenance';
import { fnv1a, canonicalJson } from '../events/hash';

/**
 * D-063 — REGULATOR-GRADE CLAIM SUBSTANTIATION AUDIT.
 *
 * A marketing/health claim ("reduces wrinkles 20% in 4 weeks") is audited
 * against real, custody-verified evidence and given one of four verdicts,
 * with a replayable certificate when it clears. Nothing here is a new
 * decision engine: `parseProblem` (NL fail-closed), `verifyEvidenceCustody`
 * (D-057/D-059's real custody chain), `genesisAdjudicationProtocol`'s real
 * `preRegister`/`freeze` (the rule is sealed BEFORE evidence is read), and
 * `winnerGate.ts::asEvidenceClass`/`DEFAULT_EVIDENCE_CLASS_RANK` (the same
 * evidence-strength ranking every other domain in this repo uses) are all
 * called unmodified. This module supplies only the claim-specific
 * conjunction over their real output.
 *
 * WHAT THIS IS NOT. Not a `WinnerRecord` and never routed through any
 * domain's Recipe Engine — a claim is a statement about the world, not a
 * candidate proposing to leave the research layer (`agent/
 * practicalCandidateGate.ts`'s own distinction). Its output is an
 * `AuditCertificate`, a different real thing.
 */

export const CLAIM_AUDIT_CONTRACT_VERSION = '1.0.0';

export type ClaimVerdict = 'SUBSTANTIATED' | 'INSUFFICIENT_EVIDENCE' | 'CONTRADICTED' | 'UNVERIFIABLE_PROVENANCE';

export type ClaimAuditFailClosedCode = 'MALFORMED_PROBLEM' | 'INVALID_EVIDENCE_PROVENANCE' | 'AMBIGUOUS_TERMINAL';

export class ClaimAuditFailClosedError extends Error {
  constructor(message: string, public readonly code: ClaimAuditFailClosedCode) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'ClaimAuditFailClosedError';
  }
}

/** One piece of evidence a caller's own parser extracted from one custody-verified source. `hash`/`hashPolicy` are stamped by this module from that source's OWN custody record — never supplied by the parser, so a claim item can never carry a fabricated provenance stamp. */
export interface ParsedClaimEvidence {
  readonly ref: string;
  readonly evidenceClass: string;
  readonly supports: 'for' | 'against';
}

export interface ClaimEvidenceItem extends ParsedClaimEvidence {
  readonly hash: string;
  readonly hashPolicy: string;
  readonly sourceId: string;
}

export interface AuditCertificate {
  readonly certificateId: string;
  readonly claimFingerprint: string;
  readonly verdict: 'SUBSTANTIATED';
  readonly evidenceRefs: readonly { readonly ref: string; readonly hash: string; readonly hashPolicy: string }[];
  readonly frozenRuleFingerprint: string;
  readonly replayInstructions: string;
}

export interface ClaimAuditResult {
  readonly kind: 'RUN';
  readonly mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly problem: ProblemRecord;
  readonly verdict: ClaimVerdict;
  readonly certificate: AuditCertificate | null;
  readonly evidence: readonly ClaimEvidenceItem[];
  readonly auditFingerprint: string;
  readonly evidenceCustody: readonly EvidenceCustodyResult[];
}

export interface ClaimAuditBlocked {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly error: string;
  readonly code: ClaimAuditFailClosedCode;
  readonly fingerprint: string;
}

export interface RunClaimAuditOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly claimText: string;
  readonly sources: readonly SourceConfig[];
  readonly store?: EvidenceConnectorStore;
  readonly port?: ConnectorPort;
  /** Real, caller-supplied extraction: raw fetched bytes -> the claim-relevant items found in them. Never asked to supply provenance — this module stamps that from the source's own custody record. */
  readonly parseClaims: (bytes: Uint8Array, sourceId: string) => readonly ParsedClaimEvidence[];
  /** Provenance only (D-040 clock rule) — supplied, never read from the system clock. */
  readonly now: () => string;
}

/** Evidence classes strong enough to substantiate or contradict a claim on their own — the same `INDIRECT_RANDOMISED`-or-above bar the D-057 Winner Promotion Gate already uses (`winnerGate.ts`), reused rather than a second threshold. */
const STRONG_THRESHOLD_RANK = DEFAULT_EVIDENCE_CLASS_RANK.INDIRECT_RANDOMISED;
const isStrong = (evidenceClass: string): boolean => DEFAULT_EVIDENCE_CLASS_RANK[asEvidenceClass(evidenceClass)] >= STRONG_THRESHOLD_RANK;

export async function runClaimAudit(opts: RunClaimAuditOptions): Promise<ClaimAuditResult | ClaimAuditBlocked> {
  const mode = opts.mode ?? 'PRODUCTION';
  const hash = (v: unknown): string => fnv1a(canonicalJson(v));
  const problem = parseProblem(
    'CLAIM-AUDIT',
    { text: opts.claimText, objectives: [{ metric: 'substantiation', direction: 'maximize' }], evidenceMinimum: '>=1 strong-for observation, no unresolved strong-against', harmAxes: ['consumer-harm'] },
    hash,
  );

  try {
    if (problem.status !== 'FORMALIZED') {
      throw new ClaimAuditFailClosedError(`claim is NEEDS_INPUT: ${problem.missingInputs.join('; ')}`, 'MALFORMED_PROBLEM');
    }

    // THE RULE, FROZEN BEFORE ANY EVIDENCE IS READ — genesisAdjudicationProtocol.ts, unmodified.
    const rule = Object.freeze({ minStrongFor: 1, contradictionVeto: true, strongThresholdRank: STRONG_THRESHOLD_RANK });
    const frozen = freeze(
      preRegister({ protocolId: 'CLAIM-AUDIT-RULE', subjectId: problem.problemId, question: 'claim substantiated iff >=1 strong-for observation exists and no strong-against observation contradicts it', rule, declaredAt: opts.now() }),
      opts.now(),
    );

    const evidence: ClaimEvidenceItem[] = [];
    const custodyResults: EvidenceCustodyResult[] = [];
    for (const source of opts.sources) {
      if (mode === 'PRODUCTION') {
        if (opts.store === undefined || opts.port === undefined) {
          throw new ClaimAuditFailClosedError('PRODUCTION mode requires a custody-verified evidence source; none was supplied', 'INVALID_EVIDENCE_PROVENANCE');
        }
        // Fetch ONCE; hand a port that replays the already-fetched bytes to
        // the custody store, so the same real bytes are both hashed/frozen
        // AND parsed — never two independent fetches that could silently
        // diverge.
        const bytes = await opts.port.fetchBytes(source);
        const replayPort: ConnectorPort = { fetchBytes: async () => bytes };
        const custody = await verifyEvidenceCustody(opts.store, source, replayPort);
        custodyResults.push(custody);
        if (!custody.ok) throw new ClaimAuditFailClosedError(custody.reason, 'INVALID_EVIDENCE_PROVENANCE');
        const artifact = custody.record?.artifact;
        const parsed = opts.parseClaims(bytes, source.sourceId);
        for (const item of parsed) {
          evidence.push({ ...item, sourceId: source.sourceId, hash: artifact?.hash ?? 'n/a', hashPolicy: artifact?.hashPolicy ?? source.hashPolicy });
        }
      } else {
        const parsed = opts.parseClaims(new Uint8Array(0), source.sourceId);
        for (const item of parsed) evidence.push({ ...item, sourceId: source.sourceId, hash: 'SYNTHETIC_TEST_ONLY', hashPolicy: 'n/a-synthetic' });
      }
    }

    const strongFor = evidence.filter((e) => e.supports === 'for' && isStrong(e.evidenceClass));
    const strongAgainst = evidence.filter((e) => e.supports === 'against' && isStrong(e.evidenceClass));

    let verdict: ClaimVerdict;
    if (evidence.length === 0) verdict = 'INSUFFICIENT_EVIDENCE';
    else if (strongFor.length > 0 && strongAgainst.length > 0) verdict = 'CONTRADICTED';
    else if (strongFor.length >= rule.minStrongFor) verdict = 'SUBSTANTIATED';
    else verdict = 'INSUFFICIENT_EVIDENCE';
    // UNVERIFIABLE_PROVENANCE is reachable only by a caller that skips the
    // PRODUCTION custody gate — this function never produces it itself,
    // since custody already refuses unverifiable evidence outright before
    // reaching this point (an unreachable-by-construction state, not a
    // silently-dropped one).

    const certificate: AuditCertificate | null =
      verdict === 'SUBSTANTIATED'
        ? Object.freeze({
            certificateId: `CERT-${problem.problemId}-${frozen.ruleFingerprint}`,
            claimFingerprint: problem.fingerprint,
            verdict: 'SUBSTANTIATED' as const,
            evidenceRefs: strongFor.map((e) => ({ ref: e.ref, hash: e.hash, hashPolicy: e.hashPolicy })),
            frozenRuleFingerprint: frozen.ruleFingerprint,
            replayInstructions: 'runClaimAudit with the same claimText/sources/mode; verify every evidenceRefs hash against its source and confirm frozenRuleFingerprint is unchanged.',
          })
        : null;

    return Object.freeze({
      kind: 'RUN',
      mode,
      problem,
      verdict,
      certificate,
      evidence,
      auditFingerprint: hash({ verdict, evidence: evidence.map((e) => ({ ref: e.ref, hash: e.hash, supports: e.supports })), rule: frozen.ruleFingerprint }),
      evidenceCustody: custodyResults,
    });
  } catch (error) {
    const failure = error instanceof ClaimAuditFailClosedError ? { message: error.message, code: error.code } : { message: error instanceof Error ? error.message : String(error), code: 'AMBIGUOUS_TERMINAL' as const };
    return Object.freeze({
      kind: 'EXECUTION_BLOCKED',
      error: failure.message,
      code: failure.code,
      fingerprint: hash({ problemId: problem.problemId, code: failure.code, error: failure.message }),
    });
  }
}
