import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import type { EvidenceRecord } from '@genesis/core/knowledge/evidenceTypes.js';
import { generateCuriosityQuestions } from '@genesis/core/knowledge/curiosity.js';
import { huntContradictions } from '@genesis/core/knowledge/contradictionHunter.js';
import type { KernelProviderRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';

export type MetaEpistemicState = 'KNOWN' | 'SUPPORTED' | 'INFERRED' | 'SIMULATED' | 'ASSUMED' | 'UNKNOWN' | 'CONTRADICTED' | 'UNVERIFIED';
export type MetaEventType = 'META_OBSERVATION_RECORDED' | 'META_CONTRADICTION_DETECTED' | 'META_EVIDENCE_REQUIRED' | 'META_SELF_AUDIT_COMPLETED';

export interface MetaEvent {
  readonly eventId: string;
  readonly type: MetaEventType;
  readonly subjectIds: readonly string[];
  readonly summary: string;
}

export interface MetaCognitionSnapshot {
  readonly states: Readonly<Record<MetaEpistemicState, number>>;
  readonly records: readonly { readonly id: string; readonly claim: string; readonly state: MetaEpistemicState }[];
  readonly contradictions: ReturnType<typeof huntContradictions>;
  readonly gaps: ReturnType<typeof generateCuriosityQuestions>['questions'];
  readonly capabilities: readonly { readonly providerId: string; readonly capabilities: readonly string[] }[];
  readonly goalCapability: 'PARTIAL';
  readonly selfAudit: { readonly ledgerValid: boolean; readonly ledgerErrors: readonly string[]; readonly eventCount: number };
  readonly events: readonly MetaEvent[];
}

const META_SOURCE = 'genesis://meta-cognition/';
const ALL_STATES: readonly MetaEpistemicState[] = ['KNOWN', 'SUPPORTED', 'INFERRED', 'SIMULATED', 'ASSUMED', 'UNKNOWN', 'CONTRADICTED', 'UNVERIFIED'];
const CONSCIOUSNESS_OVERCLAIM = /\b(?:i\s+(?:am\s+)?(?:conscious|sentient|self-aware)|i\s+(?:feel|want|believe)|the\s+(?:system|model|ai)\s+(?:is|became)\s+(?:conscious|sentient|self-aware))\b/i;

/** Guards text authored by the meta runtime; it does not censor quoted scientific evidence. */
export function assertNonConsciousnessFraming(fields: Readonly<Record<string, string>>): void {
  for (const [field, value] of Object.entries(fields)) {
    if (CONSCIOUSNESS_OVERCLAIM.test(value)) throw new Error(`META_NON_CONSCIOUSNESS_GUARD:${field}`);
  }
}

function stateOf(record: EvidenceRecord, contradicted: ReadonlySet<string>): MetaEpistemicState {
  if (contradicted.has(record.id)) return 'CONTRADICTED';
  if (record.status === 'unverified' || record.status === 'rejected') return 'UNVERIFIED';
  if (record.claimType === 'model') return 'SIMULATED';
  if (record.claimType === 'hypothesis') return 'ASSUMED';
  if (record.status === 'verified' && record.claimType === 'observation') return 'KNOWN';
  if (record.status === 'verified') return 'SUPPORTED';
  if (record.status === 'candidate') return 'INFERRED';
  return 'UNKNOWN';
}

function event(type: MetaEventType, subjectIds: readonly string[], summary: string): MetaEvent {
  assertNonConsciousnessFraming({ summary });
  return { eventId: `${type}:${subjectIds.join('|') || 'audit'}`, type, subjectIds, summary };
}

function persistEvent(ledger: EvidenceLedger, metaEvent: MetaEvent): void {
  ledger.addRecord({
    sourceUrl: `${META_SOURCE}${encodeURIComponent(metaEvent.eventId)}`,
    sourceTimestamp: null,
    claim: `${metaEvent.type}; subjects=${metaEvent.subjectIds.join(',') || 'none'}; ${metaEvent.summary}`,
    claimType: metaEvent.type === 'META_OBSERVATION_RECORDED' || metaEvent.type === 'META_CONTRADICTION_DETECTED' ? 'observation' : 'model',
    confidence: 1,
    provenance: { sourceKind: 'document', retrievedBy: 'Genesis Meta-Cognition', independentSourceIds: [] },
  });
}

/** A derived audit over canonical Evidence and providers. It owns no persistent memory. */
export function runMetaCognitionAudit(input: {
  readonly ledger: EvidenceLedger;
  readonly registry: KernelProviderRegistry;
  readonly persistEvents?: boolean;
}): MetaCognitionSnapshot {
  const sourceRecords = input.ledger.getActive().filter((record) => !record.sourceUrl.startsWith(META_SOURCE));
  const contradictions = huntContradictions(sourceRecords);
  const contradicted = new Set(contradictions.contradictions.flatMap((entry) => entry.recordIds));
  const gaps = generateCuriosityQuestions(sourceRecords, { limit: 12 }).questions;
  const records = sourceRecords.map((record) => ({ id: record.id, claim: record.claim, state: stateOf(record, contradicted) }));
  const states = Object.fromEntries(ALL_STATES.map((state) => [state, records.filter((record) => record.state === state).length])) as Record<MetaEpistemicState, number>;
  if (sourceRecords.length === 0) states.UNKNOWN = 1;

  const events: MetaEvent[] = [
    ...sourceRecords.filter((record) => record.claimType === 'observation').map((record) => event('META_OBSERVATION_RECORDED', [record.id], `Observation is present in canonical Evidence with status ${record.status}.`)),
    ...contradictions.contradictions.map((entry) => event('META_CONTRADICTION_DETECTED', entry.recordIds, entry.reason)),
    ...gaps.map((gap) => event('META_EVIDENCE_REQUIRED', gap.evidenceIds, gap.text)),
  ];
  const verification = input.ledger.verifyLedger();
  events.push(event('META_SELF_AUDIT_COMPLETED', [], `ledger=${verification.ok ? 'VALID' : 'INVALID'}; records=${sourceRecords.length}; contradictions=${contradictions.contradictions.length}; gaps=${gaps.length}`));
  if (input.persistEvents) for (const metaEvent of events) persistEvent(input.ledger, metaEvent);

  return {
    states,
    records,
    contradictions,
    gaps,
    capabilities: input.registry.describe(),
    goalCapability: 'PARTIAL',
    selfAudit: { ledgerValid: verification.ok, ledgerErrors: verification.errors, eventCount: events.length },
    events,
  };
}
