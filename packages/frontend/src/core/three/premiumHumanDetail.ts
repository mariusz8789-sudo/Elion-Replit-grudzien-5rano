import type * as THREE_NS from 'three';
import type { RenderTier } from './quality';
import { disposeSceneResources } from './graphics/lifecycle';
import { fibonacciSpherePoint, markPremiumPresentation, premiumVisualBudget } from './graphics/premiumVisualPolicy';

export interface PremiumHumanDetailOptions {
  readonly center: THREE_NS.Vector3Tuple;
  readonly height: number;
  readonly radius: number;
  readonly tier: RenderTier;
}

export interface PremiumHumanDetailHandle {
  readonly root: THREE_NS.Group;
  readonly summary: {
    readonly scanPointCount: number;
    readonly ringCount: number;
    readonly fiducialCount: number;
  };
  update(elapsedSeconds: number): void;
  dispose(): void;
}

/**
 * Presentation apparatus around the canonical Human Digital Twin chamber.
 * It upgrades readability and scale without adding anatomy or pretending the proxy is a scan.
 */
export function createPremiumHumanDetail(THREE: typeof THREE_NS, options: PremiumHumanDetailOptions): PremiumHumanDetailHandle {
  const root = new THREE.Group();
  root.name = 'premium-human-twin-presentation';
  root.position.set(...options.center);
  markPremiumPresentation(root, {
    domain: 'HUMAN_DIGITAL_TWIN',
    epistemic: 'MODEL',
    visualAnalogy: 'CINEMATIC_SCAN_INTERFACE_NOT_ACQUISITION_DATA',
  });
  root.userData.clinicalUse = 'NOT_A_MEDICAL_DEVICE';
  root.userData.anatomicalPrecision = 'ILLUSTRATIVE_GEOMETRY';

  const budget = premiumVisualBudget(options.tier);
  const cyan = new THREE.MeshBasicMaterial({ color: 0x74dcff, transparent: true, opacity: 0.26, depthWrite: false });
  const cyanSoft = new THREE.MeshBasicMaterial({ color: 0x7fdfff, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide });

  const ringCount = options.tier === 'low' ? 2 : 3;
  const rings: THREE_NS.Mesh[] = [];
  for (let index = 0; index < ringCount; index += 1) {
    const ringMaterial = index === 0 ? cyan : cyan.clone();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(options.radius * (1.02 + index * 0.045), 0.006, 6, budget.heroSegments * 2), ringMaterial);
    ring.name = `premium-human-scan-ring:${index}`;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28 + (index / Math.max(1, ringCount - 1)) * Math.max(0.3, options.height - 0.56);
    ring.userData.visualAnalogy = 'SCANNER_GUIDE_NOT_MEASURED_SLICE';
    root.add(ring); rings.push(ring);
  }

  // Subtle translucent section guides behind the body. They are UI planes, not anatomy slices.
  for (let index = 0; index < 3; index += 1) {
    const planeMaterial = index === 0 ? cyanSoft : cyanSoft.clone();
    const plane = new THREE.Mesh(new THREE.CircleGeometry(options.radius * 0.92, budget.heroSegments), planeMaterial);
    plane.name = `premium-human-section-guide:${index}`;
    plane.rotation.x = Math.PI / 2;
    plane.position.y = 0.38 + index * (options.height - 0.76) / 2;
    plane.userData.visualAnalogy = 'ORIENTATION_GUIDE_NOT_PATIENT_SECTION';
    root.add(plane);
  }

  const fiducialCount = options.tier === 'low' ? 10 : options.tier === 'medium' ? 14 : 18;
  const fiducials = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.012, 0.065, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xa9edff, emissive: 0x4aa8c8, emissiveIntensity: 0.38, roughness: 0.32 }),
    fiducialCount,
  );
  fiducials.name = 'premium-human-orientation-fiducials';
  const dummy = new THREE.Object3D();
  for (let index = 0; index < fiducialCount; index += 1) {
    const angle = (index / fiducialCount) * Math.PI * 2;
    dummy.position.set(Math.cos(angle) * options.radius * 1.11, 0.82 + (index % 3) * 0.34, Math.sin(angle) * options.radius * 1.11);
    dummy.rotation.set(0, -angle, 0);
    dummy.updateMatrix();
    fiducials.setMatrixAt(index, dummy.matrix);
  }
  fiducials.instanceMatrix.needsUpdate = true;
  root.add(fiducials);

  const scanPointCount = Math.min(budget.atmospherePoints, options.tier === 'low' ? 180 : options.tier === 'medium' ? 320 : 520);
  const positions = new Float32Array(scanPointCount * 3);
  for (let index = 0; index < scanPointCount; index += 1) {
    const p = fibonacciSpherePoint(THREE, index, scanPointCount);
    // Human-like vertical envelope only; deliberately NOT anatomical surface data.
    const y01 = (p.y + 1) * 0.5;
    const shoulder = 0.55 + 0.22 * Math.exp(-Math.pow((y01 - 0.72) / 0.18, 2));
    const pelvis = 0.54 + 0.12 * Math.exp(-Math.pow((y01 - 0.34) / 0.14, 2));
    const taper = Math.min(shoulder, pelvis + 0.18);
    positions[index * 3] = p.x * options.radius * taper;
    positions[index * 3 + 1] = 0.12 + y01 * (options.height - 0.24);
    positions[index * 3 + 2] = p.z * options.radius * 0.42;
  }
  const scanGeometry = new THREE.BufferGeometry();
  scanGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const scanMaterial = new THREE.PointsMaterial({ color: 0x79dfff, size: options.tier === 'low' ? 0.006 : 0.008, transparent: true, opacity: 0.22, depthWrite: false, sizeAttenuation: true });
  const scan = new THREE.Points(scanGeometry, scanMaterial);
  scan.name = 'premium-human-scan-envelope-points';
  scan.userData.visualAnalogy = 'DISPLAY_ENVELOPE_NOT_BODY_SCAN';
  root.add(scan);

  root.traverse((object) => {
    object.userData.epistemic ??= 'MODEL';
    object.userData.directObservation ??= false;
    object.userData.presentationOnly ??= true;
    object.userData.visualOnlyContext ??= true;
    object.userData.scientificStateMutation ??= false;
  });

  let disposed = false;
  return {
    root,
    summary: { scanPointCount, ringCount, fiducialCount },
    update(elapsedSeconds: number) {
      if (disposed) return;
      rings.forEach((ring, index) => {
        const span = Math.max(0.3, options.height - 0.56);
        ring.position.y = 0.28 + ((elapsedSeconds * (0.065 + index * 0.008) + index / ringCount) % 1) * span;
        const material = ring.material as THREE_NS.MeshBasicMaterial;
        material.opacity = 0.18 + 0.1 * (0.5 + 0.5 * Math.sin(elapsedSeconds * 1.1 + index));
      });
      scan.rotation.y = elapsedSeconds * 0.025;
      scanMaterial.opacity = 0.18 + 0.055 * (0.5 + 0.5 * Math.sin(elapsedSeconds * 0.8));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      disposeSceneResources(root);
    },
  };
}
