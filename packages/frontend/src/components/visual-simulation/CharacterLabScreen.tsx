import { useMemo, useState } from 'react';
import type * as THREE_NS from 'three';
import type { Sim3D } from '../../core/three/types';
import type { SimParams } from '../../core/types';
import { useThreeLoop } from '../../core/three/useThreeLoop';
import { buildCharacter, paletteFromSeed, type Character, type PoseMode } from '../../core/three/characterRig';

/**
 * CHARACTER LAB (Etap 1 migracji wizualnej do WebGL) — JEDEN zrigowany humanoid
 * 3D na żywo w Genesis, na istniejącej infrastrukturze Sim3D/useThreeLoop.
 * Cel „twardej bramki": pełna sylwetka + ubranie + rig + idle/walk/gesture +
 * kontakt stóp + osadzenie w scenie, ZANIM przejdziemy do tłumu i cinematic tour.
 * Model naukowy NIE jest tu obecny — to czysta walidacja warstwy wizualnej.
 */

class CharacterSim3D implements Sim3D {
  cameraAutoRotateSpeed = 0.6;
  private t = 0;
  private mode: PoseMode = 'walk';
  private char: Character | null = null;
  private shadow: THREE_NS.Mesh | null = null;
  private THREE: typeof THREE_NS | null = null;
  private angle = 0;
  private radius = 1.15;

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.THREE = THREE;
    scene.background = new THREE.Color(0x0b1220);
    scene.fog = new THREE.Fog(0x0b1220, 8, 22);

    // Oświetlenie „cinematic real-time": miękkie wypełnienie + kierunkowy klucz.
    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x30303a, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(3, 6, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.5); rim.position.set(-4, 3, -3); scene.add(rim);

    // Podłoże + delikatna siatka (osadzenie w świecie).
    const groundGeo = new THREE.CircleGeometry(9, 48);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const grid = new THREE.GridHelper(18, 36, 0x2a3550, 0x1b2336); (grid.material as THREE_NS.Material).opacity = 0.5; (grid.material as THREE_NS.Material).transparent = true; scene.add(grid);

    // Miękki cień kontaktowy pod stopami (bez shadow-map — czytelny kontakt z podłożem).
    const shGeo = new THREE.CircleGeometry(0.32, 24);
    this.shadow = new THREE.Mesh(shGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.01; scene.add(this.shadow);

    // Postać.
    const pal = paletteFromSeed(7);
    this.char = buildCharacter(THREE, { height: 1.75, ...pal });
    scene.add(this.char.root);

    camera.position.set(2.4, 1.7, 3.2);
    camera.lookAt(0, 0.9, 0);
  }

  getOrbitTarget(): THREE_NS.Vector3 | null {
    return this.THREE ? new this.THREE.Vector3(0, 0.9, 0) : null;
  }

  update(dt: number, params: SimParams): void {
    this.t += dt;
    const m = String(params.mode ?? 'walk');
    this.mode = (m === 'idle' || m === 'walk' || m === 'gesture') ? m : 'walk';
    if (this.mode === 'walk') this.angle += dt * 0.55; // obchód po okręgu (foot-lock ~ tempo kroku)
  }

  syncScene(): void {
    if (!this.char) return;
    this.char.update(this.mode, this.t, 1);
    if (this.mode === 'walk') {
      const x = Math.cos(this.angle) * this.radius, z = Math.sin(this.angle) * this.radius;
      this.char.root.position.x = x; this.char.root.position.z = z;
      this.char.setFacing(-this.angle + Math.PI / 2);
    } else {
      this.char.root.position.x = 0; this.char.root.position.z = 0; this.char.setFacing(0.4);
    }
    if (this.shadow) { this.shadow.position.x = this.char.root.position.x; this.shadow.position.z = this.char.root.position.z; }
  }

  dispose(): void { this.char?.dispose(); }
}

export function CharacterLabScreen() {
  const sim = useMemo(() => new CharacterSim3D(), []);
  const [mode, setMode] = useState<PoseMode>('walk');
  const params = useMemo<SimParams>(() => ({ mode }), [mode]);
  const { canvasRef, loading, failed } = useThreeLoop(sim, params, true);

  return (
    <main id="main-content" tabIndex={-1} className="home character-lab">
      <div className="honesty-row">
        <span className="honesty educational">Warstwa wizualna (WebGL)</span>
        <span className="honesty-note">
          Etap 1 migracji do Three.js: pojedynczy zrigowany humanoid 3D (pełna sylwetka, ubranie, rig, idle/walk/gesture, kontakt stóp).
          To walidacja jakości POSTACI przed tłumem i cinematic tour. Model naukowy Genesis pozostaje bez zmian.
        </span>
      </div>

      <div className="character-stage">
        <canvas ref={canvasRef} className="character-canvas" aria-label="Zrigowany humanoid 3D (Three.js)" />
        {loading && <div className="route-loading" role="status">Ładowanie silnika 3D…</div>}
        {failed && <div className="empty-state">Nie udało się uruchomić WebGL na tym urządzeniu.</div>}
      </div>

      <div className="sim-transport">
        {(['idle', 'walk', 'gesture'] as PoseMode[]).map((m) => (
          <button key={m} className="chip-btn" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'idle' ? 'Idle' : m === 'walk' ? 'Chód' : 'Gest'}
          </button>
        ))}
        <span className="sim-daylabel">Przeciągnij, aby obrócić kamerę · kółko = zoom</span>
      </div>

      <p className="footer-note">
        Rig: core/three/characterRig.ts (proceduralny; hak loadGltfCharacter na skinned glTF w kolejnej iteracji).
        Scena: Sim3D + useThreeLoop (ta sama infrastruktura co czarna dziura 3D, helisa DNA 3D, układ słoneczny 3D).
      </p>
    </main>
  );
}
