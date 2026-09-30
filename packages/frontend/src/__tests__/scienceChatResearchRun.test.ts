import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { runResearchRunAction, type ResearchRunAction, type ResearchRunClient } from '../core/scienceChat/researchRunTurn';
import type { ApiResult, ResearchRunExperiment, ResearchRunView } from '../core/backend/client';

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));

const actionOf = (msg: string): ResearchRunAction => {
  const r = resolveCommand(msg, null);
  if (r.action?.type !== 'researchRun') throw new Error(`expected researchRun action for "${msg}", got ${JSON.stringify(r)}`);
  return r.action;
};

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
const fail = (status: number, body: Record<string, unknown>): ApiResult<never> => ({ ok: false, status, error: String(body.error), message: `Błąd serwera (${status}).`, responseBody: body });

const EXPERIMENT: ResearchRunExperiment = {
  experimentId: 'exp-1',
  frozen: { hypothesisId: 'h1', claim: 'Aspirin passes Lipinski.', engineId: 'rdkit', input: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' }, inputHash: 'a'.repeat(64), protocolId: 'p', predictionFingerprint: 'f', preregistrationFingerprint: 'g', criteria: [] },
  execution: { status: 'EXECUTED', engine: { engineId: 'rdkit', engineLabel: 'RDKit', version: '2024.09.1' }, output: { molWt: 180.16 }, inputHash: 'a'.repeat(64), outputHash: 'b'.repeat(64), scienceRunId: 'rr-1', startedAt: 't0', finishedAt: 't1' },
  falsification: { verdict: 'SUPPORTED_WITHIN_PROTOCOL', scope: 'only this protocol', criteria: [] },
  evidence: { evidenceProposalId: 'prop-1', status: 'PROPOSED', publication: 'REQUIRES_HUMAN_APPROVAL' },
  next: { replay: { verdict: 'MATCH', originalOutputHash: 'c'.repeat(16), replayOutputHash: 'c'.repeat(16) }, proposal: { action: 'EXECUTE_NEXT_HYPOTHESIS', hypothesisId: 'h2', engineId: 'rdkit', reason: 'NEXT_EXECUTABLE_HYPOTHESIS_IN_PLAN' }, decidedBy: 'GENESIS_FIXED_RULE' },
};

const view = (over: Partial<ResearchRunView> = {}): ResearchRunView => ({
  researchRunId: 'run-1',
  question: 'Is aspirin drug-like?',
  plan: { hypotheses: [{ hypothesisId: 'h1', claim: 'Aspirin passes Lipinski.', experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit' } }, { hypothesisId: 'h2', claim: 'Aspirin is lipophilic.', experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit' } }] },
  experiments: [],
  nextStep: 'AWAITING_EXECUTION',
  researchState: { chain: { ok: true }, events: [] },
  ...over,
});

function client(overrides: Partial<ResearchRunClient> = {}): ResearchRunClient & { calls: string[] } {
  const calls: string[] = [];
  const base: ResearchRunClient = {
    startResearchRun: async () => { calls.push('start'); return ok({ deduped: false, researchRun: view({ plan: null, nextStep: 'PROPOSE_PLAN' }) }); },
    proposeResearchPlan: async () => { calls.push('plan'); return ok({ deduped: false, researchRun: view() }); },
    executeResearchExperiment: async () => { calls.push('execute'); return ok({ status: 'EXECUTED' as const, deduped: false, experimentId: 'exp-1', experiment: EXPERIMENT, researchRun: view({ experiments: [EXPERIMENT] }) }); },
    getResearchRun: async () => { calls.push('get'); return ok({ researchRun: view({ experiments: [EXPERIMENT] }) }); },
    replayResearchExperiment: async () => { calls.push('replay'); return ok({ experimentId: 'exp-1', verification: { verdict: 'MATCH' as const, originalOutputHash: 'c'.repeat(16), replayOutputHash: 'c'.repeat(16) }, replays: [{ verdict: 'MATCH' as const }, { verdict: 'MATCH' as const }] }); },
  };
  return Object.assign({ ...base, ...overrides }, { calls });
}

const ctx = { token: 'tok', projectId: 'p1', researchRunId: null };

describe('Science Chat `/badanie` → backend ResearchRun', () => {
  it('parses explicit commands only', () => {
    expect(actionOf('/badanie Czy aspiryna spełnia regułę Lipinskiego?')).toEqual({ type: 'researchRun', op: 'start', question: 'Czy aspiryna spełnia regułę Lipinskiego?' });
    expect(actionOf('/eksperyment')).toEqual({ type: 'researchRun', op: 'next' });
    expect(actionOf('/powtórz')).toEqual({ type: 'researchRun', op: 'replay' });
    expect(resolveCommand('/badanie', null).action).toBeUndefined();
    expect(resolveCommand('badanie aspiryny', null).action?.type).not.toBe('researchRun');
  });

  it('question → run → plan → experiment → scoped verdict → Evidence proposal → replay → next experiment', async () => {
    const c = client();
    const turn = await runResearchRunAction(actionOf('/badanie Is aspirin drug-like?'), ctx, c);
    expect(c.calls).toEqual(['start', 'plan', 'execute']);
    expect(turn.researchRunId).toBe('run-1');
    expect(turn.tag).toBe('WYNIK');
    expect(turn.text).toMatch(/propozycja modelu, nie dowód/);
    expect(turn.text).toMatch(/PODTRZYMANA w tym protokole/);
    expect(turn.text).toMatch(/To nie jest prawda naukowa/);
    expect(turn.text).toMatch(/Evidence: PROPOZYCJA — czeka na zatwierdzenie przez człowieka/);
    expect(turn.text).toMatch(/Powtórzenie: ZGODNE/);
    expect(turn.text).toMatch(/Następny eksperyment \(propozycja\): Aspirin is lipophilic\./);
    expect(turn.text).not.toMatch(/\bprawdziw|\btrue\b|potwierdzon/i);
  });

  it('an engine that is not available is shown as BLOCKED, nothing substituted', async () => {
    const c = client({ executeResearchExperiment: async () => fail(503, { error: 'BLOCKED', reason: 'BLOCKED_BY_RUNTIME: RDKit missing', engineId: 'rdkit' }) });
    const turn = await runResearchRunAction(actionOf('/badanie Is aspirin drug-like?'), ctx, c);
    expect(turn.text).toMatch(/BLOCKED — silnik rdkit jest teraz niedostępny \(BLOCKED_BY_RUNTIME: RDKit missing\)\. Nic nie zapisano i niczego nie podmieniono\./);
    expect(turn.tag).toBe('SYSTEM');
    expect(turn.researchRunId).toBe('run-1');
  });

  it('no login or project: BLOCKED, and the backend is not called', async () => {
    const c = client();
    const turn = await runResearchRunAction(actionOf('/badanie x'), { token: null, projectId: null, researchRunId: null }, c);
    expect(turn.text).toMatch(/^BLOCKED/);
    expect(c.calls).toEqual([]);
  });

  it('/eksperyment and /powtórz continue the same run; without one they explain themselves', async () => {
    expect((await runResearchRunAction(actionOf('/eksperyment'), ctx, client())).text).toMatch(/\/badanie/);
    const c = client();
    const next = await runResearchRunAction(actionOf('/eksperyment'), { ...ctx, researchRunId: 'run-1' }, c);
    expect(c.calls).toEqual(['get', 'execute']);
    expect(next.researchRunId).toBe('run-1');
    const replay = await runResearchRunAction(actionOf('/powtórz'), { ...ctx, researchRunId: 'run-1' }, c);
    expect(replay.text).toMatch(/ZGODNE/);
    expect(replay.text).toMatch(/MATCH, MATCH/);
  });

  it('ScienceChat routes the command before the drug and Fabric parsers', () => {
    const source = readFileSync(join(SRC, 'components/ScienceChat.tsx'), 'utf8');
    const research = source.indexOf("researchCommand.action?.type === 'researchRun'");
    expect(research).toBeGreaterThan(0);
    expect(research).toBeLessThan(source.indexOf('drugDiscoveryRequestFromMessage(msg)'));
    expect(research).toBeLessThan(source.indexOf('parseScienceChatMessage(msg)'));
  });
});
