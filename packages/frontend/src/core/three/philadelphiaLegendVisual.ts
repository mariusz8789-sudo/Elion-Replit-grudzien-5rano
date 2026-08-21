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
  const applyViewMode = () => {
    const legend = viewMode === 'legend';
    glowMaterial.opacity = legend ? 0.34 : 0.1;
    fieldMaterial.opacity = legend ? 0.2 : 0.055;
    field.visible = true;
    ship.visible = true;
  };
  applyViewMode();

  return {
    root,
    setViewMode(mode) { viewMode = mode; applyViewMode(); },
    update(elapsedSeconds) {
      // Ruch jest wyłącznie dyskretną animacją prezentacyjną; nie oznacza pomiaru pola.
      field.rotation.y = elapsedSeconds * (viewMode === 'legend' ? 0.16 : 0.045);
      ringA.scale.setScalar(1 + Math.sin(elapsedSeconds * 1.8) * (viewMode === 'legend' ? 0.045 : 0.012));
      ringB.scale.setScalar(1 + Math.cos(elapsedSeconds * 1.2) * (viewMode === 'legend' ? 0.075 : 0.018));
      ship.position.y = Math.sin(elapsedSeconds * 0.72) * 0.035;
      ship.rotation.z = Math.sin(elapsedSeconds * 0.51) * 0.012;
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
