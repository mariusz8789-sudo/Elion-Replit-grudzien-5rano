import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { GenesisMatrixEntry, GenesisMatrixView } from './genesisMatrix';

/**
 * GENESIS NARRATION — the TEXT a Voice Guide reads, never the audio itself.
 *
 * WHAT THIS OWNS AND WHAT IT DOES NOT. This module turns a real
 * `GenesisMatrixView` (already the join over `StrategyRun` + Evidence/Replay,
 * `genesisMatrix.ts`) into plain-language lines about the SCIENCE: what is
 * being tested, what was predicted, what was measured, whether the hypothesis
 * held up, what happens next. It says NOTHING about the physical scene — "walk
 * to the tank", "pour the substance" is `WorldLever.sceneForm.actionLabel`
 * (`worldGoalIntent.ts`), declared per lever by whoever built that world, and
 * this module never invents a physical-world sentence to fill that role. A
 * caller (C2's live scene) composes both: the scene form's action label for
 * what the world shows, this module's lines for what the science means.
 *
 * WHY THIS IS TEXT, NOT AUDIO. `speechSynthesis`/`SpeechSynthesisUtterance`
 * are browser APIs with no meaningful behaviour in a headless test — testing
 * them means testing that the browser API was CALLED, not that the right
 * words were produced. Splitting the concern here means the words themselves
 * are asserted against real `GenesisMatrixView` data, the same discipline the
 * contract itself is held to, and the audio wiring is a thin, separately
 * verified layer on top.
 *
 * WHY EVERY LINE COMES FROM A REAL FIELD. No line here is generic filler
 * ("Interesting result!"). Every number, every hypothesis id, every verdict
 * word is read off `GenesisMatrixEntry`/`GenesisMatrixView`, which are
 * themselves a pure projection of a real `StrategyRun`. A run that produced
 * no prediction narrates no prediction line, rather than inventing one to fill
 * the shape the user's example script suggests — the same discipline that
 * keeps `predicted`/`reference` nullable in the contract itself.
 */

export const GENESIS_NARRATION_CONTRACT_VERSION = '1.0.0';

export type NarrationPhase = 'INTRO' | 'ACTION' | 'PREDICTION' | 'OBSERVATION' | 'VERDICT' | 'NEXT' | 'CAVEAT';

export interface NarrationLine {
  readonly phase: NarrationPhase;
  readonly text: string;
}

const ASSESSMENT_WORDS: Readonly<Record<HypothesisAssessment, string>> = {
  SUPPORTED_WITHIN_PROTOCOL: 'was supported',
  FALSIFIED_WITHIN_PROTOCOL: 'was rejected',
  INCONCLUSIVE: 'could not be settled by this measurement',
  CANDIDATE: 'is a candidate, not yet tested',
};

/**
 * Once per investigation: what Genesis is looking into, and its capability
 * standing — a caveated capability is disclosed to the listener, not silently
 * dropped the way `Admission.caveat` already refuses to let a reader miss it.
 */
export function narrateIntro(view: GenesisMatrixView): readonly NarrationLine[] {
  const lines: NarrationLine[] = [];
  if (view.question) lines.push({ phase: 'INTRO', text: `Investigating: ${view.question}` });
  if (view.refusalReason) {
    lines.push({ phase: 'CAVEAT', text: `Genesis cannot run this: ${view.refusalReason}` });
    return lines;
  }
  if (view.admissionCaveat) lines.push({ phase: 'CAVEAT', text: view.admissionCaveat });
  return lines;
}

/**
 * One round: reasoning, prediction (when the shape produced one), observation
 * (against a control when this shape has a shared one), and a verdict per
 * hypothesis this round judged.
 */
export function narrateRound(entry: GenesisMatrixEntry): readonly NarrationLine[] {
  const lines: NarrationLine[] = [];
  if (entry.why) lines.push({ phase: 'ACTION', text: entry.why });

  for (const verdict of entry.verdicts) {
    if (verdict.predicted !== null) {
      lines.push({ phase: 'PREDICTION', text: `Predicted for "${verdict.hypothesisId}": ${verdict.predicted}.` });
    }
  }

  if (entry.observed !== null) {
    lines.push({
      phase: 'OBSERVATION',
      text:
        entry.reference !== null
          ? `Measured ${entry.observed}, against a control of ${entry.reference}.`
          : `Measured ${entry.observed}.`,
    });
  }

  for (const verdict of entry.verdicts) {
    lines.push({ phase: 'VERDICT', text: `Hypothesis "${verdict.hypothesisId}" ${ASSESSMENT_WORDS[verdict.assessment]}.` });
  }

  return lines;
}

/** Once, after the last round: what Genesis does next, or why it stopped. */
export function narrateNext(view: GenesisMatrixView): readonly NarrationLine[] {
  if (view.nextExperiment) {
    return [{ phase: 'NEXT', text: `Preparing the next experiment: ${view.nextExperiment.action}` }];
  }
  if (view.stopReason) {
    return [{ phase: 'NEXT', text: `Investigation finished: ${view.stopReason}.` }];
  }
  return [];
}

/**
 * The whole script for a completed or in-progress investigation, in order:
 * intro, every round narrated so far, and the closing line once the caller has
 * reached the last one.
 *
 * `upToRoundIndex` lets a caller narrate progressively as `GenesisWorldScreen`'s
 * own `stageRound`/`stageNextRound` advance — pass the round the player has
 * reached, not the whole run at once, so the voice never gets ahead of what is
 * on screen. Omit it to narrate everything (the REPLAY case).
 */
export function narrateInvestigation(view: GenesisMatrixView, upToRoundIndex?: number): readonly NarrationLine[] {
  const lastIndex = upToRoundIndex ?? view.entries.length - 1;
  const lines: NarrationLine[] = [...narrateIntro(view)];
  for (let i = 0; i <= lastIndex && i < view.entries.length; i++) lines.push(...narrateRound(view.entries[i]!));
  if (lastIndex >= view.entries.length - 1) lines.push(...narrateNext(view));
  return lines;
}
