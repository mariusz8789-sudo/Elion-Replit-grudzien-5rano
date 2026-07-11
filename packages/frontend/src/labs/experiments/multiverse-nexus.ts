import type * as THREE from 'three';
import type { ExperimentDef, NarrationBlock } from '../../core/types';
import type { Sim3D } from '../../core/three/types';
import { setPendingScenario } from '../../core/scenarioBridge';
import { WHAT_IF_SCENARIOS } from '../../data/whatIfScenarios';

/**
 * Multiverse Nexus — oryginalna, własna koncepcja Genesis OS (nie kopia
 * żadnego filmu/serialu): sala z portalami, każdy pokazujący inny model
 * wszechświata. Dwa rodzaje portali:
 *  - "lokalne" — inne stałe fizyczne (core/physics nie jest tu potrzebne,
 *    to te same presety co bazowy eksperyment Multiverse Lab,
 *    effectiveConstants() w multiverse.ts); dotknięcie podświetla portal
 *    i zmienia narrację, NIE opuszcza laboratorium.
 *  - "tunele" (wormhole) — dotknięcie NAPRAWDĘ przenosi do innego
 *    laboratorium z konkretnymi parametrami, przez ISTNIEJĄCY
 *    core/scenarioBridge.ts (dokładnie ten sam most co ekran
 *    „Co by było, gdyby?" — dwa różne wejścia UI do jednego mechanizmu,
 *    zero duplikacji). Parametry tunelu są importowane wprost z
 *    data/whatIfScenarios.ts, żeby nie utrzymywać dwóch kopii tych samych liczb.
 *
 * Każdy portal ma jawny status naukowy w treści Narratora — hipotezy nigdy
 * nie są przedstawiane jako potwierdzone (zasada platformy).
 */

export interface LocalPortal {
  id: string;
  label: string;
  kind: 'local';
  color: number;
  g: number;
  alpha: number;
  strong: number;
  status: string;
  narrative: string;
}

export interface WormholePortal {
  id: string;
  label: string;
  kind: 'wormhole';
  color: number;
  targetLabId: string;
  targetExperimentId?: string;
  targetParams: Record<string, number | boolean | string>;
  status: string;
  narrative: string;
}

export type Portal = LocalPortal | WormholePortal;

/** Zwraca parametry I (jeśli podany) docelowy eksperyment scenariusza — patrz core/scenarioBridge.ts::experimentId. */
function whatIf(id: string): { params: Record<string, number | boolean | string>; experimentId?: string } {
  const s = WHAT_IF_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Brak scenariusza „${id}" w WHAT_IF_SCENARIOS`);
  return { params: s.params as Record<string, number | boolean | string>, experimentId: s.experimentId };
}

export const PORTALS: Portal[] = [
  {
    id: 'custom', label: 'Nasz Wszechświat', kind: 'local', color: 0x5cd6e8,
    g: 1, alpha: 1, strong: 1,
    status: 'Potwierdzony — to nie hipoteza, to Wszechświat, w którym żyjesz.',
    narrative: 'Grawitacja, siła elektromagnetyczna i oddziaływanie silne mają dokładnie te wartości, przy których gwiazdy palą się miliardy lat, a chemia węglowa (i życie) jest w ogóle możliwa.',
  },
  {
    id: 'carbonless', label: 'Świat bez węgla', kind: 'local', color: 0xf47c7c,
    g: 1, alpha: 1, strong: 0.86,
    status: 'Model teoretyczny (literatura fine-tuningu, szacunek rzędu wielkości).',
    narrative: 'Oddziaływanie silne osłabione do 0,86× — deuter przestaje być związany, pierwsze ogniwo syntezy jąder pęka. Gwiazdy świecą, ale nigdy nie powstaje węgiel ani tlen.',
  },
  {
    id: 'explosive', label: 'Wybuchowe gwiazdy', kind: 'local', color: 0xf0b35c,
    g: 1, alpha: 1, strong: 1.14,
    status: 'Model teoretyczny (literatura fine-tuningu, szacunek rzędu wielkości).',
    narrative: 'Oddziaływanie silne wzmocnione do 1,14× — diproton staje się związany, gwiazdy spalają paliwo w mgnieniu oka zamiast przez miliardy lat.',
  },
  {
    id: 'crushing', label: 'Ciężka grawitacja', kind: 'local', color: 0xa78bfa,
    g: Math.pow(10, 0.7), alpha: 1, strong: 1,
    status: 'Model teoretyczny (skalowanie t ~ G⁻², szacunek rzędu wielkości).',
    narrative: 'Grawitacja 5× silniejsza — gwiazdy żyją ~25× krócej, planety krążą ciasno i szybko. Okno czasowe na ewolucję złożonego życia niemal się zamyka.',
  },
  {
    id: 'no-dark-energy', label: 'Świat bez ciemnej energii', kind: 'wormhole', color: 0x8d97b4,
    targetLabId: 'universe', targetExperimentId: whatIf('no-dark-energy').experimentId, targetParams: whatIf('no-dark-energy').params,
    status: 'Model potwierdzony (równanie Friedmanna); wartość Ω_Λ=0 to kontrfaktyczny scenariusz, nie pomiar.',
    narrative: 'Prawdziwe równania Universe Lab, ale z wyzerowaną ciemną energią — ekspansja zwalnia zamiast przyspieszać.',
  },
  {
    id: 'runaway-expansion', label: 'Wieczna, przyspieszająca ekspansja', kind: 'wormhole', color: 0x6ee7a0,
    targetLabId: 'universe', targetExperimentId: whatIf('runaway-expansion').experimentId, targetParams: whatIf('runaway-expansion').params,
    status: 'Model potwierdzony (równanie Friedmanna); Ω_Λ=0,99 to skrajny, ale policzalny scenariusz.',
    narrative: 'Ciemna energia zdominowana niemal całkowicie — galaktyki rozbiegają się gwałtowniej niż w naszym Wszechświecie.',
  },
];

const RADIUS = 7;

interface PortalObj {
  portal: Portal;
  ring: THREE.Mesh;
  core: THREE.Mesh;
  glow: THREE.Sprite;
}

function makeGlowTexture(three: typeof THREE, color: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `${color}cc`);
  grad.addColorStop(0.4, `${color}55`);
  grad.addColorStop(1, `${color}00`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

class NexusSim implements Sim3D {
  private t = 0;
  private camera?: THREE.PerspectiveCamera;
  private raycaster?: THREE.Raycaster;
  private w = 1;
  private h = 1;
  private portalObjs: PortalObj[] = [];
  private disposables: { dispose(): void }[] = [];
  private focusedIndex = 0;
  private lastWormhole: Portal | null = null;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number) {
    this.camera = camera;
    this.raycaster = new three.Raycaster();
    this.w = w;
    this.h = h;

    scene.add(new three.AmbientLight(0x223344, 1.1));

    PORTALS.forEach((portal, i) => {
      const angle = (i / PORTALS.length) * Math.PI * 2;
      const y = i % 2 === 0 ? 0.3 : -0.3;
      const x = RADIUS * Math.sin(angle);
      const z = RADIUS * Math.cos(angle);

      const ringGeo = new three.TorusGeometry(1.6, 0.09, 16, 48);
      const ringMat = new three.MeshBasicMaterial({ color: portal.color });
      const ring = new three.Mesh(ringGeo, ringMat);
      ring.position.set(x, y, z);
      ring.lookAt(0, y, 0);
      scene.add(ring);
      this.disposables.push(ringGeo, ringMat);

      const coreGeo = new three.SphereGeometry(portal.kind === 'local' ? 0.22 + portal.g * 0.08 : 0.3, 20, 20);
      const coreMat = new three.MeshBasicMaterial({ color: portal.color });
      const core = new three.Mesh(coreGeo, coreMat);
      core.position.set(x, y, z);
      scene.add(core);
      this.disposables.push(coreGeo, coreMat);

      const hex = `#${portal.color.toString(16).padStart(6, '0')}`;
      const glowTex = makeGlowTexture(three, hex);
      const glowMat = new three.SpriteMaterial({ map: glowTex, color: portal.color, transparent: true, blending: three.AdditiveBlending, depthWrite: false });
      const glow = new three.Sprite(glowMat);
      glow.position.set(x, y, z);
      glow.scale.set(3.4, 3.4, 1);
      scene.add(glow);
      this.disposables.push(glowTex, glowMat);

      this.portalObjs.push({ portal, ring, core, glow });
    });

    // OrbitControls (utworzony w useThreeLoop.ts) domyślnie orbituje wokół
    // (0,0,0) — kamera musi być realnie OD DALA od tego punktu, inaczej po
    // pierwszym controls.update() wektor kamera→cel jest niemal zdegenerowany
    // i widok "ucieka" w przypadkową stronę (ten sam wzorzec co Układ
    // Słoneczny 3D: patrzymy z zewnątrz na środek, nie stoimy w środku).
    camera.position.set(0, RADIUS * 0.55, RADIUS * 1.7);
    camera.lookAt(0, 0, 0);
  }

  reset = () => {
    this.focusedIndex = 0;
    this.lastWormhole = null;
  };

  onResize(w: number, h: number) {
    this.w = w;
    this.h = h;
  }

  update(dt: number) {
    this.t += dt;
  }

  syncScene() {
    for (let i = 0; i < this.portalObjs.length; i++) {
      const { ring, core, glow } = this.portalObjs[i];
      const focused = i === this.focusedIndex;
      const pulse = 1 + Math.sin(this.t * 2 + i) * 0.06;
      ring.rotation.z += 0.003 * (focused ? 3 : 1);
      const s = focused ? 1.18 * pulse : pulse;
      core.scale.setScalar(s);
      glow.scale.setScalar((focused ? 4.4 : 3.4) * pulse);
    }
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up') {
    if (type !== 'down' || !this.camera || !this.raycaster) return;
    const nx = (x / this.w) * 2 - 1;
    const ny = -(y / this.h) * 2 + 1;
    this.raycaster.setFromCamera({ x: nx, y: ny } as THREE.Vector2, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.portalObjs.flatMap((p) => [p.ring, p.core]),
      false,
    );
    if (hits.length === 0) return;
    const hitObj = hits[0].object;
    const idx = this.portalObjs.findIndex((p) => p.ring === hitObj || p.core === hitObj);
    if (idx < 0) return;
    const portal = PORTALS[idx];
    if (portal.kind === 'wormhole') {
      this.lastWormhole = portal;
      setPendingScenario(portal.targetLabId, portal.targetParams, portal.targetExperimentId);
      window.location.hash = `#/lab/${portal.targetLabId}`;
      return;
    }
    this.focusedIndex = idx;
  }

  getStats() {
    return {
      focusedIndex: this.focusedIndex,
      wormholeUsed: this.lastWormhole ? 1 : 0,
    };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.portalObjs = [];
  }
}

export const multiverseNexus: ExperimentDef = {
  id: 'nexus',
  name: 'Multiverse Nexus',
  honesty: 'theoretical',
  honestyNote:
    'Sala z portalami to oryginalna metafora nawigacyjna Genesis OS, nie fizyczna hipoteza. Portale "lokalne" (Świat bez węgla, Wybuchowe gwiazdy, Ciężka grawitacja) to te same modele teoretyczne co reszta Multiverse Lab — szacunki rzędu wielkości z literatury fine-tuningu, nie precyzyjne przewidywania. Portale-tunele (Świat bez ciemnej energii, Wieczna ekspansja) NAPRAWDĘ przenoszą do Universe Lab z konkretnymi, policzalnymi parametrami — to nie są science-fiction, to te same równania Friedmanna co reszta platformy, tylko przy skrajnych wartościach Ω_Λ.',
  params: [],
  createSim3D: () => new NexusSim(),
  narrate(_p, stats) {
    const idx = Math.max(0, Math.min(PORTALS.length - 1, Number(stats.focusedIndex ?? 0)));
    const portal = PORTALS[idx];
    const blocks: NarrationBlock[] = [
      {
        title: `${portal.label}${portal.kind === 'wormhole' ? ' 🌀 (tunel — dotknij, by przejść)' : ''}`,
        kind: portal.kind === 'wormhole' ? 'insight' : 'hypothesis',
        body: `${portal.narrative} Status: ${portal.status}`,
      },
      {
        title: 'Jak nawigować Nexusem',
        body:
          'Dotknij pierścienia jednego z sześciu portali. Cztery świecące na cyjan/czerwono/złoto/fiolet to inne stałe fizyczne (zostajesz w tym laboratorium, zmienia się tylko ta karta). Dwa oznaczone jako "tunel" naprawdę przenoszą do Universe Lab z realnymi, obliczonymi parametrami — to nie jest tylko ilustracja, tam zobaczysz działającą symulację.',
      },
      {
        title: 'Wszystkie portale w tej sali',
        body: PORTALS.map((p) => `${p.kind === 'wormhole' ? '🌀' : '●'} ${p.label}`).join(' · '),
      },
    ];
    return blocks;
  },
};
