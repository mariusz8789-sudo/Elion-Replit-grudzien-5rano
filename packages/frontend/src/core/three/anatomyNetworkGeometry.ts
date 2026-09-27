import type * as THREE_NS from 'three';
import type { AnatomyNetwork } from '../scientificWorlds/humanLab/anatomyNetworks';

/**
 * D-135 — ANATOMY NETWORK RENDERER: turns an `AnatomyNetwork` (real graph data, see
 * `humanLab/anatomyNetworks.ts`) into real three.js geometry — a tube per edge (a cylinder, pivoted at
 * its base, oriented and scaled to span its two endpoints) and a marker sphere per hub node.
 * Deterministic: the same network produces the same geometry every time, no randomness. This module
 * owns no anatomy data of its own; it only draws what the graph says.
 */

/**
 * Place a unit cylinder (radius 1, height 1, geometry pivoted at its base so `y: 0..1` spans the
 * shaft) so it runs from `a` to `b`: position at `a`, rotate +Y onto the direction, scale.y to the
 * distance. Exported so the unit test can check the placement math without a renderer.
 */
export function placeCylinderBetween(THREE: typeof THREE_NS, mesh: THREE_NS.Object3D, a: THREE_NS.Vector3, b: THREE_NS.Vector3): number {
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = delta.length();
  mesh.position.copy(a);
  if (length > 1e-6) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  mesh.scale.set(1, length, 1);
  return length;
}

export interface AnatomyNetworkGroup {
  readonly group: THREE_NS.Group;
  /** Edge/hub mesh counts actually drawn — a real, inspectable fact, not a guess from the source data. */
  readonly edgeMeshCount: number;
  readonly hubMeshCount: number;
  dispose(): void;
}

const TINT: Readonly<Record<AnatomyNetwork['kind'], number>> = { VASCULAR: 0xd24a4a, NEURAL: 0xeab96b, LYMPHATIC: 0x6bd9c4 };
const HUB_MARKER_RADIUS_METERS = 0.012;

/**
 * Build the full group for one network: one tube mesh per edge (radius from the edge's own
 * `radiusMeters`, no artistic fudge factor) and one small sphere per hub node. Non-hub waypoints get
 * no marker — they exist only to bend the trunk, matching what `NetworkNode.hub` documents.
 */
export function buildAnatomyNetworkGroup(THREE: typeof THREE_NS, network: AnatomyNetwork): AnatomyNetworkGroup {
  const group = new THREE.Group();
  group.name = `anatomy-network:${network.kind.toLowerCase()}`;
  const color = TINT[network.kind];
  const edgeMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1 });
  const hubMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1 });
  const byId = new Map(network.nodes.map((n) => [n.id, n]));
  const disposables: Array<{ dispose(): void }> = [edgeMat, hubMat];

  let edgeMeshCount = 0;
  for (const edge of network.edges) {
    const from = byId.get(edge.fromId); const to = byId.get(edge.toId);
    if (!from || !to) continue; // A dangling edge is a data bug the module's own validator catches; the renderer never guesses a position.
    const geo = new THREE.CylinderGeometry(edge.radiusMeters, edge.radiusMeters, 1, 8, 1, false);
    geo.translate(0, 0.5, 0); // pivot at the base, so `placeCylinderBetween`'s `position = a, scale.y = length` spans exactly to `b`
    const mesh = new THREE.Mesh(geo, edgeMat);
    mesh.name = `anatomy-network-edge:${edge.id}`;
    mesh.userData.networkEdgeId = edge.id;
    const a = new THREE.Vector3(from.positionMeters.x, from.positionMeters.y, from.positionMeters.z);
    const b = new THREE.Vector3(to.positionMeters.x, to.positionMeters.y, to.positionMeters.z);
    placeCylinderBetween(THREE, mesh, a, b);
    group.add(mesh);
    disposables.push(geo);
    edgeMeshCount += 1;
  }

  let hubMeshCount = 0;
  const hubGeo = new THREE.SphereGeometry(1, 10, 8);
  disposables.push(hubGeo);
  for (const n of network.nodes) {
    if (!n.hub) continue;
    const mesh = new THREE.Mesh(hubGeo, hubMat);
    mesh.name = `anatomy-network-node:${n.id}`;
    mesh.userData.networkNodeId = n.id;
    mesh.position.set(n.positionMeters.x, n.positionMeters.y, n.positionMeters.z);
    mesh.scale.setScalar(HUB_MARKER_RADIUS_METERS);
    group.add(mesh);
    hubMeshCount += 1;
  }

  group.visible = false;
  return {
    group, edgeMeshCount, hubMeshCount,
    dispose() { for (const d of disposables) d.dispose(); },
  };
}
