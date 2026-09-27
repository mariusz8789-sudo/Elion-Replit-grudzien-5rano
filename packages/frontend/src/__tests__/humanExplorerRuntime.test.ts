import { describe, expect, it } from 'vitest';
import { createHumanDigitalTwinManifest, descendants, organsInSystem, systemsForOrgan } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { createDefaultAnatomyView, isolateAnatomyNode } from '../core/scientificWorlds/humanLab/anatomyView';
import { EXPLORER_ORGANS, explorerCommands, explorerPath, type ExplorerCommandContext, type ScaleLevel } from '../core/scientificWorlds/humanExplorer';
import { AgentController } from '../core/scientificWorlds/agentController';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { BIOLOGY_CATALOG, BIOLOGY_OBSTACLES, BIOLOGY_ROOM, BIOLOGY_SPAWN, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID } from '../core/scientificWorlds/biologyLabWorld';
import { createBiologyExperimentRunner } from '../core/scientificWorlds/biologyRunners';
import { createExperimentSession, replayExperimentSession, type ExperimentSession } from '../core/scientificWorlds/experimentSession';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';

const manifest = createHumanDigitalTwinManifest('HDT-v7-runtime');
const heart = EXPLORER_ORGANS.find((organ) => organ.organId === 'heart')!;
const runner = createBiologyExperimentRunner(BIOLOGY_WORLD_ID, kernelLedger);
const context = (sessions: readonly ExperimentSession[] = [], selectedNodeId = 'heart'): ExplorerCommandContext => ({ manifest, selectedNodeId, sessions, worldId: BIOLOGY_WORLD_ID, seed: 7 });

describe('canonical anatomy semantic relationships', () => {
  it('connects system to organ without changing spatial containment', () => {
    // The aorta joined the atlas with the BodyParts3D pilot (FMA3734) as the cardiovascular system's second organ node.
    expect(organsInSystem(manifest, 'system:cardiovascular').map((node) => node.id)).toEqual(['heart', 'aorta']);
    expect(systemsForOrgan(manifest, 'heart').map((node) => node.id)).toEqual(['system:cardiovascular']);
    expect(manifest.nodes.find((node) => node.id === 'heart')?.parentId).toBe('thorax');
    expect(descendants(manifest, 'thorax').map((node) => node.id)).toContain('heart');
    const view = isolateAnatomyNode(createDefaultAnatomyView(manifest.twinId), 'system:cardiovascular', manifest);
    expect(view.selectedNodeId).toBe('system:cardiovascular');
    expect(view.isolatedNodeIds).toEqual(['heart', 'aorta']);
    expect(isolateAnatomyNode(view, 'body', manifest).isolatedNodeIds).toEqual([]);
    expect(explorerPath(heart, 'organ', manifest).map((node) => node.nodeId)).toEqual(['body', 'system:cardiovascular', 'heart']);
  });

  it('does not fabricate representation confidence or scientific acquisition resolution', () => {
    for (const node of manifest.nodes) {
      expect(node.representation.confidence).toMatchObject({ status: 'UNKNOWN' });
      expect(node.representation.resolution).toMatchObject({ status: 'UNSPECIFIED' });
      expect(node.representation.provenance.source).toBe(manifest.anatomyVersion);
      expect(node.representation.confidence).not.toHaveProperty('value');
      expect(node.representation.resolution).not.toHaveProperty('meters');
    }
  });
});

describe('macro → micro execution and reuse', () => {
  const slide = () => createExperimentSession({ worldId: BIOLOGY_WORLD_ID, stationId: 'station:histology', experimentId: 'histology-slide', seed: 7, inputs: { organId: 'heart', tissue: 'CARDIAC', stage: 'slide' }, logicalTime: 1 }, runner).session;

  it('tissue → cell reuses only a matching intact sealed prerequisite, without returning to the human console', () => {
    const session = slide();
    const commands = explorerCommands(heart, 'cell', 'cell', 2, context([session]));
    expect(commands.map((command) => command.intent)).toEqual(['RUN_EXPERIMENT', 'INSPECT']);
    expect(commands[0]).toMatchObject({ targetEntityId: 'station:microscopy', parameters: { organId: 'heart', tissue: 'CARDIAC', magnification: 100 } });
    const wrongInputs = createExperimentSession({ worldId: BIOLOGY_WORLD_ID, stationId: 'station:histology', experimentId: 'histology-slide', seed: 7, inputs: { organId: 'brain', tissue: 'NEURAL', stage: 'slide' }, logicalTime: 1 }, runner).session;
    const otherSeed = createExperimentSession({ worldId: BIOLOGY_WORLD_ID, stationId: 'station:histology', experimentId: 'histology-slide', seed: 9, inputs: session.inputs, logicalTime: 1 }, runner).session;
    for (const rejected of [wrongInputs, otherSeed, { ...session, contentHash: 'tampered' }]) {
      expect(explorerCommands(heart, 'cell', 'cell', 2, context([rejected])).filter((command) => command.intent === 'RUN_EXPERIMENT')).toHaveLength(2);
    }
  });

  it('executes adjacent 100× and 500× runs at one console without blocking on ALIGN', () => {
    const controller = new AgentController({ room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, start: BIOLOGY_SPAWN, runner, worldId: BIOLOGY_WORLD_ID });
    const commands = explorerCommands(heart, 'organelle', 'organelle', 1);
    expect(controller.startPlan(planActions(commands, BIOLOGY_CATALOG, null)).ok).toBe(true);
    const sessions: ExperimentSession[] = [];
    let report = null;
    for (let frame = 0; frame < 6000 && !report; frame++) {
      const update = controller.update(1 / 30);
      expect(update.blockedReason, JSON.stringify(controller.getDiagnostics())).toBeNull();
      if (update.sessionSealed) sessions.push(update.sessionSealed.session);
      report = update.report;
    }
    expect(report).not.toBeNull();
    expect(sessions.map((session) => [session.experimentId, session.inputs.magnification ?? null])).toEqual([['histology-slide', null], ['hyperscope-capture', 100], ['hyperscope-capture', 500]]);
    expect(controller.state).toBe('IDLE');
    expect(controller.getDiagnostics().simulationSeconds).toBeLessThan(120);
    for (const session of sessions) expect(replayExperimentSession(session, runner).status).toBe('MATCH');
  });

  it.each([1 / 60, 1 / 10, 0.2])('executes the UI ladder with real runners at dt=%s, preserving replay', (dt) => {
    const controller = new AgentController({ room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, start: BIOLOGY_SPAWN, runner, worldId: BIOLOGY_WORLD_ID });
    const sessions: ExperimentSession[] = [];
    let selected = 'body';
    const measurements: { level: ScaleLevel; seconds: number; updates: number }[] = [];
    for (const level of ['body', 'organ_system', 'organ', 'tissue', 'cell', 'organelle', 'molecule'] as const) {
      const before = controller.getDiagnostics();
      const commands = explorerCommands(heart, level, level, sessions.length + 1, context(sessions, selected));
      expect(controller.startPlan(planActions(commands, BIOLOGY_CATALOG, controller.station)).ok).toBe(true);
      let report = null;
      for (let frame = 0; frame < 120 / dt && !report; frame++) {
        const update = controller.update(dt);
        expect(update.blockedReason, `${level}: ${JSON.stringify(controller.getDiagnostics())}`).toBeNull();
        if (update.interaction?.parameters.action === 'FOCUS_ANATOMY') selected = String(update.interaction.parameters.focus);
        if (update.sessionSealed) sessions.push(update.sessionSealed.session);
        report = update.report;
      }
      expect(report, level).not.toBeNull();
      const after = controller.getDiagnostics();
      measurements.push({ level, seconds: after.simulationSeconds - before.simulationSeconds, updates: after.updateCount - before.updateCount });
    }
    expect(sessions.map((session) => session.experimentId)).toEqual(['histology-slide', 'hyperscope-capture', 'hyperscope-capture', 'central-dogma']);
    expect(sessions.at(-1)?.inputs.explorerLevel).toBe('molecule');
    expect(measurements.find((entry) => entry.level === 'cell')!.seconds).toBeLessThan(30);
    for (const session of sessions) expect(replayExperimentSession(session, runner).status).toBe('MATCH');
  });
});
