import type { InquiryLoopResult } from './inquiryLoop';
import { selectNextResearchQuestion } from './nextQuestion';
import type { ResearchChainResult } from './researchChain';

/**
 * THE TRACE OF ONE AUTONOMOUS SESSION, with every element's source named.
 *
 * ## Why `source` is the point of this module
 *
 * A trace is easy to fake. Any function can emit a tidy
 * QUESTION → HYPOTHESIS → PREDICTION → … sequence by composing sentences, and
 * such a trace would look identical to an honest one while being a narrative
 * about a run rather than a record of it.
 *
 * So every entry carries the PATH it was read from, into the
 * `ResearchChainResult` the caller already holds. That makes the claim "each
 * element has a source in real system state" checkable instead of asserted: a
 * reader — or a test — can walk the path and compare. `discoveryTrace.test.ts`
 * does exactly that, and it is the reason this file is worth more than a
 * pretty-printer.
 *
 * Nothing here computes science. It reads a finished chain, in order, and where
 * the chain has no element of some kind the trace simply has no entry of that
 * kind — never a placeholder, and never a smoothed-over gap. A session that
 * generated nothing has no GENERATION entries, and that absence is the honest
 * record of a session that generated nothing.
 *
 * ## Order is the chain's own, not a template
 *
 * Entries come out in the order the chain produced them: step by step, and
 * within a step, round by round. The brief's named sequence is what an
 * unremarkable session happens to look like, not a shape imposed here — which
 * is why a session that stops early simply ends early rather than emitting the
 * remaining headings with nothing under them.
 */

export const DISCOVERY_TRACE_CONTRACT_VERSION = '1.0.0';

export type TraceElementKind =
  | 'QUESTION'
  | 'HYPOTHESIS'
  | 'EXPERIMENT'
  | 'PREDICTION'
  | 'OBSERVATION'
  | 'ASSESSMENT'
  | 'FALSIFICATION'
  | 'GENERATION'
  | 'NEXT_EXPERIMENT'
  | 'MEMORY_UPDATE'
  | 'NEXT_QUESTION';

export interface TraceEntry {
  /** Which chain step this came from, 1-based. */
  readonly step: number;
  readonly kind: TraceElementKind;
  /** Plain statement of the element. */
  readonly what: string;
  /**
   * Where it was read from, as a path into the `ResearchChainResult` passed in.
   * Walk it and you get `value` back. This is the field that makes the trace
   * auditable rather than merely plausible.
   */
  readonly source: string;
  /** The real value at that path, when the element has one. */
  readonly value: string | number | null;
}

/** Reads a finished chain and reports it element by element, with sources. */
export function traceResearchChain(chain: ResearchChainResult): readonly TraceEntry[] {
  const entries: TraceEntry[] = [];

  chain.steps.forEach((chainStep, i) => {
    const step = chainStep.step;
    const at = `steps[${i}]`;

    entries.push({
      step,
      kind: 'QUESTION',
      what: chainStep.question,
      source: `${at}.question`,
      value: chainStep.question,
    });

    if (chainStep.outcome.status !== 'RAN') return;
    const run = chainStep.outcome.run;
    const native = run.native as InquiryLoopResult;

    native.rounds.forEach((round, r) => {
      const roundAt = `${at}.outcome.run.native.rounds[${r}]`;

      entries.push({
        step,
        kind: 'EXPERIMENT',
        what: run.rounds[r]?.what ?? `round ${round.round}`,
        source: `${roundAt}.probeValue`,
        value: round.probeValue,
      });

      round.outcomes.forEach((outcome, o) => {
        entries.push({
          step,
          kind: 'HYPOTHESIS',
          what: outcome.hypothesisId,
          source: `${roundAt}.outcomes[${o}].hypothesisId`,
          value: outcome.hypothesisId,
        });
        if (outcome.predicted !== null) {
          entries.push({
            step,
            kind: 'PREDICTION',
            what: `${outcome.hypothesisId} predicts ${outcome.predicted}`,
            source: `${roundAt}.outcomes[${o}].predicted`,
            value: outcome.predicted,
          });
        }
      });

      entries.push({
        step,
        kind: 'OBSERVATION',
        what: `measured ${round.observed}`,
        source: `${roundAt}.observed`,
        value: round.observed,
      });

      round.outcomes.forEach((outcome, o) => {
        entries.push({
          step,
          kind: outcome.assessment === 'FALSIFIED_WITHIN_PROTOCOL' ? 'FALSIFICATION' : 'ASSESSMENT',
          what: `${outcome.hypothesisId}: ${outcome.assessment} — ${outcome.reason}`,
          source: `${roundAt}.outcomes[${o}].assessment`,
          value: outcome.assessment,
        });
      });
    });

    const generated = chainStep.outcome.generated;
    if (generated !== null) {
      entries.push({
        step,
        kind: 'GENERATION',
        what: `${generated.derived.hypothesisId} derived: ${generated.derived.why}`,
        source: `${at}.outcome.generated.derived.hypothesisId`,
        value: generated.derived.hypothesisId,
      });
      // The two generations are assessed by different real quantities, so the
      // trace reports each one's own rather than a shared summary word.
      if (generated.kind === 'DERIVED_PARAMETER_VALUE') {
        entries.push({
          step,
          kind: 'ASSESSMENT',
          what: `the derived value stands as: ${generated.standing.why}`,
          source: `${at}.outcome.generated.standing.standing`,
          value: generated.standing.standing,
        });
      } else {
        entries.push({
          step,
          kind: 'ASSESSMENT',
          what: `the composed mechanism is ${generated.assessment.interaction}: ${generated.assessment.reason}`,
          source: `${at}.outcome.generated.assessment.interaction`,
          value: generated.assessment.interaction,
        });
      }
    }

    if (run.nextExperiment !== null) {
      entries.push({
        step,
        kind: 'NEXT_EXPERIMENT',
        what: run.nextExperiment.action,
        source: `${at}.outcome.run.nextExperiment.status`,
        value: run.nextExperiment.status,
      });
    }

    chainStep.remembered.forEach((saved, m) => {
      entries.push({
        step,
        kind: 'MEMORY_UPDATE',
        what: `banked in Science Memory as ${saved.id}`,
        source: `${at}.remembered[${m}].id`,
        value: saved.id,
      });
    });

    // The question that decided the NEXT step, recomputed from this step's own
    // outcome by the same selector the chain used. Not stored on the step,
    // because the chain records the question it RAN rather than the ranking
    // that chose it — so this reads the selector again on the same input rather
    // than paraphrasing what the next step happens to be.
    const selection = selectNextResearchQuestion(chainStep.outcome);
    if (selection.selected !== null) {
      entries.push({
        step,
        kind: 'NEXT_QUESTION',
        what: `${selection.selected.kind}: ${selection.selected.question}`,
        source: `selectNextResearchQuestion(${at}.outcome).selected.kind`,
        value: selection.selected.kind,
      });
    }
  });

  return entries;
}

/** The kinds this session actually produced, in first-appearance order. */
export function traceShape(entries: readonly TraceEntry[]): readonly TraceElementKind[] {
  const seen: TraceElementKind[] = [];
  for (const entry of entries) if (!seen.includes(entry.kind)) seen.push(entry.kind);
  return seen;
}
