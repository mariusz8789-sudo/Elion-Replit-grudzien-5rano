import type * as THREE_NS from 'three';
import type { AgentActionState } from '../scientificWorlds/agentActionMachine';
import { buildCharacter, type Character } from './characterRig';

/**
 * Visual-only embodiment of the existing Genesis Science Chat interface.
 *
 * This module owns no language model, memory, messages or autonomy.  The UI
 * opens the single globally-mounted ScienceChat through scienceChatBridge;
 * this object only gives that interface a deterministic presence in the
 * Human Biology Lab.
 */
export const HOLOGRAPHIC_COMPANION_CLASS = 'VISUAL_AI_COMPANION' as const;
export const HOLOGRAPHIC_COMPANION_EPISTEMIC = 'MODEL' as const;

export type HolographicCompanionMode = 'IDLE' | 'LISTENING' | 'SPEAKING' | 'POINTING';

export interface HolographicCompanionDiagnostics {
  readonly classification: typeof HOLOGRAPHIC_COMPANION_CLASS;
  readonly epistemicStatus: typeof HOLOGRAPHIC_COMPANION_EPISTEMIC;
  readonly mode: HolographicCompanionMode;
  readonly connectedChat: 'SCIENCE_CHAT';
  readonly autonomousConsciousness: false;
}

export interface HolographicResearchCompanion {
  readonly root: THREE_NS.Group;
  /** Marks the existing chat interface as ready to listen for a short, deterministic interval. */
  engage(timeSeconds: number, durationSeconds?: number): void;
  /** Maps the real lab-agent state to a visual pose; it never mutates that state. */
  update(timeSeconds: number, agentState: AgentActionState): void;
  getDiagnostics(): HolographicCompanionDiagnostics;
  dispose(): void;
}

/** Pure state projection used by the renderer and unit tests. */
export function companionModeForAgentState(
  state: AgentActionState,
  chatListening: boolean,
): HolographicCompanionMode {
  if (state === 'REPORTING' || state === 'OBSERVING') return 'SPEAKING';
  if (state === 'REACHING' || state === 'INTERACTING' || state === 'EXECUTING') return 'POINTING';
  if (chatListening || state === 'MOVING_TO_TARGET' || state === 'ARRIVED' || state === 'ALIGNING' || state === 'RETURNING') return 'LISTENING';
  return 'IDLE';
}

/**
 * Builds a translucent, scan-lined scientist from the canonical procedural
 * character rig.  Placement intentionally stays outside the Human Twin's
 * central chamber and its TWIN-camera framing cone.
 */
export function createHolographicResearchCompanion(
  THREE: typeof THREE_NS,
  position: THREE_NS.Vector3Tuple = [-3.15, 0.08, 1.9],
): HolographicResearchCompanion {
  const root = new THREE.Group();
  root.name = 'holographic-research-companion';
  root.position.set(...position);
  root.userData.classification = HOLOGRAPHIC_COMPANION_CLASS;
  root.userData.epistemicStatus = HOLOGRAPHIC_COMPANION_EPISTEMIC;
  root.userData.connectedChat = 'SCIENCE_CHAT';
  root.userData.autonomousConsciousness = false;

  const character: Character = buildCharacter(THREE, {
    height: 1.72,
    skin: 0x70e8ff,
    shirt: 0x38bdf8,
    pants: 0x1e88b8,
    shoes: 0x0b5270,
    hair: 0x8df3ff,
  });
  character.root.name = 'holographic-scientist-rig';
  character.setFacing(Math.atan2(3.15, -1.9));

  const hologramMaterials: THREE_NS.Material[] = [];
  character.root.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.42;
      material.depthWrite = false;
      material.blending = THREE.AdditiveBlending;
      const lit = material as THREE_NS.MeshStandardMaterial;
      if (lit.color) lit.color.setHex(0x48dafa);
      if (lit.emissive) { lit.emissive.setHex(0x0b8eaf); lit.emissiveIntensity = 1.45; }
      hologramMaterials.push(material);
    }
  });
  root.add(character.root);

  const baseMaterial = new THREE.MeshBasicMaterial({ color: 0x55dcff, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.5, 0.045, 48, 1, true), baseMaterial);
  base.name = 'holographic-companion-projector';
  base.position.y = -0.045;
  root.add(base);

  const ringGeometry = new THREE.TorusGeometry(0.43, 0.012, 6, 48);
  const rings: THREE_NS.Mesh[] = [];
  for (let index = 0; index < 5; index++) {
    const ring = new THREE.Mesh(ringGeometry, baseMaterial);
    ring.name = `holographic-scan-ring-${index}`;
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12 + index * 0.34;
    root.add(ring);
    rings.push(ring);
  }

  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(54 * 3);
  for (let index = 0; index < 54; index++) {
    const phase = index * 2.399963229728653;
    const radius = 0.24 + (index % 7) * 0.032;
    particlePositions[index * 3] = Math.cos(phase) * radius;
    particlePositions[index * 3 + 1] = 0.05 + (index % 18) * 0.096;
    particlePositions[index * 3 + 2] = Math.sin(phase) * radius;
  }
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const particleMaterial = new THREE.PointsMaterial({ color: 0x7eeaff, size: 0.022, transparent: true, opacity: 0.58, depthWrite: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.name = 'holographic-companion-data-points';
  root.add(particles);

  let mode: HolographicCompanionMode = 'IDLE';
  let listeningUntil = Number.NEGATIVE_INFINITY;

  const getDiagnostics = (): HolographicCompanionDiagnostics => ({
    classification: HOLOGRAPHIC_COMPANION_CLASS,
    epistemicStatus: HOLOGRAPHIC_COMPANION_EPISTEMIC,
    mode,
    connectedChat: 'SCIENCE_CHAT',
    autonomousConsciousness: false,
  });

  return {
    root,
    engage: (timeSeconds, durationSeconds = 12) => {
      listeningUntil = Math.max(listeningUntil, timeSeconds + Math.max(0, durationSeconds));
    },
    update: (timeSeconds, agentState) => {
      mode = companionModeForAgentState(agentState, timeSeconds < listeningUntil);
      character.update(mode === 'SPEAKING' || mode === 'POINTING' ? 'gesture' : 'idle', timeSeconds, 0);
      if (mode === 'POINTING') character.reach(0.92, -0.08);
      root.position.y = position[1] + Math.sin(timeSeconds * 1.15) * 0.025;
      character.root.scale.setScalar(1 + Math.sin(timeSeconds * 2.2) * 0.008);
      particles.rotation.y = timeSeconds * 0.22;
      particleMaterial.opacity = mode === 'SPEAKING' ? 0.82 : mode === 'LISTENING' ? 0.7 : 0.52;
      baseMaterial.opacity = 0.5 + 0.16 * (0.5 + 0.5 * Math.sin(timeSeconds * 2.8));
      hologramMaterials.forEach((material, index) => {
        material.opacity = 0.34 + 0.11 * (0.5 + 0.5 * Math.sin(timeSeconds * 2.0 + index * 0.17));
      });
      rings.forEach((ring, index) => {
        ring.position.y = 0.08 + ((timeSeconds * 0.24 + index * 0.34) % 1.72);
        ring.scale.setScalar(mode === 'SPEAKING' ? 1.05 : 1);
      });
    },
    getDiagnostics,
    dispose: () => {
      character.dispose();
      ringGeometry.dispose();
      base.geometry.dispose();
      baseMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
    },
  };
}
