import { describe, expect, it, vi } from 'vitest';
import type {
  Campaign,
  CampaignCandidate,
  ResearchIntakeResponse,
  VirtualExperimentPlan,
  VirtualExperimentReplay,
  VirtualExperimentResult,
  VirtualLabDossier,
} from '../core/backend/client';
import {
  drugDiscoveryRequestFromMessage,
  executeDrugResearchJourney,
  prepareDrugResearchJourney,
  type JourneyApi,
} from '../core/scienceChat/unifiedResearchJourney';

const candidate = (id: string, smiles: string): CampaignCandidate => ({
  id, generation: 0, parentSmiles: null, transformation: null, canonicalSmiles: smiles,
  valid: true, descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: true,
  status: 'retained', rejectedReason: null, runIds: [],
});

const campaign = { id: 'campaign-1', projectId: 'project-1', status: 'completed' } as unknown as Campaign;
const intake = {
  result: {
    status: 'RESOLVED', candidateMatrix: [{ candidateId: 'source-1' }, { candidateId: 'source-2' }, { candidateId: 'source-3' }],
    selectionExplanation: 'source-backed target candidates',
  },
  campaignDraft: { prepared: true, campaignId: campaign.id, seededCandidateIds: ['source-1', 'source-2', 'source-3'] },
} as unknown as ResearchIntakeResponse;

function api(overrides: Partial<JourneyApi> = {}): JourneyApi {
  return {
    runResearchIntake: vi.fn(async () => ({ ok: true, data: intake })),
    startCampaign: vi.fn(async () => ({ ok: true, data: { campaign, jobId: 'job-1' } })),
    getCampaign: vi.fn(async () => ({ ok: true, data: campaign })),
    listCampaignCandidates: vi.fn(async () => ({ ok: true, data: [candidate('c1', 'CCO'), candidate('c2', 'CCN'), candidate('c3', 'CCC'), candidate('c4', 'CCCl')] })),
    planVirtualLabExperiment: vi.fn(),
    executeVirtualLabExperiment: vi.fn(),
    replayVirtualLabExperiment: vi.fn(),
    getVirtualLabDossier: vi.fn(),
    ...overrides,
  } as JourneyApi;
}

describe('ONE CHAT drug research journey', () => {
  it('routes explicit candidate discovery and extracts the scientific subject', () => {
    expect(drugDiscoveryRequestFromMessage('Find three drug candidates for GLP1R')).toEqual({
      sourceText: 'Find three drug candidates for GLP1R', researchQuery: 'GLP1R',
    });
    expect(drugDiscoveryRequestFromMessage('Wyjaśnij orbitę Ziemi')).toBeNull();
  });

  it('uses governed intake, starts the canonical campaign and exposes only three persisted candidates', async () => {
    const port = api();
    const events: string[] = [];
    const prepared = await prepareDrugResearchJourney({
      token: 'token', project: { id: 'project-1', name: 'Research' },
      request: { sourceText: 'Find candidates for GLP1R', researchQuery: 'GLP1R' },
      api: port, wait: async () => undefined, maxPolls: 2,
      onEvent: (event) => events.push(event.type),
    });
    expect(port.runResearchIntake).toHaveBeenCalledWith('token', 'project-1', {
      originalQuery: 'GLP1R', maxCandidateBudget: 3, prepareCampaignDraft: true,
    });
    expect(port.startCampaign).toHaveBeenCalledWith('token', 'project-1', 'campaign-1');
    expect(prepared.candidates.map((entry) => entry.id)).toEqual(['c1', 'c2', 'c3']);
    expect(events).toEqual(['INTAKE_STARTED', 'CANDIDATES_FOUND', 'CAMPAIGN_STARTED', 'CAMPAIGN_FINISHED']);
  });

  it('plans and executes RDKit, then reads Evidence, replay and nextAction from canonical records', async () => {
    const prepared = {
      project: { id: 'project-1', name: 'Research' }, request: { sourceText: 'x', researchQuery: 'GLP1R' }, intake,
      campaignId: 'campaign-1', candidates: [candidate('c1', 'CCO')],
    };
    const plan = {
      executionId: 'exec-1', inputFingerprint: 'input', campaignId: 'campaign-1', candidateId: 'c1', candidateSmiles: 'CCO',
      hypothesis: 'h', requestedCapability: 'molecular-descriptors', status: 'PLANNED', clinicalEfficacy: 'UNKNOWN', claimBoundary: 'computational',
    } satisfies VirtualExperimentPlan;
    const result = {
      executionId: 'exec-1', campaignId: 'campaign-1', candidateId: 'c1', hypothesis: 'h', requestedCapability: 'molecular-descriptors',
      status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT', scienceRunId: 'run-1', selectedEngine: { toolId: 'rdkit', engineName: 'RDKit', engineVersion: '2026.03.5' },
      derivedOutput: { molecularWeight: 46.07 }, epistemicClassification: 'COMPUTATIONAL_HYPOTHESIS', limitations: [], provenanceRefs: ['science-run:run-1'],
      outputFingerprint: 'output', replayStatus: 'NOT_YET_REPLAYED', reason: null, durationMs: 4, executedAt: '2026-09-24T00:00:00Z', clinicalEfficacy: 'UNKNOWN', claimBoundary: 'computational',
    } satisfies VirtualExperimentResult;
    const replay = { executionId: 'exec-1', scienceRunId: 'run-1', verificationId: 'v1', underlyingVerdict: 'MATCH', replayStatus: 'REPLAY_MATCH', detail: 'same', clinicalEfficacy: 'UNKNOWN', claimBoundary: 'computational' } satisfies VirtualExperimentReplay;
    const dossier = { evidenceLinks: [{ payload: { proposalId: 'proposal-1' } }], executionTimeline: [], nextAction: { action: 'COMPARE_CANDIDATES', reason: 'Compare descriptor profiles.' } } as unknown as VirtualLabDossier;
    const port = api({
      planVirtualLabExperiment: vi.fn(async () => ({ ok: true as const, data: plan })),
      executeVirtualLabExperiment: vi.fn(async () => ({ ok: true as const, data: { result, evidenceProposalId: 'proposal-1' } })),
      replayVirtualLabExperiment: vi.fn(async () => ({ ok: true as const, data: replay })),
      getVirtualLabDossier: vi.fn(async () => ({ ok: true as const, data: dossier })),
    });
    const outcomes = await executeDrugResearchJourney({ token: 'token', prepared, api: port });
    expect(port.planVirtualLabExperiment).toHaveBeenCalledWith('token', 'project-1', 'campaign-1', expect.objectContaining({ candidateId: 'c1', requestedCapability: 'molecular-descriptors' }));
    expect(port.executeVirtualLabExperiment).toHaveBeenCalled();
    expect(port.replayVirtualLabExperiment).toHaveBeenCalled();
    expect(outcomes[0].result.selectedEngine?.engineName).toBe('RDKit');
    expect(outcomes[0].dossier.evidenceLinks).toHaveLength(1);
    expect(outcomes[0].replay?.replayStatus).toBe('REPLAY_MATCH');
    expect(outcomes[0].dossier.nextAction.action).toBe('COMPARE_CANDIDATES');
  });
});

describe('live lab handoff from the ONE chat', () => {
  it('drafts without starting the campaign and hands the lab a station query with the frozen subject', async () => {
    const { draftDrugResearchJourney, liveLabHash } = await import('../core/scienceChat/unifiedResearchJourney');
    const port = api();
    const draft = await draftDrugResearchJourney({ token: 'token', project: { id: 'project-1', name: 'Research' }, request: { sourceText: 'Find candidates for aspirin', researchQuery: 'aspirin' }, api: port });
    expect(port.startCampaign).not.toHaveBeenCalled();
    const hash = liveLabHash(draft);
    expect(hash.startsWith('#/scientific-worlds?')).toBe(true);
    const q = new URLSearchParams(hash.split('?')[1]);
    expect(Object.fromEntries(q)).toEqual({ station: 'st-drug-bench', project: 'project-1', campaign: 'campaign-1', subject: 'aspirin' });
  });
});
