import type * as THREE_NS from 'three';
import { fibonacciSpherePoint, markPremiumPresentation } from './graphics/premiumVisualPolicy';

/**
 * High-density detail primitives for the EXISTING HumanMacroMicroLayer.
 * These functions never choose scientific content; they only decorate the already-selected canonical
 * MODEL object and explicitly label every new form as illustrative presentation geometry.
 */

export function addPremiumOrganSurfaceDetail(
  THREE: typeof THREE_NS,
  rotor: THREE_NS.Group,
  organId: string,
  ellipsoidScale: THREE_NS.Vector3,
): void {
  const root = new THREE.Group();
  root.name = 'organ:premium-surface-detail';
  markPremiumPresentation(root, {
    domain: `HUMAN_ORGAN_${organId}`,
    epistemic: 'MODEL',
    visualAnalogy: 'ILLUSTRATIVE_SURFACE_DETAIL_NOT_MEASURED_VASCULATURE',
  });

  const contourMaterial = new THREE.MeshPhysicalMaterial({
    color: /heart|kidney|liver/i.test(organId) ? 0xd96970 : 0xdca0aa,
    emissive: 0x351218,
    emissiveIntensity: 0.1,
    roughness: 0.42,
    clearcoat: 0.28,
  });
  for (let track = 0; track < 5; track += 1) {
    const points: THREE_NS.Vector3[] = [];
    const phase = track * 1.17;
    for (let segment = 0; segment <= 28; segment += 1) {
      const t = segment / 28;
      const a = (t * Math.PI * 2) + phase;
      const y = Math.sin(a * (1.0 + track * 0.08) + phase) * 0.34;
      const radial = Math.sqrt(Math.max(0.08, 1 - y * y));
      points.push(new THREE.Vector3(
        Math.cos(a) * 0.5 * ellipsoidScale.x * radial * 1.01,
        y * 0.5 * ellipsoidScale.y * 1.01,
        Math.sin(a) * 0.5 * ellipsoidScale.z * radial * 1.01,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 56, 0.0035, 5, false), contourMaterial);
    line.name = `organ:premium-surface-contour:${track}`;
    line.userData.visualAnalogy = 'ILLUSTRATIVE_SURFACE_DETAIL_NOT_MEASURED_VASCULATURE';
    root.add(line);
  }

  const markerCount = 36;
  const markerGeometry = new THREE.SphereGeometry(0.0065, 7, 5);
  const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xf4b0bb, emissive: 0x4b1822, emissiveIntensity: 0.14, roughness: 0.5 });
  const markers = new THREE.InstancedMesh(markerGeometry, markerMaterial, markerCount);
  markers.name = 'organ:premium-surface-landmarks';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < markerCount; index += 1) {
    const p = fibonacciSpherePoint(THREE, index, markerCount);
    dummy.position.set(p.x * 0.505 * ellipsoidScale.x, p.y * 0.505 * ellipsoidScale.y, p.z * 0.505 * ellipsoidScale.z);
    dummy.updateMatrix();
    markers.setMatrixAt(index, dummy.matrix);
  }
  markers.instanceMatrix.needsUpdate = true;
  markers.userData.visualAnalogy = 'DISPLAY_LANDMARKS_NOT_ANATOMICAL_MEASUREMENTS';
  root.add(markers);
  root.traverse((object) => {
    object.userData.presentationOnly ??= true;
    object.userData.visualOnlyContext ??= true;
    object.userData.directObservation ??= false;
    object.userData.scientificStateMutation ??= false;
    object.userData.epistemic ??= 'MODEL';
  });
  rotor.add(root);
}

export function addPremiumCellMembraneDetail(THREE: typeof THREE_NS, root: THREE_NS.Group, scale = 1): void {
  const detail = new THREE.Group();
  detail.name = 'cell:premium-membrane-detail';
  markPremiumPresentation(detail, {
    domain: 'HUMAN_CELL_MODEL',
    epistemic: 'MODEL',
    visualAnalogy: 'MEMBRANE_TEXTURE_GUIDE_NOT_MOLECULAR_RESOLUTION',
  });

  const count = 64;
  const geometry = new THREE.SphereGeometry(0.0065 * scale, 6, 5);
  const material = new THREE.MeshStandardMaterial({ color: 0xb5f0fb, emissive: 0x25606e, emissiveIntensity: 0.16, roughness: 0.36 });
  const heads = new THREE.InstancedMesh(geometry, material, count);
  heads.name = 'cell:membrane-lipid-head-guides';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const p = fibonacciSpherePoint(THREE, index, count);
    dummy.position.copy(p).multiplyScalar(0.524 * scale);
    dummy.updateMatrix();
    heads.setMatrixAt(index, dummy.matrix);
  }
  heads.instanceMatrix.needsUpdate = true;
  heads.userData.visualAnalogy = 'MEMBRANE_TEXTURE_GUIDE_NOT_MOLECULAR_RESOLUTION';
  detail.add(heads);

  // A sparse second shell makes the membrane read as layered without claiming a resolved bilayer.
  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(0.503 * scale, 42, 30),
    new THREE.MeshBasicMaterial({ color: 0x78cddd, transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide }),
  );
  inner.name = 'cell:membrane-inner-guide';
  inner.userData.visualAnalogy = 'LAYERED_MEMBRANE_PRESENTATION_NOT_RESOLVED_BILAYER';
  detail.add(inner);
  detail.traverse((object) => {
    object.userData.presentationOnly ??= true;
    object.userData.visualOnlyContext ??= true;
    object.userData.directObservation ??= false;
    object.userData.scientificStateMutation ??= false;
    object.userData.epistemic ??= 'MODEL';
  });
  root.add(detail);
}
