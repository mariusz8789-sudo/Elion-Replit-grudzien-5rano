import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ComputationalExperimentPlayback, experimentPlaybackStages } from '../components/ComputationalExperimentPlayback';
import type { VirtualExperimentPlan, VirtualExperimentReplay, VirtualExperimentResult } from '../core/backend/client';

const plan: VirtualExperimentPlan = {
  executionId: 'exec-1', inputFingerprint: 'input-fp', campaignId: 'c', candidateId: 'candidate', candidateSmiles: 'CCO',
  hypothesis: 'h', requestedCapability: 'molecular-descriptors', status: 'PLANNED', clinicalEfficacy: 'UNKNOWN', claimBoundary: 'computational only',
};
const result: VirtualExperimentResult = {
  executionId: 'exec-1', campaignId: 'c', candidateId: 'candidate', hypothesis: 'h', requestedCapability: 'molecular-descriptors',
  status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT', scienceRunId: 'run-1', selectedEngine: { toolId: 'rdkit', engineName: 'RDKit', engineVersion: '2026.3.6' },
  derivedOutput: { crippenLogP: 1.2, atoms: 3 }, epistemicClassification: 'IN_SILICO_SUPPORT', limitations: [], provenanceRefs: ['run-1'],
  outputFingerprint: 'output-fp', replayStatus: 'NOT_YET_REPLAYED', reason: null, clinicalEfficacy: 'UNKNOWN', claimBoundary: 'computational only',
};
const replay: VirtualExperimentReplay = {
  executionId: 'exec-1', scienceRunId: 'run-1', verificationId: 'verify-1', underlyingVerdict: 'MATCH', replayStatus: 'REPLAY_MATCH',
  detail: 'same output', clinicalEfficacy: 'UNKNOWN', claimBoundary: 'computational only',
};

describe('ComputationalExperimentPlayback', () => {
  it('derives every displayed stage from actual persisted states', () => {
    const stages = experimentPlaybackStages({ plan, result, replay, evidenceProposalCount: 1, executing: false });
    expect(stages.map((stage) => stage.state)).toEqual(['RECORDED', 'RECORDED', 'RECORDED', 'RECORDED', 'RECORDED']);
  });

  it('shows a genuine blocked engine as BLOCKED rather than animating success', () => {
    const blocked: VirtualExperimentResult = { ...result, status: 'BLOCKED_RUNTIME_UNAVAILABLE', scienceRunId: null, selectedEngine: null, derivedOutput: null, epistemicClassification: 'UNKNOWN', outputFingerprint: null, reason: 'runtime unavailable' };
    const stages = experimentPlaybackStages({ plan, result: blocked, replay: null, evidenceProposalCount: 0, executing: false });
    expect(stages.find((stage) => stage.id === 'engine')?.state).toBe('BLOCKED');
    expect(stages.find((stage) => stage.id === 'result')?.state).toBe('BLOCKED');
  });

  it('labels the view as computational and renders only real output facts', () => {
    const html = renderToStaticMarkup(<ComputationalExperimentPlayback plan={plan} result={result} replay={replay} evidenceProposalCount={1} executing={false} />);
    expect(html).toContain('COMPUTATIONAL · NOT WET-LAB TELEMETRY');
    expect(html).toContain('crippenLogP');
    expect(html).toContain('REPLAY_MATCH');
    expect(html).not.toContain('clinical efficacy confirmed');
  });
});
