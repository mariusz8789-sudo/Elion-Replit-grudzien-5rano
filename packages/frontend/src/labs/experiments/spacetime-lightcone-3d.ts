import type * as THREE from 'three';
import type { ExperimentDef, SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { makeSoftDotTexture } from '../../core/three/starfield';
import { detectRenderTier, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Stożek świetlny jako dosłowna bryła 3D, nie płaski diagram "X".
 * W czasoprzestrzeni 2+1 (dwa wymiary przestrzenne x,z + czas ct) stożek
 * świetlny zdarzenia jest DOKŁADNIE powierzchnią x² + z² = (ct)² — prawdziwym
 * stożkiem, który diagram Minkowskiego (spacetime-minkowski.ts, 1+1D) musi
 * spłaszczyć do dwóch linii pod 45°. Tu żadne spłaszczenie nie jest potrzebne.
 *
 * Linie świata bliźniąt (paradoks bliźniąt) leżą w płaszczyźnie z=0 wewnątrz
 * tego stożka: nieruchomy brat to pionowa linia x=0; podróżujący to
 * dosłowny kształt "V" — x = v·t (odlot), x = v·(T−t) (powrót) — którego
 * geometria WYMUSZA, że dla v<c linia zawsze zostaje wewnątrz stożka
 * (styka się z powierzchnią dopiero w granicy v→c).
 *
 * Uproszczenie skalowania: cały przejazd (0..tripYears) jest wyświetlany
 * na stałej wysokości sceny niezależnie od rzeczywistej liczby lat — bo
 * stożek świetlny jest samopodobny (skalowanie t→k·t, x→k·x zachowuje
 * x²+z²=(ct)²), więc kształt linii świata zależy WYŁĄCZNIE od v, nie od
 * tripYears. To wybór czytelności wykresu, nie zniekształcenie fizyki —
 * rzeczywiste lata i γ są podane liczbowo w panelu narracji.
 */

const H = 4.2; // wysokość (i promień) przyszłego stożka w jednostkach sceny
const PAST_H = H * 0.32; // przeszły stożek — krótszy, tylko dla kontekstu
const LOOP_DURATION = 3.2; // sekundy jednego przebiegu pierścienia światła
const RING_POINTS = 64;

function buildConeEdgeLine(three: typeof THREE, apexY: number, height: number, opensUp: boolean, segments = 72): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const dir = opensUp ? 1 : -1;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const r = Math.abs(height);
    pts.push(new three.Vector3(Math.cos(a) * r, apexY + dir * Math.abs(height), Math.sin(a) * r));
  }
  return new three.BufferGeometry().setFromPoints(pts);
}

class LightCone3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.22;

  private three!: typeof THREE;
  private disposables: { dispose(): void }[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;

  private v = 0.6;
  private tripYears = 20;
  private photonElapsed = 0;
  private ringAngleOffset = 0;

  private travelerGeo!: THREE.BufferGeometry;
  private ringGeo!: THREE.BufferGeometry;
  private turnaroundDot!: THREE.Mesh;
  private reunionDot!: THREE.Mesh;

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;
    scene.background = new three.Color(0x02030a);

    // Przyszły stożek (apex w (0,0,0), otwiera się w górę do y=H).
    const futureGeo = new three.ConeGeometry(H, H, 64, 1, true);
    futureGeo.rotateX(Math.PI);
    futureGeo.translate(0, H / 2, 0);
    const coneMat = new three.MeshBasicMaterial({
      color: 0x5a8fd6, transparent: true, opacity: 0.07, side: three.DoubleSide, depthWrite: false,
    });
    const futureMesh = new three.Mesh(futureGeo, coneMat);
    scene.add(futureMesh);
    this.disposables.push(futureGeo, coneMat);

    // Przeszły stożek (kontekst — mniejszy, ta sama fizyka, mniej istotny dla paradoksu bliźniąt).
    const pastGeo = new three.ConeGeometry(PAST_H, PAST_H, 64, 1, true);
    pastGeo.translate(0, -PAST_H / 2, 0);
    const pastMat = new three.MeshBasicMaterial({
      color: 0x5a8fd6, transparent: true, opacity: 0.045, side: three.DoubleSide, depthWrite: false,
    });
    const pastMesh = new three.Mesh(pastGeo, pastMat);
    scene.add(pastMesh);
    this.disposables.push(pastGeo, pastMat);

    // Krawędź stożka (okrąg na szczycie) — czytelność bryły.
    const edgeGeo = buildConeEdgeLine(three, 0, H, true);
    const edgeMat = new three.LineBasicMaterial({ color: 0x5a8fd6, transparent: true, opacity: 0.3 });
    const edgeLine = new three.LineLoop(edgeGeo, edgeMat);
    scene.add(edgeLine);
    this.disposables.push(edgeGeo, edgeMat);

    // Linia świata nieruchomego bliźniaka: pionowa, x=z=0.
    const stationaryGeo = new three.BufferGeometry().setFromPoints([
      new three.Vector3(0, 0, 0), new three.Vector3(0, H, 0),
    ]);
    const stationaryMat = new three.LineBasicMaterial({
      color: 0x5cd6e8, transparent: true, opacity: 0.95, blending: three.AdditiveBlending, depthWrite: false,
    });
    const stationaryLine = new three.Line(stationaryGeo, stationaryMat);
    scene.add(stationaryLine);
    this.disposables.push(stationaryGeo, stationaryMat);

    // Linia świata podróżującego bliźniaka: kształt V, aktualizowana co klatkę wg suwaka v.
    this.travelerGeo = new three.BufferGeometry().setFromPoints([
      new three.Vector3(0, 0, 0), new three.Vector3(0, H / 2, 0), new three.Vector3(0, H, 0),
    ]);
    const travelerMat = new three.LineBasicMaterial({
      color: 0xf0b35c, transparent: true, opacity: 0.95, blending: three.AdditiveBlending, depthWrite: false,
    });
    const travelerLine = new three.Line(this.travelerGeo, travelerMat);
    scene.add(travelerLine);
    this.disposables.push(this.travelerGeo, travelerMat);

    // Zdarzenia kluczowe: start (wspólne dla obu), zawrot podróżnika, spotkanie.
    const dotGeo = new three.SphereGeometry(0.06, 12, 12);
    this.disposables.push(dotGeo);
    const launchMat = new three.MeshBasicMaterial({ color: 0xe6eaf5 });
    const launchDot = new three.Mesh(dotGeo, launchMat);
    launchDot.position.set(0, 0, 0);
    scene.add(launchDot);
    this.disposables.push(launchMat);

    const turnMat = new three.MeshBasicMaterial({ color: 0xf0b35c });
    this.turnaroundDot = new three.Mesh(dotGeo, turnMat);
    scene.add(this.turnaroundDot);
    this.disposables.push(turnMat);

    const reunionMat = new three.MeshBasicMaterial({ color: 0x6ee7a0 });
    this.reunionDot = new three.Mesh(dotGeo, reunionMat);
    this.reunionDot.position.set(0, H, 0);
    scene.add(this.reunionDot);
    this.disposables.push(reunionMat);

    // Pierścień światła — dosłowny front świetlny rozchodzący się od zdarzenia startu,
    // r(t) = c·t = t w tych jednostkach: ciągła, dokładna animacja (nie dekoracyjna).
    const ringPositions = new Float32Array(RING_POINTS * 3);
    this.ringGeo = new three.BufferGeometry();
    this.ringGeo.setAttribute('position', new three.BufferAttribute(ringPositions, 3));
    const tex = makeSoftDotTexture(three);
    const ringMat = new three.PointsMaterial({
      color: 0xf5f8ff, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9,
      map: tex, depthWrite: false, blending: three.AdditiveBlending,
    });
    const ringPoints = new three.Points(this.ringGeo, ringMat);
    scene.add(ringPoints);
    this.disposables.push(this.ringGeo, ringMat, tex);

    scene.add(new three.AmbientLight(0x445066, 1.4));

    camera.position.set(H * 1.15, H * 0.6, H * 1.35);
    camera.lookAt(0, H * 0.35, 0);
  }

  update(dt: number, p: SimParams) {
    this.v = Math.max(0, Math.min(0.99, Number(p.v)));
    this.tripYears = Math.max(1, Number(p.tripYears));
    if (!getSettings().reducedMotion) {
      this.introElapsed = Math.min(1, this.introElapsed + dt);
      this.photonElapsed += dt;
      if (this.photonElapsed >= LOOP_DURATION) {
        this.photonElapsed -= LOOP_DURATION;
        this.ringAngleOffset += 0.37;
      }
    }
  }

  syncScene() {
    // Kształt V linii świata podróżnika zależy tylko od v (patrz uwaga o samopodobieństwie stożka).
    const peakX = this.v * (H / 2);
    const pos = this.travelerGeo.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, 0, 0, 0);
    pos.setXYZ(1, peakX, H / 2, 0);
    pos.setXYZ(2, 0, H, 0);
    pos.needsUpdate = true;
    this.turnaroundDot.position.set(peakX, H / 2, 0);

    // Pierścień = przekrój stożka w chwili t: promień i wysokość rosną razem (r=y=c·t).
    const frac = LOOP_DURATION > 0 ? this.photonElapsed / LOOP_DURATION : 0;
    const y = frac * H;
    const r = y;
    const ringPos = this.ringGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < RING_POINTS; i++) {
      const a = (i / RING_POINTS) * Math.PI * 2 + this.ringAngleOffset;
      ringPos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    }
    ringPos.needsUpdate = true;

    if (this.fadePass) {
      const t = this.introElapsed;
      this.fadePass.uniforms.uFade.value = t * t * (3 - 2 * t);
    }
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const three = this.three;
    const { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass } = modules;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    if (tierAllowsBloom(detectRenderTier())) {
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.4, 0.55, 0.7));
    }
    this.fadePass = createFadePass(ShaderPass, getSettings().reducedMotion ? 1 : 0);
    composer.addPass(this.fadePass);
    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      setSize: (nw, nh) => composer.setSize(nw, nh),
      dispose: () => {
        this.fadePass?.material.dispose();
        composer.dispose();
      },
    };
  }

  getStats() {
    const gamma = 1 / Math.sqrt(1 - this.v * this.v);
    return {
      v: Math.round(this.v * 100) / 100,
      gamma: Math.round(gamma * 100) / 100,
      travelerYears: Math.round((this.tripYears / gamma) * 10) / 10,
    };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

export const spacetimeLightCone3D: ExperimentDef = {
  id: 'lightcone-3d',
  name: 'Stożek świetlny (3D)',
  honesty: 'exact',
  honestyNote:
    'Powierzchnia stożka to dokładne równanie x² + z² = (ct)² — geometria wymuszona przez szczególną teorię względności, nie rysunek poglądowy. Linia świata podróżującego bliźniaka (kształt V) ma nachylenie równe dokładnie v; to, że NIGDY nie przecina powierzchni stożka dla v<c, jest bezpośrednim dowodem geometrycznym zasady przyczynowości. Uproszczenia: zawrot podróżnika jest natychmiastowy (jak w bazowym eksperymencie zegarów świetlnych); cała podróż jest wyskalowana do stałej wysokości na ekranie niezależnie od liczby lat — stożek świetlny jest samopodobny, więc kształt linii zależy tylko od v, a rzeczywiste lata podano liczbowo obok. Pulsujący pierścień to dosłowny front świetlny zdarzenia startu (r = c·t), nie ozdobnik.',
  params: [
    {
      key: 'v', label: 'Prędkość podróżnika', type: 'slider', min: 0, max: 0.99, step: 0.01, default: 0.6,
      format: (v) => `${(v * 100).toFixed(0)}% c`,
    },
    { key: 'tripYears', label: 'Podróż (czas Ziemi)', type: 'slider', min: 2, max: 60, step: 1, default: 20, unit: 'lat' },
  ],
  createSim3D: () => new LightCone3DSim(),
  narrate(p) {
    const v = Math.max(0, Math.min(0.99, Number(p.v)));
    const gamma = 1 / Math.sqrt(1 - v * v);
    const trip = Number(p.tripYears);
    const travelerYears = trip / gamma;
    return [
      {
        title: 'Stożek świetlny to bryła, nie linia',
        body: `W przestrzeni z dwoma wymiarami przestrzennymi stożek świetlny jest dosłownie stożkiem: jego powierzchnia to wszystkie zdarzenia osiągalne dokładnie z prędkością światła. Płaski diagram Minkowskiego (druga zakładka) pokazuje ten sam obiekt spłaszczony do jednego wymiaru przestrzennego — tu nic nie trzeba spłaszczać.`,
      },
      {
        title: `Linia bliźniaka zostaje wewnątrz stożka (v = ${(v * 100).toFixed(0)}% c, γ = ${gamma.toFixed(2)})`,
        body:
          v > 0.9
            ? `Przy tak wysokiej prędkości żółta linia biegnie tuż przy powierzchni stożka — widać bezpośrednio, dlaczego v=c jest granicą nieosiągalną: linia świata musiałaby leżeć DOKŁADNIE na powierzchni, co oznacza zerowy czas własny.`
            : `Nachylenie żółtej linii (podróżnik) wynosi dokładnie v — im bliżej pionu (v=0), tym dalej od powierzchni stożka. Kąt między linią świata a stożkiem to geometryczna miara tego, "jak blisko granicy prędkości światła" porusza się obiekt.`,
      },
      {
        title: `Podróżnik starzeje się o ${travelerYears.toFixed(1)} lat, Ziemia o ${trip}`,
        body: `Zielona kropka na szczycie to zdarzenie spotkania — oba bliźniaki są w tym samym punkcie czasoprzestrzeni, ale dotarły tam różnymi liniami świata o różnej długości własnej. To geometryczny odpowiednik faktu, że dwie trasy między tymi samymi miastami mogą mieć różną długość na mapie.`,
      },
    ];
  },
};
