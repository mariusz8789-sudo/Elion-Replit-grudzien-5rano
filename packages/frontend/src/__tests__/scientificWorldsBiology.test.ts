import { describe, expect, it } from 'vitest';
import { BIOLOGY_CATALOG, BIOLOGY_OBSTACLES, BIOLOGY_ROOM, BIOLOGY_SPAWN, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID } from '../core/scientificWorlds/biologyLabWorld';
import { GENESIS_LAB_STATIONS } from '../core/scientificWorlds/humanLab/labStations';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { approachPoint, planPath } from '../core/scientificWorlds/navigationPlanner';
import { createBiologyExperimentRunner, type BiologyExperimentId } from '../core/scientificWorlds/biologyRunners';
import { createExperimentSession, replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { AgentController } from '../core/scientificWorlds/agentController';
import { narrateSession } from '../core/scientificWorlds/narration';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';

const ACCEPTANCE = 'Otwórz wirtualnego człowieka, pokaż mózg, przejdź do Hyperscope, powiększ 5×, a potem zbadaj próbkę przez Orpheus i pokaż mi Evidence.';

describe('biology lab world — the V3 pack contracts, unchanged, on the canonical stack', () => {
  it('keeps every pack station id and position verbatim', () => {
    expect(BIOLOGY_WORLD_ID).toBe('world:genesis-human-biology-lab');
    expect(BIOLOGY_STATIONS.map((s) => s.id)).toEqual(GENESIS_LAB_STATIONS.map((s) => s.stationId));
    for (const s of GENESIS_LAB_STATIONS) {
      const host = BIOLOGY_STATIONS.find((x) => x.id === s.stationId)!;
      expect(host.position).toEqual({ x: s.positionMeters.x, z: s.positionMeters.z });
    }
    expect(BIOLOGY_ROOM).toEqual({ minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
  });
  it('every station is reachable on foot from the spawn point (A* over the same obstacles the scene builds)', () => {
    for (const s of BIOLOGY_STATIONS) {
      const goal = approachPoint(s.position, s.facing, s.standoff);
      const nav = planPath(BIOLOGY_SPAWN.position, goal, BIOLOGY_ROOM, BIOLOGY_OBSTACLES);
      expect(nav.reachable, `${s.id}: ${nav.reason ?? ''}`).toBe(true);
      expect(nav.lengthM).toBeGreaterThan(0.5);
    }
  });
});

describe('biology command bridge — the pack router feeds the canonical WorldCommand bus', () => {
  it('parses the V3 acceptance sentence into the six pack commands, in order, on the pack station ids', () => {
    const parsed = parseBiologyWorldCommands(ACCEPTANCE, 3);
    expect(parsed.unresolved).toEqual([]);
    expect(parsed.commands.map((c) => [c.intent, c.targetEntityId ?? '-'])).toEqual([
      ['NAVIGATE', 'station:human-study'], ['INTERACT', 'station:human-study'],
      ['INTERACT', 'station:human-study'],
      ['NAVIGATE', 'station:microscopy'],
      ['RUN_EXPERIMENT', 'station:microscopy'],
      ['RUN_EXPERIMENT', 'station:orpheus'],
      ['INSPECT', '-'],
    ]);
    expect(parsed.commands[2].parameters).toEqual({ action: 'FOCUS_ANATOMY', focus: 'brain', mode: 'BRAIN' });
    expect(parsed.commands[4].parameters).toEqual({ magnification: 5 });
    expect(parsed.commands[6].parameters).toEqual({ provenance: true, result: true });
    // Deterministic ids; a different logical time gives different ids.
    expect(parseBiologyWorldCommands(ACCEPTANCE, 3).commands.map((c) => c.commandId)).toEqual(parsed.commands.map((c) => c.commandId));
    expect(parseBiologyWorldCommands(ACCEPTANCE, 4).commands[0].commandId).not.toBe(parsed.commands[0].commandId);
    const plan = planActions(parsed.commands, BIOLOGY_CATALOG, null);
    expect(plan.rejected).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'ALIGN', 'REACH', 'INTERACT', 'NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);
  });
  it('reads 25× and 100x, x-ray mode, histology and imaging; unknown clauses fall to the generic parser or stay unresolved', () => {
    expect(parseBiologyWorldCommands('powiększ 25×', 1).commands[0].parameters).toEqual({ magnification: 25 });
    expect(parseBiologyWorldCommands('zoom 100x', 1).commands[0].parameters).toEqual({ magnification: 100 });
    expect(parseBiologyWorldCommands('pokaż rtg', 1).commands[0].parameters).toEqual({ action: 'SET_ANATOMY_MODE', mode: 'XRAY' });
    expect(parseBiologyWorldCommands('przygotuj preparat histologiczny', 1).commands[0]).toMatchObject({ intent: 'RUN_EXPERIMENT', targetEntityId: 'station:histology' });
    expect(parseBiologyWorldCommands('uruchom obrazowanie', 1).commands[0]).toMatchObject({ intent: 'RUN_EXPERIMENT', targetEntityId: 'station:imaging' });
    expect(parseBiologyWorldCommands('idź do konsoli neuro', 1).commands[0]).toMatchObject({ intent: 'NAVIGATE', targetEntityId: 'station:neuro' });
    expect(parseBiologyWorldCommands('bla bla', 1)).toEqual({ commands: [], unresolved: ['bla bla'] });
  });
});

describe('biology runners — pack instruments sealed as canonical sessions on the kernel ledger', () => {
  const runner = createBiologyExperimentRunner(BIOLOGY_WORLD_ID, kernelLedger);
  const ids: readonly BiologyExperimentId[] = ['physiology-state', 'neuro-signals', 'hyperscope-capture', 'histology-slide', 'imaging-frame', 'orpheus-scan'];
  it('every experiment seals, carries ledger hashes, a non-observation status, and replays MATCH', () => {
    for (const id of ids) {
      const { session, artifact } = createExperimentSession({ worldId: BIOLOGY_WORLD_ID, stationId: 'st', experimentId: id, seed: 11, inputs: { magnification: 100 }, logicalTime: 1 }, runner);
      expect(session.evidenceHashes.length, id).toBeGreaterThan(0);
      for (const h of session.evidenceHashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(['MODEL', 'SIMULATION']).toContain(session.epistemicStatus);
      expect(session.epistemicStatus).not.toBe('REAL_OBSERVATION');
      expect(artifact.kind).toBeTruthy();
      const verdict = replayExperimentSession(session, runner);
      expect(verdict.status, id).toBe('MATCH');
      const lines = narrateSession(session, { level: 'AUDITOR', lang: 'pl', includeProvenance: true });
      expect(lines[0].text.length).toBeGreaterThan(20);
      expect(lines[0].text).not.toContain('zakończony');
    }
  });
  it('hyperscope: ≤25× is a digital zoom (RECONSTRUCTION → MODEL), ≥100× a cell model with organelles; magnification is validated', () => {
    const low = runner('hyperscope-capture', 1, { magnification: 5 });
    expect(low.outputs.mode).toBe('DIGITAL_ZOOM'); expect(low.outputs.instrumentLabel).toBe('RECONSTRUCTION'); expect(low.epistemicStatus).toBe('MODEL');
    expect(low.artifact.kind === 'hyperscope' && low.artifact.cell).toBeNull();
    const high = runner('hyperscope-capture', 1, { magnification: 500 });
    expect(high.outputs.mode).toBe('CELL_MODEL'); expect(high.outputs.cellOrganelles).toBe(8);
    expect(runner('hyperscope-capture', 1, { magnification: 7 }).outputs.magnification).toBe(5);
  });
  it('orpheus is deterministic per seed, labelled SIMULATION, and its conceptual-only protocol is ACCESS_RESTRICTED for biosafety', () => {
    const a = runner('orpheus-scan', 5, {}); const b = runner('orpheus-scan', 5, {}); const c = runner('orpheus-scan', 6, {});
    expect(a.outputs).toEqual(b.outputs); expect(a.outputs.outputHash).not.toBe(c.outputs.outputHash);
    expect(a.epistemicStatus).toBe('SIMULATION'); expect(a.outputs.biosafety).toBe('ACCESS_RESTRICTED');
    expect(a.evidenceHashes).toEqual(b.evidenceHashes);
  });
  it('the agent runs the acceptance plan end to end: two interactions at the anatomy table, two sealed sessions, one report', () => {
    const parsed = parseBiologyWorldCommands(ACCEPTANCE, 1);
    const plan = planActions(parsed.commands, BIOLOGY_CATALOG, null);
    const c = new AgentController({ room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, start: BIOLOGY_SPAWN, runner, worldId: BIOLOGY_WORLD_ID, defaultSeed: 7 });
    expect(c.startPlan(plan).ok).toBe(true);
    const interactions: string[] = []; const sealed: string[] = []; let report = null as unknown;
    for (let i = 0; i < 20000 && !report; i++) { const u = c.update(1 / 30); if (u.interaction) interactions.push(String(u.interaction.parameters.action ?? u.interaction.stationId)); if (u.sessionSealed) sealed.push(u.sessionSealed.session.experimentId); if (u.report) report = u.report; }
    expect(interactions).toEqual(['OPEN_TWIN', 'FOCUS_ANATOMY', 'station:microscopy', 'station:orpheus']);
    expect(sealed).toEqual(['hyperscope-capture', 'orpheus-scan']);
    expect(report).toMatchObject({ includeProvenance: true, includeResult: true });
    expect(c.state).toBe('IDLE');
  });
});
