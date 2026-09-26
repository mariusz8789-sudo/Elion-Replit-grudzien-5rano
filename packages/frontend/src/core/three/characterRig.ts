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
  /**
   * SCIENTIFIC WORLDS — a sealed scientific/hazmat suit over the same rig: suit fabric on every
   * limb and the torso, gloves, boots, a helmet with a transparent visor, a backpack unit. The
   * skeleton, walk cycle and tint behaviour are untouched; only the clothing layer changes.
   */
  suit?: SuitOptions;
}

export interface SuitOptions {
  fabric?: number; trim?: number; gloves?: number; boots?: number;
  /** Visor glass tint. */
  visor?: number;
  /** Emissive helmet lamp / status light colour. */
  lamp?: number;
}

export type PoseMode = 'idle' | 'walk' | 'gesture';

export interface Character {
  root: Obj;                // korzeń przy stopach (y=0)
  /** The head joint (neck group): a first-person camera parents here to look through the visor. */
  head: Obj;
  /** The helmet/visor meshes, so a through-visor camera can hide what would occlude it. */
  helmet: Obj | null;
  /** Aktualizacja pozy: tryb, czas [s], tempo (0..1 = intensywność chodu). */
  update(mode: PoseMode, t: number, speed: number): void;
  /**
   * SCIENTIFIC WORLDS — reach overlay applied AFTER `update()`: 0 = arms as posed, 1 = the right
   * arm extended forward and slightly down to a console, left arm steadying. Blended, so a walk
   * cycle fades into a reach instead of snapping. `headPitch` (radians, down positive) tilts the
   * head toward the work.
   */
  reach(amount: number, headPitch?: number): void;
  setFacing(angleRad: number): void;
  /**
   * LIVE LABORATORY — the point in the right (and left) hand where an object being held sits. A vial
   * added as a child of `rightGrip` travels with the hand through the whole reach, so a viewer sees the
   * sample IN the hand rather than floating beside it. Presentation only: parenting a mesh here says
   * nothing about the experiment.
   */
  readonly rightGrip: Obj;
  readonly leftGrip: Obj;
  /** Closes the fingers and thumb of the right hand: 0 = open palm, 1 = gripping. */
  setGrip(amount: number): void;
  /** Płynny tint ubrań; skóra, włosy i anatomia pozostają naturalne. */
  setEpidemicTint(color: number, intensity: number): void;
  dispose(): void;
}

/** Deterministyczna paleta ubrań z ziarna (różnorodność bez chaosu). */
export function paletteFromSeed(seed: number): Required<Pick<CharacterOptions, 'skin' | 'shirt' | 'pants' | 'shoes' | 'hair'>> {
  const skins = [0xf2c9a0, 0xe0a878, 0xc98a5e, 0x8d5a3c, 0xf5d6b8];
  const shirts = [0x4a76c4, 0xc44a4a, 0x4aa06a, 0xd7a13a, 0x8a5ac4, 0x3aa0a0, 0xcccccc];
  const pants = [0x2f3a4c, 0x394b3a, 0x4c3a2f, 0x33384a, 0x555555];
  const hairs = [0x3d2b20, 0x62422a, 0x241d18, 0x866044, 0xa6a6a6];
  const pick = (arr: number[], salt: number) => arr[Math.abs((seed * 2654435761 + salt * 40503) | 0) % arr.length];
  return { skin: pick(skins, 1), shirt: pick(shirts, 2), pants: pick(pants, 3), shoes: 0x22262e, hair: pick(hairs, 4) };
}

export function buildCharacter(THREE: THREE, opts: CharacterOptions = {}): Character {
  const H = opts.height ?? 1.75;
  const suit = opts.suit;
  const mat = (color: number, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });
  // A suited character wears the same rig: fabric on the torso and every limb, gloves where the hands are,
  // boots where the shoes are, and no exposed skin or hair.
  const M = suit
    ? {
      skin: mat(suit.gloves ?? 0x1f2933, 0.55), shirt: mat(suit.fabric ?? 0xe8ecf0, 0.72),
      pants: mat(suit.fabric ?? 0xe8ecf0, 0.72), shoes: mat(suit.boots ?? 0x1a1f26, 0.6), hair: mat(suit.trim ?? 0xf0b35c, 0.6), face: mat(0x202b38, 0.72),
    }
    : {
      skin: mat(opts.skin ?? 0xf2c9a0), shirt: mat(opts.shirt ?? 0x4a76c4),
      pants: mat(opts.pants ?? 0x2f3a4c), shoes: mat(opts.shoes ?? 0x22262e), hair: mat(opts.hair ?? 0x2a1e14), face: mat(0x202b38, 0.72),
    };
  const extraMaterials: THREE_NS.Material[] = [];
  const disposables: THREE_NS.BufferGeometry[] = [];
  const baseShirt = M.shirt.color.clone();
  const basePants = M.pants.color.clone();
  const targetTint = new THREE.Color();
  // Render-loop allocation audit finding: setEpidemicTint() used to allocate two fresh Colors
  // (baseShirt.clone()/basePants.clone()) every call — once per detailed agent per frame.
  const scratchShirtTarget = new THREE.Color();
  const scratchPantsTarget = new THREE.Color();

  const root = new THREE.Group(); root.name = 'character';
  let helmet: Obj | null = null;

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
  const neck = joint(chest, 0, H * 0.05, 0); neck.name = 'joint:neck';
  const headGeo = new THREE.SphereGeometry(H * 0.075, 18, 16); disposables.push(headGeo);
  const head = new THREE.Mesh(headGeo, M.skin); head.position.y = headY - chestY; head.scale.set(0.9, 1.05, 0.95); neck.add(head);
  const hairGeo = new THREE.SphereGeometry(H * 0.079, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62); disposables.push(hairGeo);
  const hair = new THREE.Mesh(hairGeo, M.hair); hair.position.copy(head.position); hair.position.y += H * 0.012; hair.scale.copy(head.scale); neck.add(hair);
  if (suit) {
    // Helmet: a shell around the head with a transparent visor in front, a trim ring at the collar
    // and a small lamp — the first-person camera sits just inside the visor glass.
    hair.visible = false;
    const helmetGroup = new THREE.Group(); helmetGroup.name = 'helmet'; helmetGroup.position.copy(head.position); neck.add(helmetGroup);
    const shellGeo = new THREE.SphereGeometry(H * 0.105, 24, 18, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI); disposables.push(shellGeo);
    const shellMat = mat(suit.fabric ?? 0xe8ecf0, 0.5); extraMaterials.push(shellMat);
    const shell = new THREE.Mesh(shellGeo, shellMat); shell.scale.set(1, 1.08, 1); shell.rotation.y = Math.PI; helmetGroup.add(shell);
    const visorGeo = new THREE.SphereGeometry(H * 0.104, 24, 18, -Math.PI * 0.44, Math.PI * 0.88, Math.PI * 0.22, Math.PI * 0.5); disposables.push(visorGeo);
    const visorMat = new THREE.MeshPhysicalMaterial({ color: suit.visor ?? 0x8fd3ff, transparent: true, opacity: 0.28, roughness: 0.08, metalness: 0.1, transmission: 0, side: THREE.DoubleSide, depthWrite: false });
    extraMaterials.push(visorMat);
    const visor = new THREE.Mesh(visorGeo, visorMat); visor.name = 'visor'; visor.scale.set(1, 1.08, 1); helmetGroup.add(visor);
    const collarGeo = new THREE.TorusGeometry(H * 0.075, H * 0.014, 8, 20); disposables.push(collarGeo);
    const collarMat = mat(suit.trim ?? 0xf0b35c, 0.45); extraMaterials.push(collarMat);
    const collar = new THREE.Mesh(collarGeo, collarMat); collar.rotation.x = Math.PI / 2; collar.position.y = -H * 0.085; helmetGroup.add(collar);
    const lampGeo = new THREE.SphereGeometry(H * 0.012, 8, 6); disposables.push(lampGeo);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: suit.lamp ?? 0x62f0a3, emissiveIntensity: 2.2 }); extraMaterials.push(lampMat);
    const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(H * 0.07, H * 0.06, H * 0.05); helmetGroup.add(lamp);
    // Backpack life-support unit on the torso.
    const packGeo = new THREE.BoxGeometry(H * 0.16, H * 0.2, H * 0.07); disposables.push(packGeo);
    const packMat = mat(suit.boots ?? 0x1a1f26, 0.55); extraMaterials.push(packMat);
    const pack = new THREE.Mesh(packGeo, packMat); pack.position.set(0, (chestY - hipY) / 2 - H * 0.02, -H * 0.12); pelvis.add(pack);
    helmet = helmetGroup;
  }
  // Minimalne cechy twarzy są tylko detalem rigu obserwowanego z bliska; nie reprezentują danych demograficznych ani stanu modelu.
  const eyeGeo = new THREE.SphereGeometry(H * 0.010, 8, 6); disposables.push(eyeGeo);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, M.face);
    eye.position.set(side * H * 0.025, head.position.y + H * 0.008, H * 0.067);
    neck.add(eye);
  }
  const noseGeo = new THREE.SphereGeometry(H * 0.012, 8, 6); disposables.push(noseGeo);
  const nose = new THREE.Mesh(noseGeo, M.skin); nose.position.set(0, head.position.y - H * 0.010, H * 0.075); neck.add(nose);

  // Ramiona: bark → łokieć → dłoń. Dłoń ma punkt trzymania (`grip`) i palce, które się zamykają:
  // laboratorium musi POKAZAĆ chwyt fiolki, a nie tylko rękę obok niej.
  const arm = (side: number) => {
    const shoulder = joint(chest, side * shoulderX, H * 0.02, 0); shoulder.name = side > 0 ? 'joint:shoulder.L' : 'joint:shoulder.R';
    limb(shoulder, upperArm, H * 0.035, M.shirt);
    const elbow = joint(shoulder, 0, -upperArm, 0); elbow.name = side > 0 ? 'joint:elbow.L' : 'joint:elbow.R';
    limb(elbow, foreArm, H * 0.028, M.skin);
    const wrist = joint(elbow, 0, -foreArm, 0); wrist.name = side > 0 ? 'joint:wrist.L' : 'joint:wrist.R';
    const handGeo = new THREE.SphereGeometry(H * 0.032, 10, 8); disposables.push(handGeo);
    const hand = new THREE.Mesh(handGeo, M.skin); hand.position.y = -H * 0.02; wrist.add(hand);
    hand.name = side > 0 ? 'hand.L' : 'hand.R';
    // Palce: dwa segmenty (chwyt + przeciwstawny kciuk) obracane przez `setGrip`.
    const fingerGeo = new THREE.BoxGeometry(H * 0.026, H * 0.030, H * 0.012); disposables.push(fingerGeo);
    const fingers = new THREE.Group(); fingers.position.set(0, -H * 0.026, H * 0.004); hand.add(fingers);
    const fingerMesh = new THREE.Mesh(fingerGeo, M.skin); fingerMesh.position.y = -H * 0.014; fingers.add(fingerMesh);
    const thumb = new THREE.Group(); thumb.position.set(side * -H * 0.022, -H * 0.014, H * 0.006); hand.add(thumb);
    const thumbGeo = new THREE.BoxGeometry(H * 0.012, H * 0.024, H * 0.012); disposables.push(thumbGeo);
    const thumbMesh = new THREE.Mesh(thumbGeo, M.skin); thumbMesh.position.y = -H * 0.011; thumb.add(thumbMesh);
    // Punkt trzymania: tam, gdzie fiolka siedzi w zamkniętej dłoni. Przedmiot dopina się TU.
    const grip = joint(hand, 0, -H * 0.034, H * 0.014); grip.name = side > 0 ? 'grip.L' : 'grip.R';
    return { shoulder, elbow, wrist, hand, grip, fingers, thumb };
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

  const reach = (amount: number, headPitch = 0): void => {
    const a = Math.max(0, Math.min(1, amount));
    if (a <= 0 && headPitch === 0) return;
    // Right arm forward/down to the console, elbow slightly bent; left arm rests forward as a brace.
    armR.shoulder.rotation.x = armR.shoulder.rotation.x * (1 - a) + (-1.05) * a;
    armR.shoulder.rotation.z = armR.shoulder.rotation.z * (1 - a) + (-0.12) * a;
    armR.elbow.rotation.x = armR.elbow.rotation.x * (1 - a) + 0.35 * a;
    armL.shoulder.rotation.x = armL.shoulder.rotation.x * (1 - a) + (-0.55) * a;
    armL.elbow.rotation.x = armL.elbow.rotation.x * (1 - a) + 0.6 * a;
    neck.rotation.x = headPitch;
  };

  return {
    root,
    head: neck,
    helmet,
    update,
    reach,
    setFacing: (a: number) => { root.rotation.y = a; },
    rightGrip: armR.grip,
    leftGrip: armL.grip,
    setGrip: (amount: number) => {
      const g = Math.max(0, Math.min(1, amount));
      // Fingers curl in, thumb comes across: a closed hand, not a snapped pose.
      armR.fingers.rotation.x = g * 1.25;
      armR.thumb.rotation.z = -g * 0.9;
      armR.thumb.rotation.x = g * 0.35;
    },
    setEpidemicTint: (color: number, intensity: number) => {
      targetTint.setHex(color);
      const shirtTarget = scratchShirtTarget.copy(baseShirt).lerp(targetTint, Math.max(0, Math.min(0.78, intensity)));
      const pantsTarget = scratchPantsTarget.copy(basePants).lerp(targetTint, Math.max(0, Math.min(0.45, intensity * 0.55)));
      // Przejście jest płynne między kolejnymi stanami modelu, nie skok materiału.
      M.shirt.color.lerp(shirtTarget, 0.14);
      M.pants.color.lerp(pantsTarget, 0.12);
    },
    dispose: () => { for (const g of disposables) g.dispose(); Object.values(M).forEach((m) => m.dispose()); extraMaterials.forEach((m) => m.dispose()); },
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
