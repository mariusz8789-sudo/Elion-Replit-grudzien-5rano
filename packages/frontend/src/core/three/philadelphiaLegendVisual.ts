import type * as THREE_NS from 'three';

/**
 * Warstwa prezentacyjna legendy Filadelfii. Nie jest silnikiem fizycznym,
 * modelem statku ani źródłem danych. Jej jedyną odpowiedzialnością jest
 * oznaczona ilustracja narracji dodawana do istniejącej sceny Three.js.
 */
export type PhiladelphiaLegendViewMode = 'legend' | 'physics';

export interface PhiladelphiaLegendVisual {
  readonly root: THREE_NS.Group;
  setViewMode(mode: PhiladelphiaLegendViewMode): void;
  setFieldIntensity(value: number): void;
  setThreshold(value: number): void;
  update(elapsedSeconds: number): void;
  dispose(): void;
}

export function createPhiladelphiaLegendVisual(
  THREE: typeof THREE_NS,
  initialViewMode: PhiladelphiaLegendViewMode,
): PhiladelphiaLegendVisual {
  const root = new THREE.Group();
  root.name = 'historical-legend-philadelphia-hypothetical-visualization';

  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x18364a, roughness: 0.38, metalness: 0.28 });
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x52606a, roughness: 0.46, metalness: 0.72 });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x74808a, roughness: 0.64, metalness: 0.48 });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x78d8df, transparent: true, opacity: 0.34, depthWrite: false });
  const fieldMaterial = new THREE.MeshBasicMaterial({ color: 0x9af2dc, transparent: true, opacity: 0.2, depthWrite: false });
  const portMaterial = new THREE.MeshStandardMaterial({ color: 0x26394a, roughness: 0.82, metalness: 0.25 });
  const equipmentMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6474, roughness: 0.4, metalness: 0.72 });
  const staffMaterial = new THREE.MeshStandardMaterial({ color: 0xd7b48a, roughness: 0.68, metalness: 0.02 });
  const thresholdMaterial = new THREE.MeshBasicMaterial({ color: 0xe879f9, transparent: true, opacity: 0, depthWrite: false });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(24, 18, 1, 1), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.16;
  water.receiveShadow = true;
  root.add(water);

  // Symboliczna sylweta niszczyciela eskortowego; nie jest rekonstrukcją USS Eldridge.
  const ship = new THREE.Group();
  ship.name = 'legend-ship-silhouette-not-historical-reconstruction';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.62, 1.18), hullMaterial);
  hull.position.y = 0.34;
  hull.castShadow = true;
  hull.receiveShadow = true;
  ship.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.55, 4), hullMaterial);
  bow.rotation.z = -Math.PI / 2;
  bow.position.set(3.56, 0.34, 0);
  bow.castShadow = true;
  ship.add(bow);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.82, 0.82), deckMaterial);
  bridge.position.set(-0.42, 0.98, 0);
  bridge.castShadow = true;
  ship.add(bridge);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.7, 10), hullMaterial);
  mast.position.set(-0.12, 1.78, 0);
  mast.castShadow = true;
  ship.add(mast);
  const wake = new THREE.Mesh(new THREE.RingGeometry(1.2, 4.4, 48), new THREE.MeshBasicMaterial({ color: 0x7dc9dd, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  wake.rotation.x = -Math.PI / 2;
  wake.scale.set(1.2, 0.36, 1);
  wake.position.y = -0.12;
  ship.add(wake);
  root.add(ship);

  // Port i personel są proceduralnym tłem sceny; nie są rekonstrukcją historyczną.
  const port = new THREE.Group();
  port.name = 'hypothetical-port-environment';
  const dock = new THREE.Mesh(new THREE.BoxGeometry(7, 0.28, 2.1), portMaterial);
  dock.position.set(-3.2, 0.02, -3.8);
  dock.receiveShadow = true;
  port.add(dock);
  for (let index = 0; index < 4; index++) {
    const crane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), equipmentMaterial);
    crane.position.set(-5.3 + index * 1.45, 1.15, -3.8);
    crane.castShadow = true;
    port.add(crane);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.1), equipmentMaterial);
    arm.position.set(-4.75 + index * 1.45, 2.25, -3.8);
    port.add(arm);
  }
  root.add(port);

  const staff = new THREE.Group();
  staff.name = 'hypothetical-port-personnel';
  for (let index = 0; index < 5; index++) {
    const person = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 8), equipmentMaterial);
    body.position.y = 0.28;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), staffMaterial);
    head.position.y = 0.6;
    person.add(body, head);
    person.position.set(-3.5 + index * 0.72, 0.08, -2.7 + (index % 2) * 0.35);
    person.scale.setScalar(0.85 + (index % 3) * 0.08);
    person.traverse((node) => { const mesh = node as THREE_NS.Mesh; mesh.castShadow = true; });
    staff.add(person);
  }
  root.add(staff);

  const installation = new THREE.Group();
  installation.name = 'hypothetical-electromagnetic-installation';
  for (let index = 0; index < 3; index++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.46 + index * 0.14, 0.035, 10, 36), equipmentMaterial);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(-0.8 + index * 0.8, 0.72, -0.9);
    installation.add(coil);
  }
  const console = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.42, 0.52), equipmentMaterial);
  console.position.set(-0.4, 0.36, -1.35);
  installation.add(console);
  root.add(installation);

  const threshold = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.075, 14, 96), thresholdMaterial);
  threshold.name = 'hypothetical-threshold-event-not-observed';
  threshold.rotation.y = Math.PI / 2;
  threshold.position.set(0.6, 1.5, -0.15);
  root.add(threshold);

  const field = new THREE.Group();
  field.name = 'legend-electromagnetic-field-illustration-not-solver-output';
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.035, 12, 72), fieldMaterial);
  ringA.rotation.x = Math.PI / 2;
  ringA.position.y = 0.76;
  field.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.68, 0.025, 12, 64), glowMaterial);
  ringB.rotation.set(Math.PI / 2.6, 0.36, 0);
  ringB.position.y = 0.82;
  field.add(ringB);
  for (let index = 0; index < 12; index++) {
    const angle = (index / 12) * Math.PI * 2;
    const arc = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.0), glowMaterial);
    arc.position.set(Math.cos(angle) * 2.5, 0.66 + Math.sin(angle * 2) * 0.18, Math.sin(angle) * 1.25);
    arc.rotation.y = -angle;
    field.add(arc);
  }
  root.add(field);

  let viewMode: PhiladelphiaLegendViewMode = initialViewMode;
  let fieldIntensity = 0.45;
  let thresholdLevel = 0;
  const applyViewMode = () => {
    const legend = viewMode === 'legend';
    glowMaterial.opacity = legend ? 0.34 : 0.1;
    fieldMaterial.opacity = legend ? 0.2 : 0.055;
    field.visible = true;
    ship.visible = true;
    thresholdMaterial.opacity = thresholdLevel * (legend ? 0.52 : 0.18);
  };
  applyViewMode();

  return {
    root,
    setViewMode(mode) { viewMode = mode; applyViewMode(); },
    setFieldIntensity(value) {
      fieldIntensity = Math.max(0, Math.min(1, value));
      fieldMaterial.opacity = (viewMode === 'legend' ? 0.08 : 0.025) + fieldIntensity * (viewMode === 'legend' ? 0.34 : 0.09);
      glowMaterial.opacity = (viewMode === 'legend' ? 0.14 : 0.04) + fieldIntensity * (viewMode === 'legend' ? 0.42 : 0.12);
    },
    setThreshold(value) {
      thresholdLevel = Math.max(0, Math.min(1, value));
      threshold.scale.setScalar(0.72 + thresholdLevel * 0.55);
      thresholdMaterial.opacity = thresholdLevel * (viewMode === 'legend' ? 0.52 : 0.18);
    },
    update(elapsedSeconds) {
      // Ruch i pole są wyłącznie animacją prezentacyjną; nie oznaczają wyniku solvera.
      field.rotation.y = elapsedSeconds * (viewMode === 'legend' ? 0.16 : 0.045);
      ringA.scale.setScalar(1 + fieldIntensity * Math.sin(elapsedSeconds * 1.8) * (viewMode === 'legend' ? 0.08 : 0.02));
      ringB.scale.setScalar(1 + fieldIntensity * Math.cos(elapsedSeconds * 1.2) * (viewMode === 'legend' ? 0.12 : 0.03));
      threshold.rotation.z = elapsedSeconds * 0.12;
      thresholdMaterial.opacity = thresholdLevel * (viewMode === 'legend' ? 0.52 : 0.18) * (0.72 + 0.28 * Math.sin(elapsedSeconds * 3.4) ** 2);
      ship.position.y = Math.sin(elapsedSeconds * 0.72) * 0.035;
      ship.rotation.z = Math.sin(elapsedSeconds * 0.51) * 0.012;
      staff.rotation.y = Math.sin(elapsedSeconds * 0.22) * 0.018;
    },
    dispose() {
      root.traverse((node) => {
        const mesh = node as THREE_NS.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material;
        if (material && !Array.isArray(material)) material.dispose();
      });
    },
  };
}
