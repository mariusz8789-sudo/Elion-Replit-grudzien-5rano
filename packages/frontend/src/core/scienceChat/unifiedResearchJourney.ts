import {
  executeVirtualLabExperiment,
  getCampaign,
  getVirtualLabDossier,
  listCampaignCandidates,
  listProjects,
  planVirtualLabExperiment,
  replayVirtualLabExperiment,
  runResearchIntake,
  startCampaign,
  type ApiResult,
  type Campaign,
  type CampaignCandidate,
  type ResearchIntakeResponse,
  type VirtualExperimentPlan,
  type VirtualExperimentResult,
  type VirtualExperimentReplay,
  type VirtualLabDossier,
} from '../backend/client';
import {
  getActiveKnowledgeProject,
  setActiveKnowledgeProject,
  type ActiveKnowledgeProject,
} from '../backend/knowledgeProjectContext';

export interface DrugDiscoveryChatRequest {
  sourceText: string;
  researchQuery: string;
}

export type DrugJourneyEvent =
  | { type: 'INTAKE_STARTED' }
  | { type: 'CANDIDATES_FOUND'; count: number }
  | { type: 'CAMPAIGN_STARTED' }
  | { type: 'CAMPAIGN_FINISHED'; count: number }
  | { type: 'EXPERIMENT_STARTED'; candidateIndex: number; candidateCount: number; plan: VirtualExperimentPlan }
  | { type: 'EXPERIMENT_FINISHED'; candidateIndex: number; candidateCount: number; result: VirtualExperimentResult };

export interface PreparedDrugJourney {
  project: ActiveKnowledgeProject;
  request: DrugDiscoveryChatRequest;
  intake: ResearchIntakeResponse;
  campaignId: string;
  candidates: CampaignCandidate[];
}

export interface CandidateExperimentOutcome {
  candidate: CampaignCandidate;
  plan: VirtualExperimentPlan;
  result: VirtualExperimentResult;
  replay: VirtualExperimentReplay | null;
  dossier: VirtualLabDossier;
}

export interface JourneyApi {
  runResearchIntake: typeof runResearchIntake;
  startCampaign: typeof startCampaign;
  getCampaign: typeof getCampaign;
  listCampaignCandidates: typeof listCampaignCandidates;
  planVirtualLabExperiment: typeof planVirtualLabExperiment;
  executeVirtualLabExperiment: typeof executeVirtualLabExperiment;
  replayVirtualLabExperiment: typeof replayVirtualLabExperiment;
  getVirtualLabDossier: typeof getVirtualLabDossier;
}

const DEFAULT_API: JourneyApi = {
  runResearchIntake, startCampaign, getCampaign, listCampaignCandidates,
  planVirtualLabExperiment, executeVirtualLabExperiment, replayVirtualLabExperiment, getVirtualLabDossier,
};

const EDITABLE_ROLES = new Set(['owner', 'admin', 'editor']);

/** Narrowly recognizes an explicit candidate-discovery request and preserves its scientific subject. */
export function drugDiscoveryRequestFromMessage(message: string): DrugDiscoveryChatRequest | null {
  const sourceText = message.trim();
  if (!sourceText) return null;
  const asksForCandidates = /(?:find|discover|identify|propose|screen|znajd[zź]|wyszukaj|odkryj|zaproponuj)[\s\S]{0,80}(?:drug\s+)?candidates?|(?:znajd[zź]|wyszukaj|odkryj|zaproponuj)[\s\S]{0,80}kandydat/i.test(sourceText);
  if (!asksForCandidates) return null;
  const subject = sourceText.match(/(?:\bfor\b|\bagainst\b|\bdla\b|\bna\b)\s+(.+?)[.!?]*$/i)?.[1]?.trim();
  return { sourceText, researchQuery: subject && subject.length > 0 ? subject : sourceText };
}

/** Selects one real editor-capable project and remembers it for the single Chat session. */
export async function resolveResearchProject(token: string): Promise<ApiResult<ActiveKnowledgeProject>> {
  const response = await listProjects(token);
  if (!response.ok) return response;
  const active = getActiveKnowledgeProject();
  const editable = response.data.filter((project) => EDITABLE_ROLES.has(project.role ?? ''));
  const selected = editable.find((project) => project.id === active?.id) ?? editable[0];
  if (!selected) {
    return { ok: false, status: 403, error: 'editable_project_required', message: 'Drug Discovery requires a project where you can run experiments.' };
  }
  setActiveKnowledgeProject(selected);
  return { ok: true, data: { id: selected.id, name: selected.name } };
}

function failMessage<T>(result: ApiResult<T>, fallback: string): string {
  return result.ok ? fallback : result.message;
}

async function waitForCampaign(token: string, projectId: string, campaignId: string, api: JourneyApi, wait: (ms: number) => Promise<void>, maxPolls: number): Promise<Campaign> {
  for (let poll = 0; poll < maxPolls; poll += 1) {
    const response = await api.getCampaign(token, projectId, campaignId);
    if (!response.ok) throw new Error(response.message);
    if (response.data.status === 'completed' || response.data.status === 'cancelled') return response.data;
    await wait(500);
  }
  throw new Error('Candidate discovery is still running on the backend. Reopen this journey to inspect the persisted campaign state.');
}

export async function prepareDrugResearchJourney(input: {
  token: string;
  project: ActiveKnowledgeProject;
  request: DrugDiscoveryChatRequest;
  onEvent?: (event: DrugJourneyEvent) => void;
  api?: JourneyApi;
  wait?: (ms: number) => Promise<void>;
  maxPolls?: number;
}): Promise<PreparedDrugJourney> {
  const api = input.api ?? DEFAULT_API;
  input.onEvent?.({ type: 'INTAKE_STARTED' });
  const intake = await api.runResearchIntake(input.token, input.project.id, {
    originalQuery: input.request.researchQuery,
    maxCandidateBudget: 3,
    prepareCampaignDraft: true,
  });
  if (!intake.ok) throw new Error(intake.message);
  input.onEvent?.({ type: 'CANDIDATES_FOUND', count: intake.data.result.candidateMatrix.length });
  const draft = intake.data.campaignDraft;
  if (!draft?.prepared || !draft.campaignId) {
    throw new Error(draft?.reason ?? intake.data.result.selectionExplanation ?? `Research intake stopped with ${intake.data.result.status}.`);
  }

  const started = await api.startCampaign(input.token, input.project.id, draft.campaignId);
  if (!started.ok) throw new Error(started.message);
  input.onEvent?.({ type: 'CAMPAIGN_STARTED' });
  const campaign = await waitForCampaign(
    input.token,
    input.project.id,
    draft.campaignId,
    api,
    input.wait ?? ((ms) => new Promise((resolve) => window.setTimeout(resolve, ms))),
    input.maxPolls ?? 120,
  );
  if (campaign.status !== 'completed') throw new Error(`Candidate campaign stopped with ${campaign.status}.`);

  const listed = await api.listCampaignCandidates(input.token, input.project.id, draft.campaignId);
  if (!listed.ok) throw new Error(listed.message);
  const eligible = listed.data.filter((candidate) => candidate.valid && candidate.status === 'retained');
  const candidates = (eligible.length > 0 ? eligible : listed.data.filter((candidate) => candidate.valid)).slice(0, 3);
  if (candidates.length === 0) throw new Error('The canonical campaign completed without a valid candidate to test.');
  input.onEvent?.({ type: 'CAMPAIGN_FINISHED', count: candidates.length });
  return { project: input.project, request: input.request, intake: intake.data, campaignId: draft.campaignId, candidates };
}

export async function executeDrugResearchJourney(input: {
  token: string;
  prepared: PreparedDrugJourney;
  onEvent?: (event: DrugJourneyEvent) => void;
  api?: JourneyApi;
}): Promise<CandidateExperimentOutcome[]> {
  const api = input.api ?? DEFAULT_API;
  const outcomes: CandidateExperimentOutcome[] = [];
  for (let index = 0; index < input.prepared.candidates.length; index += 1) {
    const candidate = input.prepared.candidates[index];
    const planned = await api.planVirtualLabExperiment(input.token, input.prepared.project.id, input.prepared.campaignId, {
      candidateId: candidate.id,
      hypothesis: 'The candidate has a reproducible RDKit molecular-descriptor profile suitable for further research prioritization.',
      requestedCapability: 'molecular-descriptors',
    });
    if (!planned.ok) throw new Error(failMessage(planned, 'Experiment planning failed.'));
    input.onEvent?.({ type: 'EXPERIMENT_STARTED', candidateIndex: index, candidateCount: input.prepared.candidates.length, plan: planned.data });

    const executed = await api.executeVirtualLabExperiment(
      input.token,
      input.prepared.project.id,
      input.prepared.campaignId,
      candidate.id,
      planned.data.executionId,
    );
    if (!executed.ok) throw new Error(failMessage(executed, 'Experiment execution failed.'));
    input.onEvent?.({ type: 'EXPERIMENT_FINISHED', candidateIndex: index, candidateCount: input.prepared.candidates.length, result: executed.data.result });

    let replay: VirtualExperimentReplay | null = null;
    if (executed.data.result.status === 'EXECUTED_COMPUTATIONAL_EXPERIMENT') {
      const replayed = await api.replayVirtualLabExperiment(input.token, input.prepared.project.id, input.prepared.campaignId, candidate.id, planned.data.executionId);
      if (!replayed.ok) throw new Error(failMessage(replayed, 'Replay failed.'));
      replay = replayed.data;
    }
    const dossier = await api.getVirtualLabDossier(input.token, input.prepared.project.id, input.prepared.campaignId, candidate.id);
    if (!dossier.ok) throw new Error(failMessage(dossier, 'Could not read the canonical experiment dossier.'));
    outcomes.push({ candidate, plan: planned.data, result: executed.data.result, replay, dossier: dossier.data });
  }
  return outcomes;
}
