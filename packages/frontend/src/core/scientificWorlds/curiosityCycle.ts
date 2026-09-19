import { LaypersonAssistant } from '@genesis/core/knowledge/LaypersonAssistant.js';
import { relatedRecords } from '@genesis/core/knowledge/truthResponse.js';
import type { CuriosityQuestion } from '@genesis/core/knowledge/curiosity.js';
import type { EvidenceRecord } from '@genesis/core/knowledge/evidenceTypes.js';
import type { Observation } from '@genesis/core/cognitive/index.js';
import { createHypothesis, evidenceMagnitudeWithinTolerance, updateConfidence, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import { canonicalJson, fnv1a } from '../events/hash';
import type { SavedCuriosityCycle } from '../scienceMemory';
import type { CognitiveWorldBinding, ScientificWorldsCognitiveCore } from './cognitiveBridge';
import { createExperimentSession, type ExperimentRunner, type ExperimentSession } from './experimentSession';
import type { LabStation } from './labWorld';

/**
 * AUTONOMOUS CURIOSITY CYCLE (D-130) — the full loop the gap-closure pack
 * asked for, on the modules that already exist:
 *
 *   KNOWLEDGE GAP → QUESTION           generateCuriosityQuestions (ledger gaps, D-128)
 *   → SOURCE SEARCH / INGEST → VERIFY  ledger retrieval (relatedRecords + LaypersonAssistant); statuses from classifyClaim
 *   → HYPOTHESIS → COUNTER-HYPOTHESIS  beliefRevision.createHypothesis (a pair on the disputed key)
 *   → DIFFERENTIATING EXPERIMENT       a station whose canonical experiment produces that key (probed on a scratch ledger)
 *   → SIMULATION / EXECUTION           createExperimentSession through the bound runner (human approval, as every proposal)
 *   → EVIDENCE                         the session's ledger hashes
 *   → FALSIFICATION / SUPPORT          the output against each hypothesis within tolerance
 *   → BELIEF REVISION                  beliefRevision.updateConfidence (log-odds)
 *   → MEMORY UPDATE                    core.ingestObservation + Science Memory (typed SavedCuriosityCycle)
 *   → NEXT KNOWLEDGE GAP               the next un-investigated question, the ledger having changed
 *
 * Honest limits, stated in every result: source search never fetches the
 * network from here (URL ingestion stays behind the server's propose-only
 * `/api/knowledge/ingest` and a human publisher); a question without a
 * numeric key, or a key no instrument in this world produces, ends as
 * INSUFFICIENT_EVIDENCE with the missing step named — nothing is run to
 * pretend otherwise; a simulation result is SIMULATION/MODEL evidence about
 * the model, never an observation of the world.
 */

export type CycleTerminal = 'RESOLVED_WITHIN_MODEL' | 'AWAITING_HUMAN_APPROVAL' | 'NO_INSTRUMENT_FOR_KEY' | 'NO_NUMERIC_KEY' | 'NO_GAPS' | 'NOT_DISCRIMINATING' | 'BUDGET_EXHAUSTED';

export interface CycleHypothesis { readonly hypothesis: Hypothesis; readonly assessment: HypothesisAssessment; readonly revised: Hypothesis; }
export interface CycleIteration {
  readonly question: CuriosityQuestion;
  readonly retrieved: readonly { readonly id: string; readonly status: EvidenceRecord['status']; readonly host: string }[];
  readonly assistantSaidIdontKnow: boolean;
  readonly sourceSearch: { readonly mode: 'LEDGER_RETRIEVAL_ONLY'; readonly ingestionRequest: string | null };
  readonly key: string | null;
  readonly hypotheses: readonly CycleHypothesis[];
  readonly discriminability: { readonly discriminates: boolean; readonly why: string } | null;
  readonly experiment: { readonly station: LabStation; readonly experimentId: string } | null;
  readonly session: ExperimentSession | null;
  readonly observed: number | null;
  readonly evidenceHashes: readonly string[];
  readonly terminal: CycleTerminal;
  readonly memoryRecord: SavedCuriosityCycle | null;
  readonly fingerprint: string;
}
export interface CycleResult { readonly iterations: readonly CycleIteration[]; readonly terminal: CycleTerminal; readonly nextQuestion: CuriosityQuestion | null; }

export interface CuriosityCycleOptions {
  readonly bridge: ScientificWorldsCognitiveCore;
  readonly binding: CognitiveWorldBinding;
  /** A runner over a SCRATCH ledger, used only to learn which output keys each experiment produces (never the kernel ledger). */
  readonly probeRunner: ExperimentRunner<unknown>;
  /** The human who approves the experiments this cycle proposes; null → the cycle stops at AWAITING_HUMAN_APPROVAL. */
  readonly approvedBy: string | null;
  readonly maxIterations?: number;
  readonly seed?: number;
  readonly relativeTolerance?: number;
}

const NUMERIC_KV = /\b([A-Za-z_][A-Za-z0-9_]*)=(-?\d+(?:\.\d+)?)\b/g;
const hostOf = (url: string): string => { try { return new URL(url).host || url; } catch { return url; } };

/** Numeric `key=value` pairs in a claim (the same token discipline as the contradiction hunter). */
export function numericPairs(claim: string): readonly { key: string; value: number }[] {
  const out: { key: string; value: number }[] = []; let m: RegExpExecArray | null;
  NUMERIC_KV.lastIndex = 0;
  while ((m = NUMERIC_KV.exec(claim)) !== null) out.push({ key: m[1], value: Number(m[2]) });
  return out;
}

/** Which of the world's experiments emit `key` as a numeric output — learned by one deterministic probe run per experiment on the scratch runner. */
export function instrumentsFor(key: string, stations: readonly LabStation[], probe: ExperimentRunner<unknown>, seed: number): readonly LabStation[] {
  const out: LabStation[] = [];
  for (const st of stations) {
    if (!st.experimentId) continue;
    try { const r = probe(st.experimentId, seed, {}); if (typeof r.outputs[key] === 'number') out.push(st); } catch { /* an experiment that refuses default inputs is not an instrument for this key */ }
  }
  return out;
}

function hypothesisPair(question: CuriosityQuestion, key: string, values: readonly number[], relTol: number): Hypothesis[] {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  return uniq.map((v, i) => createHypothesis(`${question.questionId}:H${i + 1}`, { metric: key, relation: 'equal-within-tolerance', expectedValue: v, tolerance: Math.max(1e-9, Math.abs(v) * relTol), rationale: `${question.kind}: ledger records ${question.evidenceIds.join(',')} carry ${key}=${v}` }, 1 / uniq.length, 'INITIAL', null));
}

function assess(h: Hypothesis, observed: number): { assessment: HypothesisAssessment; magnitude: number } {
  const expected = h.criterion.expectedValue ?? 0; const tol = h.criterion.tolerance ?? 0;
  const within = Math.abs(observed - expected) <= tol;
  return { assessment: within ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL', magnitude: evidenceMagnitudeWithinTolerance(observed, expected, tol) };
}

export async function runCuriosityCycle(opts: CuriosityCycleOptions): Promise<CycleResult> {
  const { bridge, binding } = opts; const max = Math.max(1, opts.maxIterations ?? 1); const seed = opts.seed ?? binding.defaultSeed ?? 7; const relTol = opts.relativeTolerance ?? 0.02;
  const iterations: CycleIteration[] = [];
  const memory = bridge.memory;
  const done = new Set<string>();
  if (memory) for (const r of await memory.read(binding.worldId, 500)) { const c = r as { questionId?: string }; if (typeof c.questionId === 'string') done.add(c.questionId); }
  let terminal: CycleTerminal = 'BUDGET_EXHAUSTED'; let logicalTime = 1000;
  const pick = (): CuriosityQuestion | null => bridge.curiosity(50).questions.find((q) => !done.has(q.questionId)) ?? null;

  for (let i = 0; i < max; i++) {
    const question = pick();
    if (!question) { terminal = 'NO_GAPS'; break; }
    done.add(question.questionId);
    const active = binding.ledger.getActive();
    const related = relatedRecords(active, question.text);
    const cited = active.filter((r) => question.evidenceIds.includes(r.id));
    const retrievedRecords = [...new Map([...cited, ...related].map((r) => [r.id, r])).values()];
    const retrieved = retrievedRecords.map((r) => ({ id: r.id, status: r.status, host: hostOf(r.sourceUrl) }));
    const answer = new LaypersonAssistant(binding.ledger).answer(question.text);
    const key = question.subjectKeys.find((k) => cited.some((r) => numericPairs(r.claim).some((p) => p.key === k))) ?? null;
    const base = { question, retrieved, assistantSaidIdontKnow: answer.saidIdontKnow, sourceSearch: { mode: 'LEDGER_RETRIEVAL_ONLY' as const, ingestionRequest: question.kind === 'INDEPENDENT_CONFIRMATION' ? `independent source for: ${question.text}` : null }, key, evidenceHashes: [] as string[], memoryRecord: null, session: null, observed: null, experiment: null, discriminability: null, hypotheses: [] as CycleHypothesis[] };
    const finish = (t: CycleTerminal, extra: Partial<CycleIteration>): CycleIteration => {
      const it = { ...base, ...extra, terminal: t };
      const fp = `cyc-${fnv1a(canonicalJson({ q: question.questionId, t, s: it.session?.contentHash ?? null, h: it.hypotheses.map((h) => [h.revised.id, h.assessment, h.revised.confidence]) }))}`;
      return { ...it, fingerprint: fp };
    };
    let it: CycleIteration;
    if (!key) it = finish('NO_NUMERIC_KEY', {});
    else {
      const values = cited.flatMap((r) => numericPairs(r.claim).filter((p) => p.key === key).map((p) => p.value));
      const hyps = hypothesisPair(question, key, values, relTol);
      const spread = hyps.length > 1 ? Math.abs((hyps[0].criterion.expectedValue ?? 0) - (hyps[1].criterion.expectedValue ?? 0)) : Number.POSITIVE_INFINITY;
      const tolSum = hyps.reduce((a, h) => a + (h.criterion.tolerance ?? 0), 0);
      const discriminability = hyps.length > 1 ? { discriminates: spread > tolSum, why: spread > tolSum ? `predictions differ by ${spread} > combined tolerance ${tolSum}` : `predictions differ by ${spread} ≤ combined tolerance ${tolSum}: an experiment could support both` } : { discriminates: true, why: 'one model value against an independent run of the same instrument' };
      const instruments = instrumentsFor(key, binding.stations, opts.probeRunner, seed);
      const pending = hyps.map((h) => ({ hypothesis: h, assessment: 'CANDIDATE' as HypothesisAssessment, revised: h }));
      if (!discriminability.discriminates) it = finish('NOT_DISCRIMINATING', { hypotheses: pending, discriminability });
      else if (!instruments.length) it = finish('NO_INSTRUMENT_FOR_KEY', { hypotheses: pending, discriminability });
      else if (!opts.approvedBy) it = finish('AWAITING_HUMAN_APPROVAL', { hypotheses: pending, discriminability, experiment: { station: instruments[0], experimentId: instruments[0].experimentId! } });
      else {
        const station = instruments[0];
        const proposalId = `curiosity:${question.questionId}:${station.experimentId}`;
        bridge.approvals.grant(proposalId, opts.approvedBy);
        logicalTime += 1;
        const { session } = createExperimentSession({ worldId: binding.worldId, stationId: station.id, experimentId: station.experimentId!, seed, inputs: {}, logicalTime }, binding.runner);
        const observed = typeof session.outputs[key] === 'number' ? (session.outputs[key] as number) : null;
        const assessed = hyps.map((h, idx) => { if (observed === null) return { hypothesis: h, assessment: 'INCONCLUSIVE' as HypothesisAssessment, revised: h }; const a = assess(h, observed); return { hypothesis: h, assessment: a.assessment, revised: updateConfidence(h, a.assessment, a.magnitude, `${station.experimentId} session ${session.sessionId}: ${key}=${observed}`, idx) }; });
        await bridge.core.ingestObservation({ id: `obs:${session.sessionId}:${key}`, timestamp: logicalTime, subject: key, predicate: `${station.experimentId}:${key}`, value: observed ?? 'n/a', source: 'EXPERIMENT', epistemicStatus: session.epistemicStatus === 'SIMULATION' ? 'SIMULATION' : 'MODEL', evidenceRefs: [session.contentHash, ...session.evidenceHashes] } satisfies Observation);
        it = finish(observed === null ? 'NO_INSTRUMENT_FOR_KEY' : 'RESOLVED_WITHIN_MODEL', { hypotheses: assessed, discriminability, experiment: { station, experimentId: station.experimentId! }, session, observed, evidenceHashes: [session.contentHash, ...session.evidenceHashes] });
      }
    }
    const memoryRecord: SavedCuriosityCycle = { contractVersion: '1.0.0', worldId: binding.worldId, questionId: question.questionId, questionKind: question.kind, questionText: question.text, subjectKeys: [...question.subjectKeys], evidenceIds: [...question.evidenceIds], hypotheses: it.hypotheses.map((h) => ({ id: h.revised.id, metric: h.revised.criterion.metric, expectedValue: h.revised.criterion.expectedValue ?? 0, tolerance: h.revised.criterion.tolerance ?? 0, priorConfidence: h.hypothesis.confidence, posteriorConfidence: h.revised.confidence, assessment: h.assessment })), experiment: it.session ? { stationId: it.session.stationId ?? '', experimentId: it.session.experimentId, sessionId: it.session.sessionId, contentHash: it.session.contentHash, replayFingerprint: it.session.replayFingerprint, epistemicStatus: it.session.epistemicStatus } : null, terminal: it.terminal, fingerprint: it.fingerprint };
    if (memory) await memory.write(memoryRecord);
    it = { ...it, memoryRecord };
    iterations.push(it);
    terminal = it.terminal;
    if (it.terminal === 'AWAITING_HUMAN_APPROVAL') break;
  }
  return { iterations, terminal, nextQuestion: pick() };
}
