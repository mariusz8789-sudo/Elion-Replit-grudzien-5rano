import type { SessionInputs } from '../scientificWorlds/experimentSession';
import { planChemistryExperiment } from './planner';
import type { ChemistryExperimentTemplate, ChemistryParams, ChemistryStage, ChemistryStageKind, ChemistryTimelineEvent } from './contracts';

/**
 * The live stage sequence of a lesson:
 * QUESTION → EXPERIMENT_SELECTED → PLAN → SAFETY_CHECK → PREPARATION → STEP… →
 * OBSERVATION → ANALYSIS → RESULT → EXPLANATION → LEARNING_CHECK.
 *
 * For EDUCATIONAL_PROCEDURE_MODEL the playback clock below is deterministic
 * (a function of the stages alone). A COMPUTATIONAL_LIVE run never uses it:
 * its progress is the backend's real execution events.
 */

export const STAGE_ORDER: readonly ChemistryStageKind[] = [
  'QUESTION', 'EXPERIMENT_SELECTED', 'PLAN', 'SAFETY_CHECK', 'PREPARATION', 'STEP', 'OBSERVATION', 'ANALYSIS', 'RESULT', 'EXPLANATION', 'LEARNING_CHECK',
];

/** Playback dwell per stage kind (ms) — pacing for a learner, not a physical duration. */
export const STAGE_DWELL_MS: Readonly<Record<ChemistryStageKind, number>> = {
  QUESTION: 900, EXPERIMENT_SELECTED: 700, PLAN: 1000, SAFETY_CHECK: 900, PREPARATION: 1200, STEP: 1100,
  OBSERVATION: 1300, ANALYSIS: 1200, RESULT: 1000, EXPLANATION: 1200, LEARNING_CHECK: 800,
};

const SAFETY_TEXT = {
  CLASSROOM_SAFE_MODEL: 'CLASSROOM_SAFE_MODEL — lekcja modelowa bezpieczna do pokazania w klasie.',
  TEACHER_REVIEW: 'TEACHER_REVIEW — nauczyciel potwierdził lekcję.',
  BLOCKED_HAZARDOUS: 'BLOCKED_HAZARDOUS',
} as const;

function describeParams(template: ChemistryExperimentTemplate, inputs: SessionInputs): string {
  return template.parameters
    .map((spec) => {
      const value = inputs[spec.key];
      const option = spec.options?.find((o) => o.value === String(value));
      return `${spec.label}: ${option?.label ?? String(value)}${spec.unit ? ` ${spec.unit}` : ''}`;
    })
    .join('; ');
}

/** Wraps an experiment's own stages in the common lesson frame. */
export function frameStages(template: ChemistryExperimentTemplate, inputs: SessionInputs, middle: readonly ChemistryStage[]): readonly ChemistryStage[] {
  const plan = planChemistryExperiment(template.experimentId, inputs as ChemistryParams, { teacherApproved: true });
  const safety = plan.safetyClass ? SAFETY_TEXT[plan.safetyClass] : 'Klasa bezpieczeństwa nieustalona.';
  return [
    { stageId: 'question', kind: 'QUESTION', label: 'Pytanie', detail: template.question },
    { stageId: 'selected', kind: 'EXPERIMENT_SELECTED', label: template.title, detail: describeParams(template, inputs) },
    {
      stageId: 'plan', kind: 'PLAN', label: 'Plan eksperymentu',
      detail: `Protokół ${template.protocol.protocolId}: ${template.protocol.steps.filter((s) => s.type !== 'STOP').map((s) => s.stepId).join(' → ')}. Model: ${template.modelBinding.ref}.`,
    },
    {
      stageId: 'safety', kind: 'SAFETY_CHECK', label: 'Kontrola bezpieczeństwa',
      detail: `${safety} Protokół nie ma urządzeń ani kroków wykonawczych (${template.protocol.safetyConstraints.join(', ')}).`,
    },
    ...middle,
    { stageId: 'explanation', kind: 'EXPLANATION', label: 'Wyjaśnienie', detail: 'Ten sam wynik, opisany na wybranym poziomie: SZKOŁA, STUDIA lub BADANIA.' },
    { stageId: 'learning-check', kind: 'LEARNING_CHECK', label: 'Sprawdź się', detail: `${template.quiz.length} ${template.quiz.length === 1 ? 'pytanie' : 'pytania'} kontrolne.` },
  ];
}

/** Deterministic playback timeline: the same stages always give the same events and offsets. */
export function buildEducationalTimeline(stages: readonly ChemistryStage[]): readonly ChemistryTimelineEvent[] {
  let atMs = 0;
  return stages.map((stage) => {
    const event: ChemistryTimelineEvent = {
      eventId: `stage:${stage.stageId}`,
      stageId: stage.stageId,
      kind: stage.kind,
      label: stage.label,
      detail: stage.detail,
      atMs,
      ...(stage.observation ? { observation: stage.observation } : {}),
    };
    atMs += STAGE_DWELL_MS[stage.kind];
    return event;
  });
}

export function timelineDurationMs(stages: readonly ChemistryStage[]): number {
  return stages.reduce((sum, stage) => sum + STAGE_DWELL_MS[stage.kind], 0);
}

export function visibleEventsAt(events: readonly ChemistryTimelineEvent[], elapsedMs: number): readonly ChemistryTimelineEvent[] {
  return events.filter((event) => event.atMs <= elapsedMs);
}
