import { describe, expect, it } from 'vitest';
import { BIOLOGY_CATALOG, BIOLOGY_OBSTACLES, BIOLOGY_ROOM, BIOLOGY_SPAWN, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID } from '../core/scientificWorlds/biologyLabWorld';
import { GENESIS_LAB_STATIONS } from '../core/scientificWorlds/humanLab/labStations';
import { GENESIS_LAB_ROOMS, getStationPlacement } from '../core/scientificWorlds/canonicalLaboratory';
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
  it('keeps every pack station id verbatim; positions now come from the Canonical Laboratory (D-135 integration)', () => {
    expect(BIOLOGY_WORLD_ID).toBe('world:genesis-human-biology-lab');
    // The 9 V3 pack stations, ids verbatim and in pack order, plus 3 host-added Wet Lab stations
    // appended after them (no pack equivalent — the pack never defined a wet-lab program; see
    // WET_LAB_STATION_IDS in biologyLabWorld.ts), plus the Biomedical Intervention Bay (a supplied
    // second package's station, appended last by `appendRegenerativeBayStation`).
    expect(BIOLOGY_STATIONS.map((s) => s.id)).toEqual([
      ...GENESIS_LAB_STATIONS.map((s) => s.stationId),
      'station:wet-sample-prep', 'station:wet-lab-bench', 'station:wet-analytical',
      'station:regenerative-medicine',
    ]);
    // Station ids are verbatim from the pack; their floor positions moved from the old single 20×20
    // room into the seven-room Canonical Laboratory building (`canonicalLaboratory.ts`). The three
    // main-hall consoles (evidence/compute/safety) are the one deliberate exception — routed around
    // the fixed D-134 Twin Chamber footprint instead of the package's own clustered placement; see
    // MAIN_HALL_CONSOLE_OVERRIDE in biologyLabWorld.ts and biologyLabWorldCanonicalIntegration.test.ts
    // for the full placement/reachability coverage.
    const overridden = new Set(['station:evidence', 'station:compute', 'station:safety']);
    for (const s of GENESIS_LAB_STATIONS) {
      const host = BIOLOGY_STATIONS.find((x) => x.id === s.stationId)!;
      if (overridden.has(s.stationId)) continue;
      const placement = getStationPlacement(s.stationId);
      expect(placement, s.stationId).not.toBeNull();
      expect(host.position).toEqual(placement!.position);
    }
    // The canonical building's own footprint (`GenesisCanonicalLaboratory.dimensionsMeters`), not the
    // old pack's 20×20 single room. Z grown to cover the 8th room (`biomedical-bay`, added for the
    // Biomedical Intervention Bay at its true 1:1 scale — see canonicalLaboratory.ts's room comment).
    expect(BIOLOGY_ROOM).toEqual({ minX: -10.4, maxX: 10.4, minZ: -20.8, maxZ: 20.8 });
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
  const ids: readonly BiologyExperimentId[] = ['physiology-state', 'neuro-signals', 'hyperscope-capture', 'histology-slide', 'imaging-frame', 'orpheus-scan', 'central-dogma'];
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
  it('Wet Lab: the agent NAVIGATEs through the real door graph and REACHes/INTERACTs at a host-added physical station ("use the bench" is an INTERACT-verb phrase, no EXECUTE step; the station\'s own chemistry experimentId is exercised end to end in chemistryRunnersCanonicalIntegration.test.ts)', () => {
    const parsed = parseBiologyWorldCommands('Go to the wet lab bench and use the bench.', 1);
    expect(parsed.unresolved).toEqual([]);
    expect(parsed.commands.map((c) => [c.intent, c.targetEntityId])).toEqual([
      ['NAVIGATE', 'station:wet-lab-bench'], ['INTERACT', 'station:wet-lab-bench'],
    ]);
    const plan = planActions(parsed.commands, BIOLOGY_CATALOG, null);
    expect(plan.rejected).toEqual([]);
    expect(plan.steps.map((s) => s.kind)).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT']);

    const c = new AgentController({ room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, start: BIOLOGY_SPAWN, runner, worldId: BIOLOGY_WORLD_ID, defaultSeed: 7 });
    expect(c.startPlan(plan).ok).toBe(true);
    const interactions: string[] = [];
    for (let i = 0; i < 20000 && c.state !== 'IDLE'; i++) { const u = c.update(1 / 30); if (u.interaction) interactions.push(u.interaction.stationId); }
    expect(c.state).toBe('IDLE');
    expect(interactions).toEqual(['station:wet-lab-bench']);
    // The agent actually walked there — real coordinates inside the wet-lab room, not the spawn point.
    const room = GENESIS_LAB_ROOMS.find((r) => r.id === 'wet-lab')!;
    const finalPos = c.pose.position;
    expect(finalPos.x).toBeGreaterThanOrEqual(room.bounds.minX);
    expect(finalPos.x).toBeLessThanOrEqual(room.bounds.maxX);
    expect(finalPos.z).toBeGreaterThanOrEqual(room.bounds.minZ);
    expect(finalPos.z).toBeLessThanOrEqual(room.bounds.maxZ);
  });
  it('central dogma at the compute wall: a DNA sequence in the command is transcribed and translated through the kernel provider; the default ORF is named as such', () => {
    const parsed = parseBiologyWorldCommands('Idź do ściany obliczeniowej i uruchom centralny dogmat dla sekwencji ATGGCCTTATGA.', 1);
    expect(parsed.commands.map((c) => [c.intent, c.targetEntityId])).toEqual([['NAVIGATE', 'station:compute'], ['RUN_EXPERIMENT', 'station:compute']]);
    expect(parsed.commands[1].parameters?.dna).toBe('ATGGCCTTATGA');
    const r = runner('central-dogma', 3, { dna: 'ATGGCCTTATGA' });
    expect(r.outputs).toMatchObject({ peptide: 'MAL', terminated: true, stopCodon: 'UGA', atpNetMin: 30, atpNetMax: 32, sequenceSource: 'command' });
    expect(r.engineLabel).toBe('MOLECULAR_BIOLOGY_TEXTBOOK_MODEL'); expect(r.epistemicStatus).toBe('MODEL');
    expect(runner('central-dogma', 3, {}).outputs.sequenceSource).toBe('default reference ORF');
    expect(() => runner('central-dogma', 3, { dna: 'ATGXYZ' })).toThrow('DNA_SEQUENCE_INVALID');
    const { session } = createExperimentSession({ worldId: BIOLOGY_WORLD_ID, stationId: 'station:compute', experimentId: 'central-dogma', seed: 1, inputs: { dna: 'ATGGCCTTATGA' }, logicalTime: 2 }, runner);
    expect(replayExperimentSession(session, runner).status).toBe('MATCH');
    expect(narrateSession(session, { level: 'EXPLORER', lang: 'pl', includeProvenance: false })[0].text).toContain('peptyd MAL');
  });
});
