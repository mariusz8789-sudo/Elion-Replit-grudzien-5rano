import { verifyEvidenceCustody, type EvidenceCustodyResult } from '../orchestrator/evidenceCustody';
import type { EvidenceConnectorStore } from '../evidenceConnectors/store';
import type { ConnectorPort, SourceConfig } from '../evidenceConnectors/contracts';
import { preRegister, freeze } from '../agent/genesisAdjudicationProtocol';
import { fnv1a, canonicalJson } from '../events/hash';

/**
 * D-063 — SOVEREIGN PARAMETRIC TRIGGER CERTIFICATE.
 *
 * A parametric payout (insurance, disaster relief, a government benefit
 * tied to a measured threshold) is decided by ONE rule — a metric, a
 * threshold, a relation, an aggregation window — frozen BEFORE the
 * triggering data is read (`genesisAdjudicationProtocol.ts::preRegister`/
 * `freeze`, real, unmodified), then evaluated against real,
 * custody-verified data (`orchestrator/evidenceCustody.ts`, real,
 * unmodified). The output is a `TriggerCertificate` any independent party
 * can replay bit-for-bit against the same pinned bytes and the same frozen
 * rule fingerprint.
 *
 * WHAT THIS IS NOT. Not a `WinnerRecord`, never routed through a Recipe
 * Engine — a trigger certificate answers "did the pre-agreed condition
 * occur", not "did Genesis discover something".
 */

export const PARAMETRIC_TRIGGER_CONTRACT_VERSION = '1.0.0';

export type TriggerVerdict = 'TRIGGERED' | 'NOT_TRIGGERED' | 'INSUFFICIENT_DATA';

export type TriggerFailClosedCode = 'INVALID_RULE' | 'INVALID_EVIDENCE_PROVENANCE' | 'AMBIGUOUS_TERMINAL';

export class TriggerFailClosedError extends Error {
  constructor(message: string, public readonly code: TriggerFailClosedCode) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'TriggerFailClosedError';
  }
}

export interface TriggerRule {
  readonly metric: string;
  readonly threshold: number;
  readonly relation: '>=' | '<=';
  /** How many of the most recent observations the aggregate is computed over. */
  readonly window: number;
  readonly minObservations: number;
}

export interface TriggerCertificate {
  readonly certificateId: string;
  readonly ruleFingerprint: string;
  readonly observed: number;
  readonly threshold: number;
  readonly verdict: 'TRIGGERED' | 'NOT_TRIGGERED';
  readonly dataRefs: readonly { readonly sourceId: string; readonly hash: string; readonly hashPolicy: string }[];
  readonly replayInstructions: string;
}

export interface TriggerResult {
  readonly kind: 'RUN';
  readonly mode: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly verdict: TriggerVerdict;
  readonly observed: number | null;
  readonly certificate: TriggerCertificate | null;
  readonly auditFingerprint: string;
  readonly evidenceCustody: readonly EvidenceCustodyResult[];
}

export interface TriggerBlocked {
  readonly kind: 'EXECUTION_BLOCKED';
  readonly error: string;
  readonly code: TriggerFailClosedCode;
  readonly fingerprint: string;
}

export interface RunTriggerOptions {
  readonly mode?: 'PRODUCTION' | 'SYNTHETIC_TEST_ONLY';
  readonly rule: TriggerRule;
  readonly sources: readonly SourceConfig[];
  readonly store?: EvidenceConnectorStore;
  readonly port?: ConnectorPort;
  readonly parseSeries: (bytes: Uint8Array, sourceId: string) => readonly number[];
  /** Defaults to the max of the trailing `window` observations — the standard "peak in window" parametric-trigger convention. A caller with a different real convention (mean, sum) supplies its own. */
  readonly aggregate?: (series: readonly number[], window: number) => number;
  /** Provenance only (D-040 clock rule) — supplied, never read from the system clock. */
  readonly now: () => string;
}

const defaultAggregate = (series: readonly number[], window: number): number => Math.max(...series.slice(-window));

export async function runParametricTrigger(opts: RunTriggerOptions): Promise<TriggerResult | TriggerBlocked> {
  const mode = opts.mode ?? 'PRODUCTION';
  const aggregate = opts.aggregate ?? defaultAggregate;
  const hash = (v: unknown): string => fnv1a(canonicalJson(v));

  try {
    if (opts.rule.window <= 0 || opts.rule.minObservations <= 0) {
      throw new TriggerFailClosedError(`rule window/minObservations must be positive (got window=${opts.rule.window}, minObservations=${opts.rule.minObservations})`, 'INVALID_RULE');
    }

    // THE RULE, FROZEN BEFORE ANY DATA IS READ.
    const frozen = freeze(
      preRegister({ protocolId: 'PARAMETRIC-TRIGGER-RULE', subjectId: opts.rule.metric, question: `trigger iff aggregate(window=${opts.rule.window}) ${opts.rule.relation} ${opts.rule.threshold}`, rule: opts.rule, declaredAt: opts.now() }),
      opts.now(),
    );

    const series: number[] = [];
    const dataRefs: { sourceId: string; hash: string; hashPolicy: string }[] = [];
    const custodyResults: EvidenceCustodyResult[] = [];
    for (const source of opts.sources) {
      if (mode === 'PRODUCTION') {
        if (opts.store === undefined || opts.port === undefined) {
          throw new TriggerFailClosedError('PRODUCTION mode requires a custody-verified evidence source; none was supplied', 'INVALID_EVIDENCE_PROVENANCE');
        }
        // Same classification fix as `govClaimAudit.ts`: a fetch that never
        // produced bytes is an evidence-provenance failure, not an
        // "ambiguous terminal". An unwrapped network error escaping to the
        // outer catch reports the one code that tells an auditor nothing.
        let bytes: Uint8Array;
        try {
          bytes = await opts.port.fetchBytes(source);
        } catch (fetchError) {
          throw new TriggerFailClosedError(`could not retrieve ${source.sourceId}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`, 'INVALID_EVIDENCE_PROVENANCE');
        }
        const replayPort: ConnectorPort = { fetchBytes: async () => bytes };
        const custody = await verifyEvidenceCustody(opts.store, source, replayPort);
        custodyResults.push(custody);
        if (!custody.ok) throw new TriggerFailClosedError(custody.reason, 'INVALID_EVIDENCE_PROVENANCE');
        series.push(...opts.parseSeries(bytes, source.sourceId));
        dataRefs.push({ sourceId: source.sourceId, hash: custody.record?.artifact?.hash ?? 'n/a', hashPolicy: custody.record?.artifact?.hashPolicy ?? source.hashPolicy });
      } else {
        series.push(...opts.parseSeries(new Uint8Array(0), source.sourceId));
        dataRefs.push({ sourceId: source.sourceId, hash: 'SYNTHETIC_TEST_ONLY', hashPolicy: 'n/a-synthetic' });
      }
    }

    if (series.length < opts.rule.minObservations) {
      return Object.freeze({
        kind: 'RUN',
        mode,
        verdict: 'INSUFFICIENT_DATA' as const,
        observed: null,
        certificate: null,
        auditFingerprint: hash({ verdict: 'INSUFFICIENT_DATA', rule: frozen.ruleFingerprint, observationCount: series.length }),
        evidenceCustody: custodyResults,
      });
    }

    const observed = aggregate(series, opts.rule.window);
    const triggered = opts.rule.relation === '>=' ? observed >= opts.rule.threshold : observed <= opts.rule.threshold;
    const verdict: 'TRIGGERED' | 'NOT_TRIGGERED' = triggered ? 'TRIGGERED' : 'NOT_TRIGGERED';

    const certificate: TriggerCertificate = Object.freeze({
      certificateId: `TRIG-${frozen.ruleFingerprint}`,
      ruleFingerprint: frozen.ruleFingerprint,
      observed,
      threshold: opts.rule.threshold,
      verdict,
      dataRefs,
      replayInstructions: 'runParametricTrigger with the same rule/sources/mode; verify every dataRefs hash against its source and confirm ruleFingerprint is unchanged — observed and verdict must reproduce exactly.',
    });

    return Object.freeze({
      kind: 'RUN',
      mode,
      verdict,
      observed,
      certificate,
      auditFingerprint: hash({ verdict, observed, rule: frozen.ruleFingerprint, dataRefs }),
      evidenceCustody: custodyResults,
    });
  } catch (error) {
    const failure = error instanceof TriggerFailClosedError ? { message: error.message, code: error.code } : { message: error instanceof Error ? error.message : String(error), code: 'AMBIGUOUS_TERMINAL' as const };
    return Object.freeze({
      kind: 'EXECUTION_BLOCKED',
      error: failure.message,
      code: failure.code,
      fingerprint: hash({ code: failure.code, error: failure.message }),
    });
  }
}
