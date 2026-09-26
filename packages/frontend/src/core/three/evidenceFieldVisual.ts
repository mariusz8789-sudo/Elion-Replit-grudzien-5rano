import type * as THREE_NS from 'three';
import type { EvidenceFieldDescriptor } from '../worldModel/visualization/evidenceField';
import { disposeSceneResources } from './graphics/lifecycle';

export interface EvidenceFieldVisualHandle {
  readonly root: THREE_NS.Group;
  readonly summary: {
    readonly fieldFingerprint: string;
    readonly nodeCount: number;
    readonly edgeCount: number;
    readonly replayStatus: string;
    readonly disclosure: 'VISUALIZATION_ONLY_NOT_EVIDENCE';
  };
  dispose(): void;
}

const COLOR = {
  DIRECT_STATE: 0x7ee7ff,
  DERIVED_MODEL: 0xb7d27a,
  SIMULATION: 0xffb14f,
  VISUAL_CONTEXT_ONLY: 0x718096,
} as const;

/** Presentation-only Three.js layer; it owns no renderer, loop, or scientific state. */
export function createEvidenceFieldVisual(
  THREE: typeof THREE_NS,
  descriptor: EvidenceFieldDescriptor,
): EvidenceFieldVisualHandle {
  const root = new THREE.Group();
  root.name = `evidence-field:${descriptor.worldId}`;
  root.userData = {
    fieldFingerprint: descriptor.fieldFingerprint,
    replayStatus: descriptor.replayStatus,
    disclosure: descriptor.disclosure,
  };

  const geometry = new THREE.IcosahedronGeometry(0.12, descriptor.presentation.pointDetail);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
  });
  const nodes = new THREE.InstancedMesh(geometry, material, descriptor.nodes.length);
  nodes.name = 'evidence-field-nodes';
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  descriptor.nodes.forEach((node, index) => {
    const size = (node.changed ? 0.34 : 0.18) + node.magnitude * 0.16;
    matrix.compose(
      new THREE.Vector3(...node.position),
      new THREE.Quaternion(),
      new THREE.Vector3(size, size, size),
    );
    nodes.setMatrixAt(index, matrix);
    color.setHex(node.changed ? 0xff4d7d : COLOR[node.epistemic]);
    nodes.setColorAt(index, color);
  });
  nodes.instanceMatrix.needsUpdate = true;
  if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
  root.add(nodes);

  const positions = new Map(descriptor.nodes.map((node) => [node.id, node.position] as const));
  const linePositions: number[] = [];
  for (const edge of descriptor.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    linePositions.push(...from, ...to);
  }
  if (linePositions.length > 0) {
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: descriptor.replayStatus === 'DRIFT' ? 0xff416c : 0x66c9ff,
      transparent: true,
      opacity: descriptor.presentation.lineOpacity,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    lines.name = 'evidence-field-relationships';
    root.add(lines);
  }

  return {
    root,
    summary: {
      fieldFingerprint: descriptor.fieldFingerprint,
      nodeCount: descriptor.nodes.length,
      edgeCount: descriptor.edges.length,
      replayStatus: descriptor.replayStatus,
      disclosure: descriptor.disclosure,
    },
    dispose() {
      root.parent?.remove(root);
      disposeSceneResources(root);
      root.clear();
    },
  };
}

