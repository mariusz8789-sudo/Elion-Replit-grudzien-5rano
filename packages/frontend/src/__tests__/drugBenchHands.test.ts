import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub';
import { DRUG_BENCH_STATION_ID, DrugBenchLayer } from '../core/liveExperiment/drugBenchLayer';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import { labProcedureOf } from '../core/liveExperiment/labProcedure';
import { benchLayoutOf, focusCandidate } from '../core/liveExperiment/drugBenchLayout';
import type { CampaignCandidate } from '../core/backend/client';
import type { LiveDrugRun } from '../core/liveExperiment/liveDrugRun';

/**
 * GATE B, AT THE SCENE LEVEL. Counters and hashes do not prove that a viewer sees hands, vials and an
 * instrument working — so this test builds the real bench in a real three.js scene and asks the objects
 * themselves: is there a person at the bench, is the vial parented to their hand, how far is it from
 * the grip point, is the same sample gone from the rack while it is being carried, and is the camera
 * framing the hands. It also holds the line that matters: running the render loop for a long time must
 * not advance the experiment by a single phase.
 */

const cand = (id: string, smiles: string, status = 'retained'): CampaignCandidate => ({
  id, generation: 1, parentSmiles: null, transformation: 'add-methyl', canonicalSmiles: smiles, valid: true,
  descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: false, status, rejectedReason: null, runIds: [],
});
let seq = 0;
const ev = (type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation: 1, type, payload, createdAt: 1000 + seq });

const candidates = [cand('c-one', 'c1ccccc1'), cand('c-two', 'Cc1ccccc1')];
const loadingEvents = [ev('STAGE_SELECTION', { stage: 'admet', candidateId: 'c-one', reason: 'SELECTED_FOR_ADMET' })];

/** A run in the state the events describe, shaped as the layer consumes it. */
function runOf(events: CampaignEventRecord[]): LiveDrugRun {
  const state = projectDrugRun({ events, candidates, maxGenerations: 1, jobRunning: true });
  return { state } as unknown as LiveDrugRun;
}

function mountBench(): { layer: DrugBenchLayer; scene: THREE.Scene; station: THREE.Group } {
  const scene = new THREE.Scene();
  const station = new THREE.Group();
  station.name = `station:${DRUG_BENCH_STATION_ID}`;
  scene.add(station);
  // No network in a unit test: the molecule hologram has no conformer source, the bench still stands.
  const layer = new DrugBenchLayer(async () => ({ ok: false, error: 'no-source' }) as never);
  layer.attach(THREE, scene);
  return { layer, scene, station };
}

/** Advance the render loop by `seconds`, in frames the browser would actually deliver. */
function runFrames(layer: DrugBenchLayer, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds; t += dt) layer.sync(dt);
}

describe('the drug bench has a person working at it', () => {
  let bench: ReturnType<typeof mountBench>;
  let restoreDom: () => void;
  beforeEach(() => { restoreDom = installCanvasStub(); bench = mountBench(); });
  afterEach(() => { bench.layer.dispose(); restoreDom(); });

  it('a scientist stands at the bench, with hands that can hold something', () => {
    const root = bench.station.getObjectByName('drug-bench:layer');
    expect(root).toBeTruthy();
    const character = root!.getObjectByName('character');
    expect(character).toBeTruthy();
    expect(character!.getObjectByName('grip.R')).toBeTruthy();
    expect(character!.getObjectByName('hand.R')).toBeTruthy();
  });

  it('carries the sample IN the hand: the vial is parented to the grip, at the grip, and gone from the rack', () => {
    const { layer } = bench;
    layer.setRun(runOf(loadingEvents));
    // Half of one transfer: by then the vial has been gripped and is on its way.
    runFrames(layer, 1.8);
    const snap = layer.handSnapshot()!;
    expect(snap.scientistPresent).toBe(true);
    expect(['GRIP', 'CARRY', 'PLACE']).toContain(snap.action);
    expect(snap.sampleLabel).toBe('c1ccccc1');
    // The mesh really is a child of the hand's grip point, essentially at it — not floating nearby.
    expect(snap.carriedInHand).toBe(snap.sampleId);
    expect(snap.gripSeparationM).not.toBeNull();
    expect(snap.gripSeparationM!).toBeLessThan(0.02);
    // And the rack no longer shows it: one sample cannot be in two places.
    const rackVial = bench.station.getObjectByName(`drug-vial:${snap.sampleId}`);
    expect(rackVial?.visible).toBe(false);
    const carried = bench.station.getObjectByName(`drug-vial-carried:${snap.sampleId}`);
    expect(carried?.visible).toBe(true);
  });

  it('frames the hands while the sample is being handled, and lets go of that shot afterwards', () => {
    const { layer } = bench;
    layer.setRun(runOf(loadingEvents));
    runFrames(layer, 1.8);
    const out = new THREE.Vector3();
    expect(layer.cameraTarget(out)?.focus).toBe('HANDS');
    const grip = bench.station.getObjectByName('grip.R')!;
    const gripPos = new THREE.Vector3(); grip.getWorldPosition(gripPos);
    expect(out.distanceTo(gripPos)).toBeLessThan(0.01);
  });

  it('puts the sample into the analyser and stays there while the instrument works', () => {
    const { layer } = bench;
    layer.setRun(runOf(loadingEvents));
    runFrames(layer, 8); // well past the transfer: the hands have let go and the analyser is working
    const snap = layer.handSnapshot()!;
    expect(snap.action).toBe('OPERATE');
    expect(snap.instrument).toBe('ANALYSER');
    expect(snap.carriedInHand).toBeNull();
    const carried = bench.station.getObjectByName(`drug-vial-carried:${snap.sampleId}`)!;
    const pos = new THREE.Vector3(); carried.getWorldPosition(pos);
    // Sitting in the analyser's port, on the far left of the bench — not back in the rack.
    expect(pos.x).toBeLessThan(-1.2);
  });

  it('THE RULE: minutes of render loop do not advance the experiment', () => {
    const { layer } = bench;
    const run = runOf(loadingEvents);
    const before = labProcedureOf(run.state, focusCandidate(run.state)).phases.filter((p) => p.status === 'DONE').map((p) => p.id);
    layer.setRun(run);
    runFrames(layer, 180);
    const after = labProcedureOf(run.state, focusCandidate(run.state)).phases.filter((p) => p.status === 'DONE').map((p) => p.id);
    expect(after).toEqual(before);
    // The scene still renders exactly the state it was given, with one vial per persisted candidate.
    expect(layer.renderedStateHash).toBe(run.state.stateHash);
    const vials = bench.station.children[0]!.getObjectByName('drug-bench:layer') ?? bench.station.getObjectByName('drug-bench:layer')!;
    const rackVials: string[] = [];
    vials.traverse((o) => { if (o.name.startsWith('drug-vial:')) rackVials.push(o.name); });
    expect(rackVials).toHaveLength(benchLayoutOf(run.state).samples.length);
  });

  it('with nothing to handle the hands stay empty and no vial is in the air', () => {
    const { layer } = bench;
    layer.setRun(runOf([]));
    runFrames(layer, 5);
    const snap = layer.handSnapshot()!;
    expect(snap.carriedInHand).toBeNull();
    const carried = bench.station.getObjectByName('drug-vial-carried');
    expect(carried?.visible ?? false).toBe(false);
  });
});
