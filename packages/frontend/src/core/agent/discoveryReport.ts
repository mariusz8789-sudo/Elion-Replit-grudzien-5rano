import type { DiscoveryLoopResult } from './discoveryLoop';

/**
 * THE SEARCH, SAID OUT LOUD.
 *
 * The loop produces exactly the account Genesis could not previously give —
 * what was tried, what was refuted, what survived, what was never tested — and
 * without this it stays inside a result object nobody reads. This renders it
 * as plain lines so a chat surface, a CLI or a UI can show the same text and
 * none of them re-derives it differently.
 *
 * It states only what the result contains. There is no summarising model here
 * and nothing is inferred: every line is a field, and a run with no supported
 * mechanism says so rather than promoting the least-refuted one.
 */
export function renderDiscoveryReport(result: DiscoveryLoopResult): string {
  const lines: string[] = [];
  lines.push(`QUESTION: ${result.question}`);
  lines.push(`WORLD: ${result.worldId} (${result.domainId})`);
  lines.push('');

  lines.push(`I ran ${result.rounds.length} experiment${result.rounds.length === 1 ? '' : 's'}.`);
  for (const round of result.rounds) {
    const effect = round.effect === null ? 'no reading' : round.effect.toFixed(5);
    lines.push(
      `  Round ${round.round}: ${round.hypothesisId} at strength ${round.strength} → effect ${effect} → ${round.assessment.assessment}`,
    );
    lines.push(`    why this one: ${round.selectionReason}`);
  }
  lines.push('');

  if (result.bestSupported.length === 0) {
    // Never promote a survivor that does not exist.
    lines.push('SURVIVED: nothing. No declared mechanism met its preregistered criterion.');
  } else {
    lines.push('SURVIVED:');
    for (const belief of result.bestSupported) {
      lines.push(`  ${belief.hypothesisId} — ${belief.confidence}. ${belief.reason}`);
      lines.push(`    observed effects: ${belief.observedEffects.map((e) => e.toFixed(5)).join(', ')}`);
    }
  }
  lines.push('');

  lines.push(result.failedHypotheses.length === 0 ? 'REFUTED: nothing was refuted.' : 'REFUTED:');
  for (const belief of result.failedHypotheses) {
    lines.push(`  ${belief.hypothesisId} — ${belief.confidence}. ${belief.reason}`);
  }
  lines.push('');

  lines.push(result.unresolvedQuestions.length === 0 ? 'STILL UNKNOWN: nothing outstanding.' : 'STILL UNKNOWN:');
  for (const question of result.unresolvedQuestions) lines.push(`  ${question}`);
  lines.push('');

  lines.push(`STOPPED BECAUSE: ${result.stopReason}`);
  lines.push('');
  lines.push('THIS SEARCH DID NOT MODEL:');
  for (const factor of result.notModelledFactors) lines.push(`  ${factor}`);
  lines.push('');
  lines.push('ASSUMPTIONS DECLARED BEFORE THE RUN:');
  for (const assumption of result.declaredAssumptions) lines.push(`  ${assumption}`);
  lines.push('');
  // The verdicts are about the model. Saying so once, at the end, where a
  // reader of the report cannot miss it.
  lines.push(
    'Every verdict above is a statement about this model, not about the world: the mechanisms were declared by the ' +
    'caller, and the criteria were written before the runs. A mechanism that survived here has not been validated ' +
    'against measurements.',
  );
  return lines.join('\n');
}
