import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { describe, expect, it } from 'vitest';
import { runTitrationScenario } from '../labs/experiments/chemistry-titration';
import { createExperimentSession, replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { createLabExperimentRunner } from '../core/scientificWorlds/experimentRunners';
import { LAB_CATALOG, LAB_WORLD_ID } from '../core/scientificWorlds/labWorld';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { titrationCurve, titrationPolyline, titrationRegion } from '../core/scientificWorlds/titrationView';

describe('Scientific Worlds titration station', () => {
  it('routes a bounded acid and dose into the canonical chemistry station', () => {
    const parsed = parseWorldCommands('Podejdź do stanowiska miareczkowania i przeprowadź titrację kwasu octowego, dodając 25 mL NaOH.', LAB_CATALOG, 1);
    expect(parsed.unresolved).toEqual([]);
    expect(parsed.commands.map((command) => command.intent)).toEqual(['NAVIGATE', 'RUN_EXPERIMENT']);
    expect(parsed.commands[1]).toMatchObject({ targetEntityId: 'st-titration', parameters: { acid: 'acetic', vb: 25 } });
  });

  it('seals the exact shared charge-balance result, anchors Evidence and replays MATCH', () => {
    let now = 1;
    const runner = createLabExperimentRunner(LAB_WORLD_ID, new EvidenceLedger({ now: () => now++ }));
    const expected = runTitrationScenario({ acid: 'acetic', vb: 25 });
    const sealed = createExperimentSession({ worldId: LAB_WORLD_ID, stationId: 'st-titration', experimentId: 'chemistry-titration', seed: 7, inputs: { acid: 'acetic', vb: 25 }, logicalTime: 1 }, runner);
    expect(sealed.session.outputs).toEqual(expected);
    expect(sealed.session.engineLabel).toBe('Genesis weak-acid charge-balance titration (shared frontend/backend runner)');
    expect(sealed.session.epistemicStatus).toBe('MODEL');
    expect(sealed.session.evidenceHashes).toHaveLength(1);
    expect(sealed.artifact).toEqual({ kind: 'titration', ...expected });
    expect(replayExperimentSession(sealed.session, runner).status).toBe('MATCH');
  });

  it('keeps the curve secondary and model-derived, with explicit experiment regions', () => {
    const curve = titrationCurve('acetic', 60);
    expect(curve).toHaveLength(61);
    expect(curve[0]).toEqual({ vb: 0, ph: runTitrationScenario({ acid: 'acetic', vb: 0 }).ph });
    expect(curve[25]).toEqual({ vb: 25, ph: runTitrationScenario({ acid: 'acetic', vb: 25 }).ph });
    expect(titrationPolyline('acetic').split(' ')).toHaveLength(61);
    expect([titrationRegion(0, 25), titrationRegion(10, 25), titrationRegion(25, 25), titrationRegion(40, 25)]).toEqual(['START', 'BUFFER', 'EQUIVALENCE', 'EXCESS']);
  });

  it('refuses unsupported chemistry instead of inventing a reaction', () => {
    const runner = createLabExperimentRunner(LAB_WORLD_ID, new EvidenceLedger({ now: () => 1 }));
    expect(() => runner('chemistry-titration', 7, { acid: 'sulfuric', vb: 25 })).toThrow('obsługiwanych słabych kwasów');
    expect(() => runner('chemistry-titration', 7, { acid: 'acetic', vb: 61 })).toThrow('0–60 mL');
  });
});
