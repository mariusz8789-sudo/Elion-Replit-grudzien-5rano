import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createEvidenceFieldVisual } from '../core/three/evidenceFieldVisual';
import { directSw4World } from '../core/worldDirector/sw4WorldDirectorAdapter';
import { buildEvidenceField, evidenceFieldDivergenceFromEvent } from '../core/worldModel/visualization/evidenceField';

const PROMPT = 'Create an SW-4 epidemic city with real SEIR.';

function fixture() {
  return directSw4World(PROMPT);
}

describe('Evidence Field — canonical deterministic scientific visualization', () => {
  it('runs BASELINE and A/B/C on identical generated topology with real deterministic SEIR divergence', () => {
    const baseline = directSw4World(PROMPT, 'BASELINE');
    const variants = (['WORLD_A', 'WORLD_B', 'WORLD_C'] as const)
      .map((branch) => directSw4World(PROMPT, branch));
    const baselineIds = baseline.engine.graph.listEntities().map((entity) => entity.id).sort();

    for (const variant of variants) {
      expect(variant.engine.graph.listEntities().map((entity) => entity.id).sort()).toEqual(baselineIds);
      expect(variant.evidenceField.divergence?.branchId).toBe(variant.comparisonBranch);
      expect(variant.evidenceField.fieldFingerprint).not.toBe(baseline.evidenceField.fieldFingerprint);
      expect(variant.replayStatus).toBe('MATCH');
      expect(variant.renderState.solverId).toBe('epidemic-seir-rk4');
    }
    expect(directSw4World(PROMPT, 'WORLD_A').evidenceField.fieldFingerprint)
      .toBe(variants[0].evidenceField.fieldFingerprint);
  });

  it('same canonical state produces the same topology and fingerprint', () => {
    const a = fixture();
    const b = fixture();
    expect(a.evidenceField.fieldFingerprint).toBe(b.evidenceField.fieldFingerprint);
    expect(a.evidenceField.nodes).toEqual(b.evidenceField.nodes);
    expect(a.evidenceField.edges).toEqual(b.evidenceField.edges);
    expect(a.evidenceField.worldFingerprint).toBe(a.renderState.worldStateFingerprint);
  });

  it('replay MATCH reconstructs the same field fingerprint', () => {
    const world = fixture();
    expect(world.replayStatus).toBe('MATCH');
    expect(world.evidenceField.replayStatus).toBe('MATCH');
    const rebuilt = buildEvidenceField({ engine: world.engine, evidence: world.evidence, quality: 'HIGH' });
    expect(rebuilt.fieldFingerprint).toBe(world.evidenceField.fieldFingerprint);
  });

  it('A/B/C branches share a baseline layout and differ only at the declared real divergence', () => {
    const world = fixture();
    const realEvents = world.evidence.eventLog.filter((event) => event.affectedEntities.length > 0).slice(0, 3);
    expect(realEvents).toHaveLength(3);
    const divergences = realEvents.map((event, index) => evidenceFieldDivergenceFromEvent(world.evidence, event, `WORLD_${'ABC'[index]}`));
    const changedIds = new Set(divergences.flatMap((divergence) => divergence.changedEntityIds));
    const baseline = buildEvidenceField({ engine: world.engine, evidence: world.evidence, branchId: 'BASELINE' });
    const a = buildEvidenceField({ engine: world.engine, evidence: world.evidence, branchId: 'WORLD_A', divergence: divergences[0] });
    const b = buildEvidenceField({ engine: world.engine, evidence: world.evidence, branchId: 'WORLD_B', divergence: divergences[1] });
    const c = buildEvidenceField({ engine: world.engine, evidence: world.evidence, branchId: 'WORLD_C', divergence: divergences[2] });
    const stableIds = baseline.nodes.filter((node) => !changedIds.has(node.id)).map((node) => node.id);
    for (const id of stableIds) {
      const expected = baseline.nodes.find((node) => node.id === id)?.position;
      expect(a.nodes.find((node) => node.id === id)?.position).toEqual(expected);
      expect(b.nodes.find((node) => node.id === id)?.position).toEqual(expected);
      expect(c.nodes.find((node) => node.id === id)?.position).toEqual(expected);
    }
    expect(new Set([a.fieldFingerprint, b.fieldFingerprint, c.fieldFingerprint]).size).toBe(3);
    expect(a.divergence?.eventId).toBe(realEvents[0]?.id);
    expect(a.divergence?.provenanceRef).toBe(world.evidence.scientificContentFingerprint);
  });

  it('quality tiers preserve scientific topology and change only presentation fidelity', () => {
    const world = fixture();
    const low = buildEvidenceField({ engine: world.engine, evidence: world.evidence, quality: 'LOW' });
    const high = buildEvidenceField({ engine: world.engine, evidence: world.evidence, quality: 'HIGH' });
    expect(low.fieldFingerprint).toBe(high.fieldFingerprint);
    expect(low.nodes).toEqual(high.nodes);
    expect(low.edges).toEqual(high.edges);
    expect(low.presentation).not.toEqual(high.presentation);
  });

  it('uses only real bundle references and never promotes the visual field to Evidence', () => {
    const world = fixture();
    const field = world.evidenceField;
    expect(field.evidenceRefs).toEqual([world.evidence.bundleId, world.evidence.scientificContentFingerprint]);
    expect(field.provenanceRefs).toEqual(world.evidence.eventLog.map((event) => event.id).sort());
    expect(field.disclosure).toBe('VISUALIZATION_ONLY_NOT_EVIDENCE');
    expect(field.nodes.some((node) => node.epistemic === 'SIMULATION')).toBe(true);
  });

  it('owns and disposes its GPU geometry/material without a renderer or animation loop', () => {
    const world = fixture();
    const visual = createEvidenceFieldVisual(THREE, world.evidenceField);
    const scene = new THREE.Scene();
    scene.add(visual.root);
    const nodeMesh = visual.root.getObjectByName('evidence-field-nodes') as THREE.InstancedMesh;
    const geometryDispose = vi.spyOn(nodeMesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(nodeMesh.material as THREE.Material, 'dispose');
    visual.dispose();
    expect(visual.root.parent).toBeNull();
    expect(visual.root.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(String(createEvidenceFieldVisual)).not.toContain('WebGLRenderer');
    expect(String(createEvidenceFieldVisual)).not.toContain('requestAnimationFrame');
  });
});
