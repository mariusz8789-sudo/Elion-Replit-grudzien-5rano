import type * as THREE_NS from 'three';

/**
 * CHARACTER RIG — proceduralny, zrigowany humanoid 3D (warstwa WIZUALNA).
 *
 * To NIE model naukowy: rig tylko REPREZENTUJE stan agenta. Pełna sylwetka
 * (głowa, szyja, tułów, barki, ramiona, dłonie, biodra, nogi, stopy) zbudowana
 * z segmentów spiętych hierarchią stawów (kinematyka prosta = „szkielet").
 * Ubranie to osobne warstwy materiału (koszula, spodnie, buty, włosy). Animacja
 * (idle/walk/gesture) wynika z FAZY liczonej z ruchu — bez ślizgu stóp, bez
 * losowej choreografii. Etap „faza 1": pełny humanoid z rigiem; twarz/włosy/
 * skinned glTF to kolejne iteracje (patrz loadGltfCharacter — hak na później).
 */

type THREE = typeof THREE_NS;
type Obj = THREE_NS.Object3D;

export interface CharacterOptions {
  height?: number;          // wysokość postaci [j. świata]
  skin?: number; shirt?: number; pants?: number; shoes?: number; hair?: number;
}

export type PoseMode = 'idle' | 'walk' | 'gesture';

export interface Character {
  root: Obj;                // korzeń przy stopach (y=0)
  /** Aktualizacja pozy: tryb, czas [s], tempo (0..1 = intensywność chodu). */
  update(mode: PoseMode, t: number, speed: number): void;
  setFacing(angleRad: number): void;
  /** Płynny tint ubrań; skóra, włosy i anatomia pozostają naturalne. */
  setEpidemicTint(color: number, intensity: number): void;
  dispose(): void;
}

/** Deterministyczna paleta ubrań z ziarna (różnorodność bez chaosu). */
export function paletteFromSeed(seed: number): Required<Pick<CharacterOptions, 'skin' | 'shirt' | 'pants' | 'shoes' | 'hair'>> {
  const skins = [0xf2c9a0, 0xe0a878, 0xc98a5e, 0x8d5a3c, 0xf5d6b8];
  const shirts = [0x4a76c4, 0xc44a4a, 0x4aa06a, 0xd7a13a, 0x8a5ac4, 0x3aa0a0, 0xcccccc];
  const pants = [0x2f3a4c, 0x394b3a, 0x4c3a2f, 0x33384a, 0x555555];
  const hairs = [0x2a1e14, 0x4a3020, 0x120f0c, 0x6b4a2a, 0x9a9a9a];
  const pick = (arr: number[], salt: number) => arr[Math.abs((seed * 2654435761 + salt * 40503) | 0) % arr.length];
  return { skin: pick(skins, 1), shirt: pick(shirts, 2), pants: pick(pants, 3), shoes: 0x22262e, hair: pick(hairs, 4) };
}

export function buildCharacter(THREE: THREE, opts: CharacterOptions = {}): Character {
  const H = opts.height ?? 1.75;
  const mat = (color: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
  const M = {
    skin: mat(opts.skin ?? 0xf2c9a0), shirt: mat(opts.shirt ?? 0x4a76c4),
    pants: mat(opts.pants ?? 0x2f3a4c), shoes: mat(opts.shoes ?? 0x22262e), hair: mat(opts.hair ?? 0x2a1e14),
  };
  const disposables: THREE_NS.BufferGeometry[] = [];
  const baseShirt = M.shirt.color.clone();
  const basePants = M.pants.color.clone();
  const targetTint = new THREE.Color();

  const root = new THREE.Group(); root.name = 'character';

  // Pomocnik: staw (Group) w pozycji; segment (mesh) rozciąga się od stawu w dół o `len`.
  const joint = (parent: Obj, x: number, y: number, z: number): Obj => {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
  };
  const limb = (parentJoint: Obj, len: number, radius: number, material: THREE_NS.Material, down = true): void => {
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, len - radius * 2), 6, 10);
    disposables.push(geo);
    const m = new THREE.Mesh(geo, material);
    m.position.y = down ? -len / 2 : len / 2;
    parentJoint.add(m);
  };

  // Wymiary (proporcje ~7.3 głowy).
  const hipY = H * 0.52, chestY = H * 0.82, headY = H * 0.93;
  const thigh = H * 0.26, shin = H * 0.25, upperArm = H * 0.17, foreArm = H * 0.16;
  const shoulderX = H * 0.10, hipX = H * 0.05;

  // Miednica + tułów.
  const pelvis = joint(root, 0, hipY, 0);
  const torsoGeo = new THREE.CapsuleGeometry(H * 0.115, H * 0.24, 6, 12); disposables.push(torsoGeo);
  const torso = new THREE.Mesh(torsoGeo, M.shirt); torso.position.y = (chestY - hipY) / 2 + 0.02; pelvis.add(torso);
  const chest = joint(pelvis, 0, chestY - hipY, 0);

  // Szyja + głowa + włosy.
  const neck = joint(chest, 0, H * 0.05, 0);
  const headGeo = new THREE.SphereGeometry(H * 0.075, 18, 16); disposables.push(headGeo);
  const head = new THREE.Mesh(headGeo, M.skin); head.position.y = headY - chestY; head.scale.set(0.9, 1.05, 0.95); neck.add(head);
  const hairGeo = new THREE.SphereGeometry(H * 0.079, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62); disposables.push(hairGeo);
  const hair = new THREE.Mesh(hairGeo, M.hair); hair.position.copy(head.position); hair.position.y += H * 0.012; hair.scale.copy(head.scale); neck.add(hair);

  // Ramiona: bark → łokieć → dłoń.
  const arm = (side: number) => {
    const shoulder = joint(chest, side * shoulderX, H * 0.02, 0);
    limb(shoulder, upperArm, H * 0.035, M.shirt);
    const elbow = joint(shoulder, 0, -upperArm, 0);
    limb(elbow, foreArm, H * 0.028, M.skin);
    const wrist = joint(elbow, 0, -foreArm, 0);
    const handGeo = new THREE.SphereGeometry(H * 0.032, 10, 8); disposables.push(handGeo);
    const hand = new THREE.Mesh(handGeo, M.skin); hand.position.y = -H * 0.02; wrist.add(hand);
    return { shoulder, elbow };
  };
  const armL = arm(1), armR = arm(-1);

  // Nogi: biodro → kolano → kostka → stopa.
  const leg = (side: number) => {
    const hip = joint(pelvis, side * hipX, 0, 0);
    limb(hip, thigh, H * 0.05, M.pants);
    const knee = joint(hip, 0, -thigh, 0);
    limb(knee, shin, H * 0.04, M.pants);
    const ankle = joint(knee, 0, -shin, 0);
    const footGeo = new THREE.BoxGeometry(H * 0.06, H * 0.03, H * 0.13); disposables.push(footGeo);
    const foot = new THREE.Mesh(footGeo, M.shoes); foot.position.set(0, -H * 0.015, H * 0.03); ankle.add(foot);
    return { hip, knee, ankle };
  };
  const legL = leg(1), legR = leg(-1);

  const baseY = 0; // korzeń przy stopach

  const update = (mode: PoseMode, t: number, speed: number): void => {
    // Reset lekki.
    if (mode === 'walk') {
      const cadence = 1.4 + speed * 0.6;
      const p = t * cadence * Math.PI * 2;
      const amp = 0.5 * (0.5 + speed * 0.5);
      legL.hip.rotation.x = Math.sin(p) * amp;
      legR.hip.rotation.x = Math.sin(p + Math.PI) * amp;
      legL.knee.rotation.x = Math.max(0, -Math.sin(p)) * 1.1;
      legR.knee.rotation.x = Math.max(0, -Math.sin(p + Math.PI)) * 1.1;
      legL.ankle.rotation.x = -legL.hip.rotation.x * 0.3;
      legR.ankle.rotation.x = -legR.hip.rotation.x * 0.3;
      armL.shoulder.rotation.x = Math.sin(p + Math.PI) * 0.4;
      armR.shoulder.rotation.x = Math.sin(p) * 0.4;
      armL.elbow.rotation.x = 0.3 + Math.max(0, Math.sin(p)) * 0.2;
      armR.elbow.rotation.x = 0.3 + Math.max(0, Math.sin(p + Math.PI)) * 0.2;
      pelvis.rotation.y = Math.sin(p) * 0.12;
      chest.rotation.y = -Math.sin(p) * 0.08;
      root.position.y = baseY + Math.abs(Math.sin(p)) * H * 0.012;
    } else if (mode === 'gesture') {
      const s = Math.sin(t * 1.4);
      armR.shoulder.rotation.x = -1.2; armR.shoulder.rotation.z = -0.2 + s * 0.15;
      armR.elbow.rotation.x = 0.9;
      armL.shoulder.rotation.x = 0.05 * Math.sin(t);
      legL.hip.rotation.x = legR.hip.rotation.x = 0; legL.knee.rotation.x = legR.knee.rotation.x = 0;
      pelvis.rotation.z = Math.sin(t * 1.1) * 0.02;
      root.position.y = baseY;
    } else { // idle
      const s = Math.sin(t * 1.1);
      pelvis.rotation.z = s * 0.03; pelvis.rotation.y = 0;
      chest.rotation.y = 0;
      armL.shoulder.rotation.x = s * 0.06 - 0.04; armR.shoulder.rotation.x = -s * 0.06 - 0.04;
      armL.shoulder.rotation.z = 0; armR.shoulder.rotation.z = 0;
      armL.elbow.rotation.x = armR.elbow.rotation.x = 0.15;
      legL.hip.rotation.x = legR.hip.rotation.x = 0; legL.knee.rotation.x = legR.knee.rotation.x = 0;
      legL.ankle.rotation.x = legR.ankle.rotation.x = 0;
      head.rotation.y = Math.sin(t * 0.5) * 0.15;
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.01;
      root.position.y = baseY;
    }
  };

  return {
    root,
    update,
    setFacing: (a: number) => { root.rotation.y = a; },
    setEpidemicTint: (color: number, intensity: number) => {
      targetTint.setHex(color);
      const shirtTarget = baseShirt.clone().lerp(targetTint, Math.max(0, Math.min(0.78, intensity)));
      const pantsTarget = basePants.clone().lerp(targetTint, Math.max(0, Math.min(0.45, intensity * 0.55)));
      // Przejście jest płynne między kolejnymi stanami modelu, nie skok materiału.
      M.shirt.color.lerp(shirtTarget, 0.14);
      M.pants.color.lerp(pantsTarget, 0.12);
    },
    dispose: () => { for (const g of disposables) g.dispose(); Object.values(M).forEach((m) => m.dispose()); },
  };
}

/**
 * Hak na PÓŹNIEJ (opcja fazowa): podmiana proceduralnego rigu na skinned glTF,
 * gdy dostarczony zostanie licencjonowany asset. Zwraca null, jeśli się nie uda
 * (brak URL / blokada sieci / niewłaściwy plik) — wtedy zostaje humanoid
 * proceduralny. NIE pobiera żadnych „podejrzanych" assetów samoczynnie.
 */
export async function loadGltfCharacter(THREE: THREE, url: string): Promise<Obj | null> {
  if (!url) return null;
  try {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    void THREE;
    return gltf.scene as unknown as Obj;
  } catch {
    return null;
  }
}
