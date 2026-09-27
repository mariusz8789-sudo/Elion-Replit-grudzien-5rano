import { describe, expect, it } from 'vitest';
import { BIOLOGY_CATALOG, BIOLOGY_OBSTACLES, BIOLOGY_ROOM, BIOLOGY_SPAWN, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID, biologyStation } from '../core/scientificWorlds/biologyLabWorld';
import { GENESIS_LAB_ROOMS, getRoomForStation } from '../core/scientificWorlds/canonicalLaboratory';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';
import { planActions } from '../core/scientificWorlds/actionPlanner';
import { AgentController } from '../core/scientificWorlds/agentController';
import { createExperimentSession, replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { narrateSession } from '../core/scientificWorlds/narration';
import { createCanonicalHumanBiologyExperimentRunner } from '../core/scientificWorlds/humanLab/regenerativeMedicineBayRunnerIntegration';
import { CHEMISTRY_EXPERIMENTS, createChemistryExperimentRunner, isChemistryExperiment } from '../core/scientificWorlds/chemistryRunners';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { chemistryAdapter } from '@genesis/core/chemistry/chemistryKnowledgeAdapter.js';

/**
 * Genesis Chemistry v0.2.1's `ChemistryKnowledgeAdapter` wired in as the canonical
 * ExperimentSession provider for the three existing Wet Lab stations — the exact
 * pipeline every other domain uses: WorldCommand -> ActionPlan -> AgentController ->
 * ExperimentSession -> Observation -> Evidence Ledger. No new engine, world, or
 * session type: `createChemistryExperimentRunner` is one more `ExperimentRunner`
 * composed into the SAME `createCanonicalHumanBiologyExperimentRunner` the
 * Biomedical Bay already extended.
 */
describe('chemistry runner — wired as the canonical ExperimentSession provider', () => {
  const ledger = new EvidenceLedger({ now: () => Date.now() });
  const runner = createChemistryExperimentRunner(BIOLOGY_WORLD_ID, ledger);

  it('every chemistry experiment seals, carries real ledger hashes, a non-observation status, and replays MATCH', () => {
    for (const id of CHEMISTRY_EXPERIMENTS) {
      const { session, artifact } = createExperimentSession({ worldId: BIOLOGY_WORLD_ID, stationId: 'st', experimentId: id, seed: 3, inputs: {}, logicalTime: 1 }, runner);
      expect(session.evidenceHashes.length, id).toBeGreaterThan(0);
      for (const h of session.evidenceHashes) expect(h).toMatch(/^[0-9a-f]{64}$/);
      expect(session.epistemicStatus, id).not.toBe('REAL_OBSERVATION');
      expect(session.epistemicStatus, id).not.toBe('VERIFIED_SOURCE');
      expect(artifact.kind).toBeTruthy();
      const verdict = replayExperimentSession(session, runner);
      expect(verdict.status, id).toBe('MATCH');
      const lines = narrateSession(session, { level: 'AUDITOR', lang: 'pl', includeProvenance: true });
      expect(lines[0].text.length).toBeGreaterThan(10);
    }
  });

  it('sample identification: a known compound resolves through the real adapter, an unregistered formula still parses', () => {
    const known = runner('chemistry-sample-identification', 1, { formula: 'w-h2so4' });
    expect(known.outputs.formula).toBe('H2SO4');
    expect(known.outputs.compoundId).toBe('w-h2so4');
    expect(known.outputs.molarMass).toBeCloseTo(chemistryAdapter.getCompound('w-h2so4')!.molarMass, 2);
    const unregistered = runner('chemistry-sample-identification', 1, { formula: 'KMnO4' });
    expect(unregistered.outputs.compoundId).toBe('unregistered');
    expect(unregistered.outputs.molarMass).toBeGreaterThan(0);
    expect(runner('chemistry-sample-identification', 1, {}).outputs.formula).toBe('H2O');
  });

  it('reaction balance: a real registered reaction validates through the real balanceCheck, an unknown id throws', () => {
    const r = runner('chemistry-reaction-balance', 1, { reactionId: 'R01' });
    expect(r.outputs.atomsOk).toBe(true);
    expect(r.outputs.chargeOk).toBe(true);
    expect(() => runner('chemistry-reaction-balance', 1, { reactionId: 'NOT-A-REACTION' })).toThrow('UNKNOWN_REACTION');
  });

  it('elemental analysis: mass fractions sum to 1 and use the real standard atomic weights', () => {
    const a = runner('chemistry-elemental-analysis', 1, { formula: 'H2SO4' });
    expect(a.outputs.elementCount).toBe(3);
    const total = (a.outputs.massFraction_H as number) + (a.outputs.massFraction_S as number) + (a.outputs.massFraction_O as number);
    expect(total).toBeCloseTo(1, 3);
  });

  it('molecular docking: reuses the real chemistryKnowledgeAdapter compound SMILES by default, real receptor properties participate, and it seals through this SAME ledger (D-137)', () => {
    const r = runner('chemistry-molecular-docking', 1, {});
    expect(r.outputs.ligandSmiles).toBe(chemistryAdapter.getCompound('w-h2so4')!.smiles);
    expect(r.outputs.bindingScore).toBeGreaterThanOrEqual(0);
    expect(r.outputs.bindingScore).toBeLessThanOrEqual(100);
    expect(r.epistemicStatus).toBe('SIMULATION');
    expect(r.evidenceHashes).toHaveLength(1);
    // Deterministic docking (no seed dependence) may dedupe against an identical claim already sealed
    // by the loop test above — a real ledger's content-addressing, not a bug — so verify the hash is
    // actually a live record on THIS SAME ledger rather than asserting the active count grew.
    expect(ledger.getActive().some((rec) => rec.contentHash === r.evidenceHashes[0])).toBe(true);
    expect(r.artifact.kind).toBe('chemistry-docking');

    const kinase = runner('chemistry-molecular-docking', 1, { receptorId: 'receptor:kinase-atp-pocket-illustrative' });
    const nuclear = runner('chemistry-molecular-docking', 1, { receptorId: 'receptor:nuclear-hormone-illustrative' });
    // Same ligand, different receptor -> different score: chargeProfile/hydrophobicity/geometry actually participate, not decorative fields.
    expect(kinase.outputs.bindingScore).not.toBe(nuclear.outputs.bindingScore);

    const deterministic = runner('chemistry-molecular-docking', 1, {});
    expect(deterministic.outputs).toEqual(r.outputs);
  });

  it('pharmacokinetics: the DockingResult flows through into the PK model, and the real physiology seam is used (D-137)', () => {
    const before = ledger.getActive().length;
    const r = runner('chemistry-pharmacokinetics', 5, { timeSeconds: 90, activity: 0.3 });
    expect(r.epistemicStatus).toBe('SIMULATION');
    expect(r.evidenceHashes).toHaveLength(1);
    expect(ledger.getActive().length).toBeGreaterThan(before);
    expect(r.artifact.kind).toBe('chemistry-pharmacokinetics');
    expect(r.outputs.halfLifeHours).toBeGreaterThan(0);
    expect(r.outputs.cMaxProxyMgL).toBeGreaterThan(0);

    const docking = runner('chemistry-molecular-docking', 5, {});
    expect(r.outputs.dockingBindingScore).toBe(docking.outputs.bindingScore);
    expect(r.outputs.dockingAffinityProxyKcalMol).toBe(docking.outputs.affinityProxyKcalMol);

    const deterministic = runner('chemistry-pharmacokinetics', 5, { timeSeconds: 90, activity: 0.3 });
    expect(deterministic.outputs).toEqual(r.outputs);
  });

  it('pKa lookup: a real PKA_CONTEXT record resolves with its real sourced value, an unknown acid id throws', () => {
    const r = runner('chemistry-pka-lookup', 1, { acidId: 'CH3COOH' });
    expect(r.outputs.pkaValue).toBe(4.76);
    expect(r.outputs.solvent).toBe('water');
    expect(r.outputs.source).toBe('IUPAC/CRC');
    expect(r.epistemicStatus).toBe('MODEL');
    expect(() => runner('chemistry-pka-lookup', 1, { acidId: 'NOT-AN-ACID' })).toThrow('UNKNOWN_PKA_RECORD');
    expect(runner('chemistry-pka-lookup', 1, {}).outputs.acidId).toBe('CH3COOH');
  });

  it('isChemistryExperiment recognizes exactly the chemistry ids, nothing from biology', () => {
    for (const id of CHEMISTRY_EXPERIMENTS) expect(isChemistryExperiment(id)).toBe(true);
    expect(isChemistryExperiment('physiology-state')).toBe(false);
    expect(isChemistryExperiment('regenerative-baseline')).toBe(false);
  });
});

describe('chemistry stations — the real WorldCommand -> ActionPlan -> AgentController -> ExperimentSession -> Evidence Ledger pipeline', () => {
  const ledger = new EvidenceLedger({ now: () => Date.now() });
  const runner = createCanonicalHumanBiologyExperimentRunner(BIOLOGY_WORLD_ID, ledger);

  const CASES: readonly { readonly command: string; readonly stationId: string; readonly experimentId: string }[] = [
    { command: 'Go to sample preparation and run sample identification.', stationId: 'station:wet-sample-prep', experimentId: 'chemistry-sample-identification' },
    { command: 'Go to the wet lab bench and run reaction balance.', stationId: 'station:wet-lab-bench', experimentId: 'chemistry-reaction-balance' },
    { command: 'Go to the analytical bench and run elemental analysis.', stationId: 'station:wet-analytical', experimentId: 'chemistry-elemental-analysis' },
    // D-138: the analytical bench is now a multi-experiment station (the Bay's alias pattern) —
    // these two prove the alias-keyword selection picks the RIGHT one of its now-4 experiment ids.
    { command: 'Go to the analytical bench and run docking.', stationId: 'station:wet-analytical', experimentId: 'chemistry-molecular-docking' },
    { command: 'Go to the analytical bench and run pharmacokinetics.', stationId: 'station:wet-analytical', experimentId: 'chemistry-pharmacokinetics' },
    { command: 'Go to the analytical bench and run pka lookup.', stationId: 'station:wet-analytical', experimentId: 'chemistry-pka-lookup' },
  ];

  for (const { command, stationId, experimentId } of CASES) {
    it(`"${command}" reaches ${stationId} and seals a real ${experimentId} session on the shared Evidence Ledger`, () => {
      const before = ledger.getActive().length;
      const station = biologyStation(stationId)!;
      // Single-experiment stations run their one default; a multi-experiment station (like the
      // analytical bench, D-138) must at least LIST the requested id among its experimentIds —
      // the alias keyword match (extractParameters, worldCommand.ts) is what actually selects it.
      expect(station.experimentId === experimentId || station.experimentIds?.includes(experimentId), stationId).toBe(true);

      const parsed = parseBiologyWorldCommands(command, 1);
      expect(parsed.unresolved).toEqual([]);
      expect(parsed.commands.map((c) => [c.intent, c.targetEntityId])).toEqual([
        ['NAVIGATE', stationId], ['RUN_EXPERIMENT', stationId],
      ]);
      const plan = planActions(parsed.commands, BIOLOGY_CATALOG, null);
      expect(plan.rejected).toEqual([]);
      expect(plan.steps.map((s) => s.kind)).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);

      const controller = new AgentController({ room: BIOLOGY_ROOM, obstacles: BIOLOGY_OBSTACLES, stations: BIOLOGY_STATIONS, start: BIOLOGY_SPAWN, runner, worldId: BIOLOGY_WORLD_ID, defaultSeed: 7 });
      expect(controller.startPlan(plan).ok).toBe(true);
      const sealed: string[] = []; let report: unknown = null;
      for (let i = 0; i < 20000 && !report; i++) {
        const u = controller.update(1 / 30);
        if (u.sessionSealed) sealed.push(u.sessionSealed.session.experimentId);
        if (u.report) report = u.report;
      }
      expect(controller.state).toBe('IDLE');
      expect(sealed).toEqual([experimentId]);
      expect(report).toMatchObject({ includeProvenance: true, includeResult: true });

      // Actually walked into the wet-lab room, not just teleported to the station's coordinates.
      const roomId = getRoomForStation(stationId)!;
      const room = GENESIS_LAB_ROOMS.find((r) => r.id === roomId)!;
      const finalPos = controller.pose.position;
      expect(finalPos.x).toBeGreaterThanOrEqual(room.bounds.minX);
      expect(finalPos.x).toBeLessThanOrEqual(room.bounds.maxX);
      expect(finalPos.z).toBeGreaterThanOrEqual(room.bounds.minZ);
      expect(finalPos.z).toBeLessThanOrEqual(room.bounds.maxZ);

      // The session's evidence hash is a REAL entry on the SAME ledger instance the composite runner was given — not a second, parallel evidence store.
      expect(ledger.getActive().length).toBeGreaterThan(before);
    });
  }
});
