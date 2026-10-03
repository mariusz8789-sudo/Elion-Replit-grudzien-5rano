import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FRONTEND_SRC } from './fixtures/repoPaths';
import { COMMAND_CENTER_BASELINE_SCENARIO_ID, runTemporalMultiverseCommandCenter } from '../core/simulation/scenarioCommandCenter';
import { GOVERNED_PREPAREDNESS_QUESTIONS, resolvePreparednessQuestion } from '../core/simulation/preparednessQuestions';
import { buildMultiverseBranchEvidencePack, proposeNextMultiverseExperiment } from '../core/experimentFabric/multiverseEvidence';
import { verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';
import { mvCode, mvText } from '../components/visual-simulation/multiverseEvidenceText';

/**
 * The WHAT IF? multiverse panel (City 3D) reaches the ported branch → Evidence
 * bridge for its own purpose: a question fixed before running, a pack per world,
 * an RO-Crate round-trip check and the next-experiment proposal.
 */
const params = {
  nAgents: 120, initialInfected: 4, r0: 2.5, infectiousDays: 6, incubationDays: 3, ifr: 0.02,
  contactRadius: 14, transmissionScale: 1, restrictions: 0, isolate: false, mobility: 0.85,
  severeRate: 0.15, closeSchools: false, householdTransmissionScale: 1, seed: 20260817, clockSpeed: 50,
};

describe('panel configuration → Evidence Pack per world', () => {
  const question = GOVERNED_PREPAREDNESS_QUESTIONS.find((entry) => entry.baselineScenarioId === COMMAND_CENTER_BASELINE_SCENARIO_ID)!;
  const resolution = resolvePreparednessQuestion(question.question, question.questionId);
  const preparedness = { questionId: question.questionId, askedText: resolution.askedText, resolutionFingerprint: resolution.resolutionFingerprint };
  const others = (['ISOLATION', 'CONTACT_REDUCTION', 'HEALTHCARE_EXPANSION', 'PROTECT_SENIORS'] as const).filter((id) => id !== question.variantScenarioId).slice(0, 2);
  const multiverse = runTemporalMultiverseCommandCenter([question.variantScenarioId, ...others], params, { preparedness });

  it('the world the question is about gets a pack, with branch context and a matching RO-Crate round trip', () => {
    const result = buildMultiverseBranchEvidencePack(multiverse, 'B');
    expect(result.status).toBe('CREATED');
    expect(result.pack!.multiverseBranchContext!.branchId).toBe('B');
    expect(result.pack!.multiverseBranchContext!.sourceMultiverseFingerprint).toBe(multiverse.multiverseFingerprint);
    expect(verifyEvidencePackRoCrateRoundTrip(result.pack!).status).toBe('MATCH');
  });

  it('a world the question is NOT about is blocked, never given another question’s criterion', () => {
    expect(buildMultiverseBranchEvidencePack(multiverse, 'C').status).toBe('BLOCKED_NOT_COMPARABLE');
  });

  it('without a question chosen before running, no pack is made', () => {
    const plain = runTemporalMultiverseCommandCenter([question.variantScenarioId], params);
    expect(buildMultiverseBranchEvidencePack(plain, 'B').status).toBe('NOT_AVAILABLE');
    expect(proposeNextMultiverseExperiment(plain, 'B').status).toBe('NOT_AVAILABLE');
  });
});

describe('panel wiring and text', () => {
  const panel = readFileSync(join(FRONTEND_SRC, 'components', 'visual-simulation', 'TemporalMultiversePanel.tsx'), 'utf8');

  it('calls the real bridge, round trip and next-experiment on the selected world', () => {
    expect(panel).toMatch(/buildMultiverseBranchEvidencePack\(multiverse, selectedWorld\)/);
    expect(panel).toMatch(/verifyEvidencePackRoCrateRoundTrip\(evidence\.pack\)/);
    expect(panel).toMatch(/proposeNextMultiverseExperiment\(multiverse, selectedWorld\)/);
    expect(panel).toMatch(/temporalDecisionLineage\(multiverse\)/);
    expect(panel).toMatch(/data-testid="multiverse-branch-evidence"/);
  });

  it('labels the worlds as a synthetic DEMO in both languages', () => {
    expect(mvText('demo', 'pl')).toMatch(/DEMO/);
    expect(mvText('demo', 'en')).toMatch(/DEMO/);
    expect(panel).toMatch(/mvText\('demo', locale\)/);
  });

  it('names every evidence status in plain words and keeps unknown codes visible', () => {
    for (const code of ['CREATED', 'BLOCKED_REPLAY', 'BLOCKED_NOT_COMPARABLE', 'NOT_REPRODUCIBLE', 'NOT_AVAILABLE']) {
      expect(mvCode(code, 'pl')).not.toBe(code);
      expect(mvCode(code, 'en')).not.toBe(code);
    }
    expect(mvCode('SOMETHING_NEW', 'en')).toBe('SOMETHING_NEW');
  });
});
