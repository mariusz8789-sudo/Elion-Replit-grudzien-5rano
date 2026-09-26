import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SERVER-SIDE SCIENTIFIC MEMORY, from the lab's side (MV-2 / MV-3): the criteria are registered
 * BEFORE the campaign starts, the finished run is sealed afterwards, and an engine replay is sealed as
 * its own additional record. A refusal from the server is carried in the run state, never swallowed.
 *
 * The backend client is faked here so the ORDER of the calls is the assertion — that is the whole
 * point of a preregistration: it cannot be written after the engines have spoken.
 */

const calls: string[] = [];
const captured: { hypothesis: unknown; sessions: Record<string, unknown>[] } = { hypothesis: null, sessions: [] };
let preregResult: { ok: boolean; data?: unknown; error?: string } = {
  ok: true, data: { status: 'REGISTERED', preregistration: { id: 'rec-prereg', chainHash: 'chain-1' } },
};

vi.mock('../core/backend/client', () => ({
  getCampaign: async () => { calls.push('getCampaign'); return { ok: true, data: { objective: 'imatynib', budget: { maxGenerations: 1 } } }; },
  preregisterExperiment: async (_t: string, _p: string, _c: string, hypothesis: unknown) => {
    calls.push('preregisterExperiment'); captured.hypothesis = hypothesis; return preregResult;
  },
  startCampaign: async () => { calls.push('startCampaign'); return { ok: true, data: { jobId: 'job-1' } }; },
  runCampaignStage: async () => { calls.push('runCampaignStage'); return { ok: true, data: { jobId: 'job-2' } }; },
  getProjectJob: async () => ({ ok: true, data: { status: 'completed' } }),
  listCampaignEvents: async () => ({ ok: true, data: [] }),
  listCampaignCandidates: async () => ({ ok: true, data: [] }),
  getScienceRun: async () => ({ ok: false, error: 'not_used' }),
  verifyScienceRun: async () => ({ ok: true, data: { verdict: 'MATCH', originalEngineVersion: 'vina 1.2.7', replayEngineVersion: 'vina 1.2.7', originalOutputHash: 'h1', replayOutputHash: 'h1' } }),
  sealExperimentSession: async (_t: string, _p: string, _c: string, session: Record<string, unknown>) => {
    calls.push('sealExperimentSession'); captured.sessions.push(session);
    return { ok: true, data: { status: 'SEALED', deduped: false, session: { id: `rec-session-${captured.sessions.length}`, chainHash: 'chain-2', preregCheck: 'MATCH' } } };
  },
}));

const { resetDrugHypothesesForTest, getDrugHypothesis } = await import('../core/liveExperiment/drugHypothesis');
const { resetLiveDrugRunsForTest, startLiveDrugRun, replayDrugRunEngines, getLiveDrugRun } = await import('../core/liveExperiment/liveDrugRun');

const start = () => startLiveDrugRun({ token: 't', projectId: 'p1', campaignId: 'c1', subject: 'imatynib', pollMs: 1 });

describe('the live run writes to the server’s scientific memory', () => {
  beforeEach(() => {
    calls.length = 0; captured.sessions.length = 0; captured.hypothesis = null;
    preregResult = { ok: true, data: { status: 'REGISTERED', preregistration: { id: 'rec-prereg', chainHash: 'chain-1' } } };
    resetLiveDrugRunsForTest(); resetDrugHypothesesForTest();
  });

  it('registers the criteria BEFORE the campaign starts, and seals the result after the run', async () => {
    const run = await start();
    expect(calls.indexOf('preregisterExperiment')).toBeGreaterThan(-1);
    expect(calls.indexOf('preregisterExperiment')).toBeLessThan(calls.indexOf('startCampaign'));
    expect(calls.indexOf('sealExperimentSession')).toBeGreaterThan(calls.indexOf('runCampaignStage'));
    expect(run.phase).toBe('DONE');
    expect(run.preregistration).toEqual({ status: 'REGISTERED', recordId: 'rec-prereg', chainHash: 'chain-1', check: null, error: null });
    expect(run.sealed).toEqual({ status: 'SEALED', recordId: 'rec-session-1', chainHash: 'chain-2', check: 'MATCH', error: null });
  });

  it('preregisters the SAME frozen hypothesis the verdict is later judged against', async () => {
    await start();
    const frozen = getDrugHypothesis('c1');
    expect(frozen).not.toBeNull();
    expect((captured.hypothesis as { fingerprint: string }).fingerprint).toBe(frozen!.fingerprint);
    expect((captured.sessions[0] as { hypothesisFingerprint: string }).hypothesisFingerprint).toBe(frozen!.fingerprint);
    expect((captured.sessions[0] as { criteria: { id: string }[] }).criteria.map((c) => c.id).sort())
      .toEqual(frozen!.criteria.map((c) => c.id).sort());
  });

  it('a refused preregistration is carried in the run state, and the run still completes', async () => {
    preregResult = { ok: false, error: 'campaign_already_executed' };
    const run = await start();
    expect(run.preregistration).toEqual({ status: 'REFUSED', recordId: null, chainHash: null, check: null, error: 'campaign_already_executed' });
    expect(run.phase).toBe('DONE');
    expect(calls).toContain('sealExperimentSession');
  });

  it('an engine replay is sealed as its own record, never as an edit of the first one', async () => {
    await start();
    expect(captured.sessions).toHaveLength(1);
    expect(captured.sessions[0]!.engineReplay).toBeNull();
    // no docking run in this fake campaign, so the replay declines instead of inventing one
    expect(await replayDrugRunEngines({ token: 't', projectId: 'p1', campaignId: 'c1' })).toEqual({ error: 'no_docking_run' });
    expect(captured.sessions).toHaveLength(1);
    expect(getLiveDrugRun('c1')?.sealed?.recordId).toBe('rec-session-1');
  });
});
