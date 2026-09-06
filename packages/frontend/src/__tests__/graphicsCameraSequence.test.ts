import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../core/three/graphics/cameraRig';
import { CameraSequence } from '../core/three/graphics/cameraSequence';

describe('CameraSequence', () => {
  it('an empty step list is immediately finished', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, []);
    expect(sequence.isFinished).toBe(true);
    expect(sequence.update(1 / 30)).toBeNull();
  });

  it('enters the first step immediately on construction', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [{ request: { intent: 'MACRO', target: [1, 1, 1], targetRadius: 1 } }]);
    expect(sequence.currentIndex).toBe(0);
    expect(sequence.isFinished).toBe(false);
  });

  it('advances to the next step once the rig settles (no hold configured)', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [
      { request: { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 }, cut: true },
      { request: { intent: 'WIDE', target: [5, 0, 0], targetRadius: 1 }, cut: true },
    ]);
    expect(sequence.currentIndex).toBe(0);
    sequence.update(1 / 30); // cut steps settle instantly, so this tick should already advance
    expect(sequence.currentIndex).toBe(1);
  });

  it('honors holdSeconds before advancing, even once settled', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [
      { request: { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 }, cut: true, holdSeconds: 1 },
      { request: { intent: 'WIDE', target: [5, 0, 0], targetRadius: 1 }, cut: true },
    ]);
    sequence.update(0.5); // settled already (cut), but hold not yet elapsed
    expect(sequence.currentIndex).toBe(0);
    sequence.update(0.6); // now past the 1s hold
    expect(sequence.currentIndex).toBe(1);
  });

  it('finishes after the last step settles (plus its hold)', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [{ request: { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 }, cut: true }]);
    sequence.update(1 / 30);
    expect(sequence.isFinished).toBe(true);
    expect(sequence.currentStep).toBeNull();
    expect(sequence.update(1 / 30)).toBeNull(); // no-op once finished, never throws
  });

  it('an eased (non-cut) step takes multiple frames to settle before advancing', () => {
    const rig = new CameraRig(THREE, { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 });
    const sequence = new CameraSequence(rig, [
      { request: { intent: 'WIDE', target: [0, 0, 0], targetRadius: 1 } }, // eased, not cut
      { request: { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 }, cut: true },
    ]);
    sequence.update(0.02); // one small step: nowhere near settled yet
    expect(sequence.currentIndex).toBe(0);
    for (let i = 0; i < 200; i++) sequence.update(0.1);
    expect(sequence.currentIndex).toBe(1); // eventually settles and advances
  });

  it('skip() jumps to the next step immediately, ignoring any remaining hold', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [
      { request: { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 }, cut: true, holdSeconds: 100 },
      { request: { intent: 'WIDE', target: [5, 0, 0], targetRadius: 1 }, cut: true },
    ]);
    sequence.update(0); // settle the cut, but the 100s hold means it would never auto-advance
    expect(sequence.currentIndex).toBe(0);
    sequence.skip();
    expect(sequence.currentIndex).toBe(1);
  });

  it('skip() on the last step finishes the sequence', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [{ request: { intent: 'MACRO', target: [0, 0, 0], targetRadius: 1 } }]);
    sequence.skip();
    expect(sequence.isFinished).toBe(true);
  });

  it('actually drives the rig — the returned transform tracks the current step\'s shot', () => {
    const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
    const sequence = new CameraSequence(rig, [{ request: { intent: 'MACRO', target: [9, 0, 0], targetRadius: 1 }, cut: true }]);
    const transform = sequence.update(1 / 30);
    expect(transform).not.toBeNull();
    expect(transform!.lookAt[0]).toBeCloseTo(9, 5);
  });
});
