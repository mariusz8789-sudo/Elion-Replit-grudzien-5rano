import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HumanExplorerPanel from '../components/HumanExplorerPanel';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import type { LiveDrugRun } from '../core/liveExperiment/liveDrugRun';
import { benchLayoutOf } from '../core/liveExperiment/drugBenchLayout';
import { EPISTEMIC_TAG_PL, UNRESOLVED_LABEL, resolveTwinContext, twinContextCommands, twinContextLines, twinContextRequestFrom, twinContextRoute } from '../core/liveExperiment/twinContext';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { createDefaultAnatomyView } from '../core/scientificWorlds/humanLab/anatomyView';
import { DEFAULT_CUTAWAY } from '../core/three/humanTwinCutaway';
import type { CampaignCandidate } from '../core/backend/client';
import { FinalistFalsificationPanel } from '../components/FinalistFalsificationPanel';
import { DRUG_EFFECT_NOT_COMPUTED_PL, FINALIST_FALSIFICATION_CAVEAT_PL, finalistFalsification } from '../core/liveExperiment/finalistFalsification';

/**
 * E2E OVER THE CANONICAL CAMPAIGN (no browser, no engine): the persisted event shapes the backend
 * writes → the one read model (projectDrugRun) → the bench's own finalist → the run's own target →
 * the documented anatomical association → the twin's own FOCUS_ANATOMY command → the panel the
 * Human Explorer renders. The same ids are carried from the first step to the last, and the
 * negative cases resolve to UNRESOLVED rather than to a guessed organ.
 */
const cand = (id: string, generation: number, smiles: string, parent: string | null, transformation: string | null, status = 'retained', reason: string | null = null): CampaignCandidate => ({
  id, generation, parentSmiles: parent, transformation, canonicalSmiles: smiles, valid: true,
  descriptors: { mw: 493.6 }, objectiveVector: {}, constraintViolations: [], pareto: generation === 1, status, rejectedReason: reason, runIds: [],
});
let seq = 0;
const ev = (type: string, generation: number, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation, type, payload, createdAt: 1000 + seq });

const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';
// 6 candidates → 5 rejected → 1 finalist, as the demo tells it.
const candidates = [
  cand('c0', 0, IMATINIB, null, null),
  cand('c1', 1, `C${IMATINIB}`, IMATINIB, 'add-methyl'),
  cand('c2', 1, `O${IMATINIB}`, IMATINIB, 'add-hydroxyl', 'rejected', 'constraint:mw'),
  cand('c3', 1, `N${IMATINIB}`, IMATINIB, 'add-amine', 'rejected', 'admet:herg'),
  cand('c4', 1, `F${IMATINIB}`, IMATINIB, 'add-fluorine', 'rejected', 'constraint:logp'),
  cand('c5', 1, `Cl${IMATINIB}`, IMATINIB, 'add-chlorine', 'rejected', 'admet:tox'),
];
const target = { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'Tyrosine-protein kinase ABL1, kinase domain', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' };
const events: CampaignEventRecord[] = [
  ev('OBJECTIVE_RECEIVED', 0, {}),
  ev('GENERATION_COMPLETED', 1, {}),
  ev('STOPPING_CONDITION_REACHED', 1, { stopReason: 'BUDGET_EXHAUSTED' }),
  ev('STAGE_RESULT', 1, { stage: 'admet', candidateId: 'c1', reason: 'ADMET_COMPUTED', admetRunId: 'r-admet', endpoints: { hERG: 0.12, BBB: 0.31 } }),
  ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'RECEPTOR_PREPARED', ...target }),
  ev('STAGE_SELECTION', 1, { stage: 'docking', candidateId: 'c1', reason: 'SELECTED_FOR_DOCKING' }),
  ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'LIGAND_PREPARED', candidateId: 'c1', ligandPdbqtSha256: 'd'.repeat(64), atoms: 68 }),
  ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'VINA_STARTED', candidateId: 'c1', targetId: 'ABL1_1IEP', exhaustiveness: 8, seed: 42 }),
  ev('STAGE_RESULT', 1, { stage: 'docking', candidateId: 'c1', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -12.83, runId: 'r-dock', targetId: 'ABL1_1IEP', poseSha256: 'e'.repeat(64) }),
];
const dockingRuns = [{ id: 'r-dock', outputs: { poseSha256: 'e'.repeat(64), pose: { atoms: [['C', 1, 2, 3], ['N', 2, 3, 4]], bonds: [[0, 1, 1.5]] }, pocket: { residues: ['THR315:A', 'MET318:A'], atoms: [['C', 0, 0, 0, 0]] } }, provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' } }];
const state = projectDrugRun({ events, candidates, maxGenerations: 1, jobRunning: false, dockingRuns });
const run: LiveDrugRun = {
  campaignId: 'camp-1', projectId: 'proj-1', phase: 'DONE', state, error: null, durationMs: 1234,
  preregistration: { status: 'FOUND', recordId: 'prereg-1', chainHash: 'f'.repeat(64), check: null, error: null },
  sealed: { status: 'FOUND', recordId: 'session-1', chainHash: 'a'.repeat(64), check: 'MATCH', error: null },
};
const manifest = createHumanDigitalTwinManifest('HDT-TEST');
const renderTwin = (context: ReturnType<typeof resolveTwinContext> | null) => renderToStaticMarkup(
  <HumanExplorerPanel
    manifest={manifest} anatomy={{ ...createDefaultAnatomyView('HDT-TEST'), selectedNodeId: 'heart' }}
    artifact={null} session={null} sessions={[]} busy={false} onCommands={() => {}} nextLogicalTime={() => 1}
    cutaway={DEFAULT_CUTAWAY} onCutaway={() => {}} isolated={[]} onIsolate={() => {}} twinTier="PROXY"
    twinCamera={false} onTwinCamera={() => {}} surface="NORMAL" onSurface={() => {}}
    twinContext={context}
  />,
);

describe('HERO → Human Digital Twin: the finalist reaches the twin with its identity intact', () => {
  const layout = benchLayoutOf(state);
  const finalist = layout.finalists[0];

  it('the bench has exactly one finalist out of six candidates, and it is the docked one', () => {
    expect(state.candidates).toHaveLength(6);
    expect(layout.counts.DISCARD).toBe(4);
    expect(layout.finalists).toHaveLength(1);
    expect(finalist.id).toBe('c1');
    expect(finalist.dockingScore).toBe(-12.83);
  });

  it('the bench link carries the run\'s own ids, and the twin reads back exactly those', () => {
    const route = twinContextRoute({ targetId: state.target!.targetId, campaignId: run.campaignId, candidateId: finalist.id });
    expect(route).toBe('#/human-biology-lab?target=ABL1_1IEP&campaign=camp-1&candidate=c1');
    const request = twinContextRequestFrom(new URLSearchParams(route.split('?')[1]))!;
    expect(request).toEqual({ targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c1' });
  });

  it('resolves finalist → target → documented anatomical association, same candidate and same target as the run', () => {
    const ctx = resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c1' });
    expect(ctx.status).toBe('RESOLVED');
    if (ctx.status !== 'RESOLVED') return;
    expect(ctx.candidate!.id).toBe(finalist.id);
    expect(ctx.candidate!.smiles).toBe(finalist.smiles);
    expect(ctx.target).toEqual(state.target);
    expect(ctx.anatomy.system).toBe('CARDIOVASCULAR');
    expect(ctx.anatomy.basis).toContain('UniProt P00519');
    expect(ctx.sealed).toEqual({ recordId: 'session-1', chainHash: 'a'.repeat(64), check: 'MATCH' });
    expect(ctx.stateHash).toBe(state.stateHash);
  });

  it('moves the existing twin with its own systems-rail command (FOCUS_ANATOMY on the documented system)', () => {
    const ctx = resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c1' });
    const commands = twinContextCommands(ctx, 7);
    expect(commands.map((c) => c.intent)).toEqual(['NAVIGATE', 'INTERACT', 'INSPECT']);
    expect(commands[1].targetEntityId).toBe('station:human-study');
    expect(commands[1].parameters).toMatchObject({ action: 'FOCUS_ANATOMY', focus: 'system:cardiovascular' });
  });

  it('every panel line carries its kind of knowledge, docking and ADMET are model predictions, and no line claims a drug effect', () => {
    const ctx = resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c1' });
    if (ctx.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    const lines = twinContextLines(ctx);
    const byLabel = Object.fromEntries(lines.map((l) => [l.label, l]));
    expect(byLabel['Docking (Vina)']).toMatchObject({ value: '-12.83 kcal/mol', tag: 'MODEL_PREDICTION', source: 'science run r-dock' });
    expect(byLabel['ADMET'].tag).toBe('MODEL_PREDICTION');
    expect(byLabel['Powiązanie z celem'].tag).toBe('TARGET_ASSOCIATION');
    expect(byLabel['Kontekst anatomiczny'].tag).toBe('ANATOMICAL_CONTEXT');
    expect(byLabel['Cel białkowy'].tag).toBe('REAL_MEASUREMENT');
    expect(byLabel['Replay / zapieczętowany rekord']).toMatchObject({ tag: 'PROVENANCE' });
    expect(byLabel['Replay / zapieczętowany rekord'].value).toContain('MATCH');
    expect(byLabel['Efekt leku w tym narządzie'].tag).toBe('NOT_VALIDATED');
    for (const l of lines) if (l.tag !== 'NOT_VALIDATED') expect(`${l.label} ${l.value}`.toLowerCase()).not.toMatch(/lek działa|drug effect|skuteczn/);
    for (const l of lines) expect(EPISTEMIC_TAG_PL[l.tag]).toBeTruthy();
  });

  it('the Human Explorer renders the resolved context with the same ids, the tags, and the attribution untouched', () => {
    const ctx = resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c1' });
    const html = renderTwin(ctx);
    expect(html).toContain('data-testid="human-twin-context"');
    expect(html).toContain('data-status="RESOLVED"');
    expect(html).toContain('data-candidate="c1"');
    expect(html).toContain('data-target="ABL1_1IEP"');
    expect(html).toContain('data-system="CARDIOVASCULAR"');
    expect(html).toContain('data-tag="NOT_VALIDATED"');
    expect(html).toContain('data-tag="MODEL_PREDICTION"');
    expect(html).toContain('-12.83 kcal/mol');
    expect(html).not.toMatch(/lek działa/i);
    expect(html).toContain('Model edukacyjny · bez danych pacjenta');
  });
});

describe('D-148: after the finalist, the bench shows Genesis trying to overturn its own result — for c1 only', () => {
  const renderPanel = (candidateId: string) => renderToStaticMarkup(<FinalistFalsificationPanel run={run} candidateId={candidateId} />);

  it('renders the panel for the docked finalist with the caveat, 13 probe rows, the unknowns and the next experiments', () => {
    const html = renderPanel('c1');
    expect(html).toContain('data-testid="drug-finalist-falsification"');
    expect(html).toContain('data-status="RESOLVED"');
    expect(html).toContain('data-candidate-id="c1"');
    expect(html).toContain(FINALIST_FALSIFICATION_CAVEAT_PL);
    expect(html).toContain('Genesis próbuje obalić własny wynik');
    expect((html.match(/data-testid="drug-finalist-probe"/g) ?? []).length).toBe(13);
    const report = finalistFalsification(run, 'c1');
    if (report.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    for (const p of report.probes) expect(html).toContain(`data-probe="${p.id}" data-verdict="${p.verdict}"`);
    expect(html).toContain(`data-testid="drug-finalist-unknowns" data-count="${report.unknowns.length}"`);
    expect(html).toContain(DRUG_EFFECT_NOT_COMPUTED_PL);
    expect(html).toContain('Dynamika molekularna dla najlepszej pozy');
    expect(html).toContain(`data-state-hash="${state.stateHash}"`);
    // The only mention of success is the caveat denying it; nothing else on the panel claims one or a drug effect.
    expect(html.replace(FINALIST_FALSIFICATION_CAVEAT_PL, '')).not.toMatch(/sukces|lek działa/i);
  });

  it('renders nothing for every other candidate of the same run, and for no run', () => {
    for (const c of state.candidates.filter((c) => c.id !== 'c1')) expect(renderPanel(c.id), c.id).toBe('');
    expect(renderToStaticMarkup(<FinalistFalsificationPanel run={null} candidateId="c1" />)).toBe('');
  });
});

describe('HERO → Human Digital Twin: negative cases resolve to UNRESOLVED, never to a guessed organ', () => {
  it('a target with no documented mapping', () => {
    const other = { ...run, state: { ...state, target: { ...target, targetId: 'XYZ_0000', pdbId: '0000' } } };
    const ctx = resolveTwinContext(other, { targetId: 'XYZ_0000', campaignId: 'camp-1', candidateId: 'c1' });
    expect(ctx).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_VERIFIED_ANATOMICAL_MAPPING', candidateId: 'c1', targetId: 'XYZ_0000' });
    expect(twinContextCommands(ctx, 1)).toEqual([]);
    const html = renderTwin(ctx);
    expect(html).toContain('data-status="UNRESOLVED"');
    expect(html).toContain(UNRESOLVED_LABEL);
    expect(html).not.toContain('data-system=');
  });

  it('a hand-typed target that is not the run\'s target is refused', () => {
    const ctx = resolveTwinContext(run, { targetId: 'OPRM1_5C1M', campaignId: 'camp-1', candidateId: 'c1' });
    expect(ctx).toMatchObject({ status: 'UNRESOLVED', reason: 'TARGET_MISMATCH' });
    expect(twinContextCommands(ctx, 1)).toEqual([]);
  });

  it('a candidate the run does not hold, and a candidate that is not a finalist, are refused', () => {
    expect(resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c99' })).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_CANDIDATE' });
    expect(resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c2' })).toMatchObject({ status: 'UNRESOLVED', reason: 'CANDIDATE_NOT_FINALIST' });
  });

  it('no run in this session, or a different campaign, is NO_RUN — nothing is invented from the route alone', () => {
    expect(resolveTwinContext(null, { targetId: 'ABL1_1IEP', campaignId: 'camp-1', candidateId: 'c1' })).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_RUN' });
    expect(resolveTwinContext(run, { targetId: 'ABL1_1IEP', campaignId: 'camp-2', candidateId: 'c1' })).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_RUN' });
  });

  it('a route naming only a documented target resolves to the association without a candidate', () => {
    const ctx = resolveTwinContext(null, { targetId: 'ABL1_1IEP', campaignId: null, candidateId: null });
    expect(ctx.status).toBe('RESOLVED');
    if (ctx.status === 'RESOLVED') { expect(ctx.candidate).toBeNull(); expect(ctx.anatomy.system).toBe('CARDIOVASCULAR'); }
    expect(resolveTwinContext(null, { targetId: 'XYZ', campaignId: null, candidateId: null })).toMatchObject({ status: 'UNRESOLVED', reason: 'NO_VERIFIED_ANATOMICAL_MAPPING' });
  });
});
