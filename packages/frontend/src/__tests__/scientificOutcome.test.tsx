import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planChemistryExperiment, replayEducationalRun, runEducationalExperiment, sealExperimentSession } from '../core/chemistryEducation';
import { nextFromCuriosity, outcomeFromChemistryRun, outcomeFromLabSession, outcomeFromResearchIntake } from '../core/product/scientificOutcome';
import type { CycleResult } from '../core/scientificWorlds/curiosityCycle';
import type { ResearchIntakeResult } from '../core/backend/client';
import { NextExperimentPanel, ScientificOutcomePanel } from '../components/ScientificOutcomePanel';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, '..', rel), 'utf8');

const labSession = () => ({ ...sealExperimentSession('exp-titration', { acid: 'hcl' }, { veq: 25, pH: 7 }, 'runTitrationScenario'), evidenceHashes: ['a'.repeat(64)], stationId: 'st-titration' });

const curiosityAwaiting = {
  terminal: 'AWAITING_HUMAN_APPROVAL',
  iterations: [{
    terminal: 'AWAITING_HUMAN_APPROVAL',
    question: { text: 'Czy słaby kwas przesuwa punkt równoważnikowy?' },
    discriminability: { why: 'rozróżnia dwie hipotezy' },
    experiment: { experimentId: 'exp-titration', station: { id: 'st-titration', label: 'Stanowisko miareczkowania' } },
  }],
} as unknown as CycleResult;

const intake = {
  status: 'CANDIDATES_FOUND',
  inputKind: 'DISEASE',
  normalizedResearchQuestion: 'Kandydaci dla A1',
  selectionExplanation: 'Wybrano ze źródeł dołączonych do repo.',
  deterministicFingerprint: 'f'.repeat(64),
  evidenceReferences: ['PMID:1', 'PMID:2'],
  selectedResearchPriorityCandidate: 'cand-1',
  nextExperiment: { requiredNextData: ['IC50'], requiredSpecialistCapability: 'ASSAY_LAB', researchPlanPlaceholder: 'Zmierz IC50 dla cand-1' },
} as unknown as ResearchIntakeResult;

describe('one outcome contract over existing records', () => {
  it('lab: re-states the sealed session, keeps existing test ids, and takes next from the curiosity cycle', () => {
    const session = labSession();
    const view = outcomeFromLabSession(session, null, curiosityAwaiting, 'Stanowisko miareczkowania');
    expect(view.evidence.status).toBe('SEALED_SESSION');
    expect(view.evidence.identifiers.find((i) => i.testId === 'sw-content-hash')?.value).toBe(session.contentHash);
    expect(view.evidence.identifiers.find((i) => i.testId === 'sw-ledger-hash')?.value).toBe(`contentHash ${'a'.repeat(64)}`);
    expect(view.replay).toMatchObject({ status: 'NOT_RUN', available: true });
    expect(view.next).toMatchObject({ source: 'CURIOSITY_CYCLE', action: 'APPROVE_AND_RUN' });
    expect(view.next?.title).toContain('Stanowisko miareczkowania');
  });

  it('lab: no proposal → next is null with a reason, never invented', () => {
    const view = outcomeFromLabSession(labSession(), { status: 'MATCH', message: 'ok' } as never, null);
    expect(view.next).toBeNull();
    expect(view.nextUnavailableReason).toBeTruthy();
    expect(view.replay.status).toBe('MATCH');
    expect(nextFromCuriosity({ terminal: 'DONE', iterations: [{ terminal: 'DONE' }] } as unknown as CycleResult)).toBeNull();
  });

  it('chemistry: an educational run is NOT_EVIDENCE and replays through its own runner', () => {
    const run = runEducationalExperiment(planChemistryExperiment('acid-base-titration'));
    const view = outcomeFromChemistryRun(run, replayEducationalRun(run), 'Vₑq = 25 mL');
    expect(view.evidence.status).toBe('NOT_EVIDENCE');
    expect(view.evidence.reason).toContain('EDUCATIONAL_MODEL_NOT_EVIDENCE');
    expect(view.replay.status).toBe('MATCH');
    expect(view.next).toBeNull();
    expect(view.nextUnavailableReason).toContain('katalogu');
  });

  it('drug discovery: fingerprint + references + the backend’s own next experiment', () => {
    const view = outcomeFromResearchIntake(intake);
    expect(view.evidence.status).toBe('FINGERPRINTED');
    expect(view.evidence.identifiers[0]).toMatchObject({ label: 'Odcisk', value: 'f'.repeat(64) });
    expect(view.replay.available).toBe(false);
    expect(view.next).toMatchObject({ title: 'Zmierz IC50 dla cand-1', source: 'RESEARCH_INTAKE', action: null, requires: ['IC50', 'ASSAY_LAB'] });
  });
});

describe('one panel', () => {
  it('renders evidence, replay and next with the caller’s test ids', () => {
    const view = outcomeFromLabSession(labSession(), { status: 'MATCH', message: 'zgodny' } as never, curiosityAwaiting);
    const html = renderToStaticMarkup(<ScientificOutcomePanel outcome={view} onReplay={() => {}} testIds={{ replay: 'sw-replay', replayStatus: 'sw-replay-verdict' }} nextActions={<button data-testid="sw-curiosity-propose">x</button>} />);
    expect(html).toContain('data-testid="sw-replay"');
    expect(html).toContain('data-testid="sw-replay-verdict"');
    expect(html).toContain('data-status="MATCH"');
    expect(html).toContain('data-testid="sw-content-hash"');
    expect(html).toContain('Następny eksperyment');
    expect(html).toContain('data-testid="sw-curiosity-propose"');
  });

  it('shows why replay / next are unavailable instead of a button', () => {
    const html = renderToStaticMarkup(<ScientificOutcomePanel outcome={outcomeFromResearchIntake(intake)} />);
    expect(html).not.toContain('<button');
    expect(html).toContain('Replay intake');
    const empty = renderToStaticMarkup(<NextExperimentPanel outcome={{ next: null, nextUnavailableReason: 'brak' }} />);
    expect(empty).toContain('data-testid="outcome-next-unavailable"');
  });

  it('is the one Evidence/Replay/Next surface in the Laboratory, Chemistry and Drug Discovery', () => {
    for (const file of ['components/ScientificWorldsScreen.tsx', 'components/ChemistryLiveLabScreen.tsx', 'components/DrugDiscoveryScreen.tsx']) {
      expect(read(file)).toContain('ScientificOutcomePanel');
    }
    expect(read('components/ChemistryLiveLabScreen.tsx')).not.toMatch(/data-testid="chem-replay-status"/);
    expect(read('components/ScientificWorldsScreen.tsx')).not.toMatch(/data-testid="sw-replay-verdict"/);
  });
});
