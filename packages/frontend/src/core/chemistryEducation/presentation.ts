import type { ExperimentSession } from '../scientificWorlds/experimentSession';
import {
  EDUCATIONAL_PROCEDURE_LABEL,
  type ChemistryPresentationLevel,
  type ChemistryQuizQuestion,
  type ChemistryRun,
  type ChemistryRunArtifact,
} from './contracts';

/**
 * ONE run, three depths. Every level reads the same sealed session and the
 * same artifact; a level only chooses which parts to show. Nothing is
 * recomputed per level, so SCHOOL, UNIVERSITY and RESEARCH can never disagree
 * about the result.
 */
export interface ChemistryPresentationSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

export interface ChemistryPresentation {
  readonly level: ChemistryPresentationLevel;
  /** Identity of the one result every level shows. */
  readonly sessionContentHash: string;
  readonly resultSummary: string;
  readonly epistemicLabel: string;
  readonly sections: readonly ChemistryPresentationSection[];
  readonly quiz: readonly ChemistryQuizQuestion[];
}

function artifactOf(run: ChemistryRun): ChemistryRunArtifact | null {
  return run.artifact;
}

function sessionOf(run: ChemistryRun): ExperimentSession | null {
  return run.session;
}

export function presentChemistryRun(run: ChemistryRun, level: ChemistryPresentationLevel): ChemistryPresentation {
  const artifact = artifactOf(run);
  const session = sessionOf(run);
  const template = run.plan.template!;
  const epistemicLabel = run.liveKind === 'EDUCATIONAL_PROCEDURE_MODEL'
    ? EDUCATIONAL_PROCEDURE_LABEL
    : 'COMPUTATIONAL_LIVE — wynik zarejestrowanego silnika backendu (model, nie pomiar laboratoryjny)';
  const sections: ChemistryPresentationSection[] = [];
  const observations = (artifact?.stages ?? []).filter((s) => s.observation);

  if (level === 'SCHOOL') {
    sections.push({ id: 'what-to-notice', title: 'Na co zwrócić uwagę?', body: template.expectedObservations.join(' ') });
    if (artifact) sections.push({ id: 'explanation', title: 'Wyjaśnienie', body: artifact.explanation.school });
  }
  if (level === 'UNIVERSITY' || level === 'RESEARCH') {
    if (artifact?.equation ?? template.equation) sections.push({ id: 'equation', title: 'Równanie / model', body: artifact?.equation ?? template.equation ?? '' });
    if (artifact) sections.push({ id: 'explanation', title: 'Wyjaśnienie', body: artifact.explanation.university });
    sections.push({ id: 'parameters', title: 'Parametry', body: Object.entries(run.plan.params ?? {}).map(([k, v]) => `${k} = ${String(v)}`).join('; ') });
    if (artifact) sections.push({ id: 'assumptions', title: 'Założenia', body: artifact.assumptions.join('; ') });
    sections.push({
      id: 'intermediate', title: 'Wyniki pośrednie',
      body: observations.map((s) => `${s.observation!.label}: ${String(s.observation!.value)}${s.observation!.unit ? ` ${s.observation!.unit}` : ''} [${s.observation!.origin}]`).join('; '),
    });
    sections.push({ id: 'limitations', title: 'Ograniczenia modelu', body: template.limitations.join(' ') });
  }
  if (level === 'RESEARCH') {
    sections.push({ id: 'model', title: 'Model / solver', body: `${template.modelBinding.ref} · wersja ${template.modelBinding.version}${template.modelBinding.backendModelId ? ` · backend ${template.modelBinding.backendModelId}` : ''}` });
    if (session) {
      sections.push({ id: 'raw', title: 'Wynik surowy (zapieczętowany)', body: JSON.stringify(session.outputs) });
      sections.push({ id: 'fingerprints', title: 'Odciski', body: `session ${session.sessionId} · contentHash ${session.contentHash} · replayFingerprint ${session.replayFingerprint}` });
      sections.push({ id: 'provenance', title: 'Pochodzenie', body: `${session.engineLabel} · epistemicStatus ${session.epistemicStatus} · źródła: ${template.sources.join('; ')}` });
    }
    if (run.liveKind === 'COMPUTATIONAL_LIVE') {
      sections.push({ id: 'executions', title: 'Wykonania backendu', body: run.executions.map((e) => `${e.modelId}@${e.modelVersion} runId ${e.runId} T=${e.inputs.temperatureK} K persisted=${String(e.persisted)}`).join('; ') || '—' });
    }
    sections.push({ id: 'evidence', title: 'Evidence', body: `${run.evidence.code}: ${run.evidence.reason}` });
  }

  return {
    level,
    sessionContentHash: session?.contentHash ?? '',
    resultSummary: artifact?.resultSummary ?? '',
    epistemicLabel,
    sections,
    quiz: level === 'SCHOOL' || level === 'UNIVERSITY' ? template.quiz : [],
  };
}
