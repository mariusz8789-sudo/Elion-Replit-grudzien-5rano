import * as THREE from 'three';

export interface RegenerativeBayGeometryOptions {
  readonly scale?: number;
  readonly includeLabels?: boolean;
  readonly highQuality?: boolean;
}

const metal = (color = 0x58636d, roughness = 0.3) => new THREE.MeshStandardMaterial({ color, metalness: 0.82, roughness });
const darkMetal = () => new THREE.MeshStandardMaterial({ color: 0x1a2128, metalness: 0.75, roughness: 0.26 });
const soft = () => new THREE.MeshStandardMaterial({ color: 0x5f6974, metalness: 0.08, roughness: 0.72 });
const cyan = () => new THREE.MeshStandardMaterial({ color: 0x8feaff, emissive: 0x38c7ff, emissiveIntensity: 2.4, metalness: 0.25, roughness: 0.24 });
const screen = () => new THREE.MeshStandardMaterial({ color: 0x08131b, emissive: 0x0e6c89, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.2 });

function box(name: string, size: THREE.Vector3, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  m.name = name;
  return m;
}

function cylinder(name: string, radius: number, depth: number, material: THREE.Material, radial = 32): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, depth, radial), material);
  m.name = name;
  return m;
}

function addRobotArm(parent: THREE.Group, side: -1 | 1): void {
  const arm = new THREE.Group();
  arm.name = side < 0 ? 'biomed.robotArm.left' : 'biomed.robotArm.right';
  arm.position.set(side * 2.2, 1.9, -0.3);
  const shoulder = cylinder('shoulder', 0.13, 0.48, darkMetal(), 20);
  shoulder.rotation.z = Math.PI / 2;
  arm.add(shoulder);
  const upper = box('upper', new THREE.Vector3(0.18, 1.7, 0.22), metal(0x6a7682, 0.24));
  upper.position.y = -0.8;
  upper.rotation.z = side * 0.18;
  arm.add(upper);
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 20), darkMetal());
  joint.position.set(side * 0.12, -1.6, 0);
  arm.add(joint);
  const fore = box('forearm', new THREE.Vector3(0.14, 1.35, 0.18), metal(0x778592, 0.22));
  fore.position.set(side * 0.3, -2.25, 0.05);
  fore.rotation.z = side * 0.22;
  arm.add(fore);
  const tip = cylinder('tool', 0.08, 0.35, cyan(), 16);
  tip.position.set(side * 0.47, -2.95, 0.08);
  tip.rotation.z = Math.PI / 2;
  arm.add(tip);
  arm.userData.semanticRole = 'SIMULATED_ROBOTIC_RESEARCH_ARM';
  parent.add(arm);
}

function addScreen(parent: THREE.Group, x: number, y: number, z: number, rotY: number, scale = 1): void {
  const assembly = new THREE.Group();
  assembly.name = 'biomed.console.screen';
  assembly.position.set(x, y, z);
  assembly.rotation.y = rotY;
  const panel = box('panel', new THREE.Vector3(1.55 * scale, 0.94 * scale, 0.08), darkMetal());
  const display = box('display', new THREE.Vector3(1.33 * scale, 0.72 * scale, 0.025), screen());
  display.position.z = 0.055;
  const topBar = box('topBar', new THREE.Vector3(1.16 * scale, 0.018 * scale, 0.015), cyan());
  topBar.position.set(0, 0.27 * scale, 0.075);
  assembly.add(panel, display, topBar);
  assembly.userData.semanticRole = 'BIOSIGNAL_CONTROL_SCREEN';
  parent.add(assembly);
}

/**
 * Hero-quality, renderer-native geometry for the Biomedical Intervention Bay.
 * The host positions this group using the same station placement source as all
 * other Canonical Laboratory equipment.
 */
export function createRegenerativeMedicineBayGeometry(options: RegenerativeBayGeometryOptions = {}): THREE.Group {
  const scale = options.scale ?? 1;
  const group = new THREE.Group();
  group.name = 'Genesis.BiomedicalInterventionBay';
  group.scale.setScalar(scale);
  group.userData.worldAssetId = 'asset:genesis-biomedical-intervention-bay:v1';
  group.userData.epistemic = 'MODEL';
  group.userData.clinicalUse = 'NOT_A_MEDICAL_DEVICE';

  const base = box('bed.base', new THREE.Vector3(2.45, 0.42, 5.8), darkMetal());
  base.position.y = 0.48;
  group.add(base);
  const mattress = box('bed.mattress', new THREE.Vector3(2.12, 0.36, 5.22), soft());
  mattress.position.y = 0.82;
  mattress.position.z = 0.05;
  group.add(mattress);
  const pillow = box('bed.pillow', new THREE.Vector3(1.78, 0.22, 0.76), soft());
  pillow.position.set(0, 1.1, 2.0);
  group.add(pillow);

  const baseRail = box('bed.rail', new THREE.Vector3(2.55, 0.13, 5.95), cyan());
  baseRail.position.y = 0.76;
  group.add(baseRail);

  const imagingRing = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.14, 18, options.highQuality ? 96 : 48), metal(0x74828f, 0.22));
  imagingRing.name = 'imaging.multimodalRing';
  imagingRing.position.set(0, 2.2, -0.35);
  group.add(imagingRing);

  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(1.53, 0.035, 12, options.highQuality ? 96 : 48), cyan());
  ringGlow.name = 'imaging.multimodalRing.emitter';
  ringGlow.position.copy(imagingRing.position);
  group.add(ringGlow);

  const sensorMast = cylinder('sensor.arch.center', 0.09, 3.7, darkMetal(), 20);
  sensorMast.position.set(0, 2.3, -0.3);
  sensorMast.rotation.z = Math.PI / 2;
  sensorMast.visible = false;
  group.add(sensorMast);

  addRobotArm(group, -1);
  addRobotArm(group, 1);

  // FIX ON INTEGRATION: named `console` in the delivered package, shadowing the global `console`
  // object for the rest of this function's scope — harmless here (nothing in this function logs),
  // but a real lint/correctness trap for any future edit in this scope.
  const consoleBase = box('biomed.console.base', new THREE.Vector3(2.05, 1.08, 0.62), darkMetal());
  consoleBase.position.set(3.2, 0.68, 0.25);
  group.add(consoleBase);
  addScreen(group, 3.2, 1.65, -0.03, Math.PI, 1.08);
  addScreen(group, 3.2, 1.62, 0.56, Math.PI, 0.78);

  const sensorCabinet = box('sensor.cabinet', new THREE.Vector3(1.0, 1.9, 0.64), darkMetal());
  sensorCabinet.position.set(-3.0, 0.95, -0.45);
  group.add(sensorCabinet);
  for (let i = 0; i < 6; i += 1) {
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), cyan());
    indicator.position.set(-3.0, 1.35 - i * 0.19, -0.79);
    group.add(indicator);
  }

  const overhead = box('overhead.light', new THREE.Vector3(2.5, 0.12, 0.22), cyan());
  overhead.position.set(0, 4.1, -0.35);
  group.add(overhead);

  if (options.includeLabels !== false) {
    group.userData.labels = [
      'BIOMEDICAL INTERVENTION BAY',
      'HUMAN TWIN LINK',
      'MULTIMODAL BIOSENSING',
      'COUNTERFACTUAL SIMULATION',
    ];
  }

  return group;
}
