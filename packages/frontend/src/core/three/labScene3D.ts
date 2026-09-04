import type * as THREE_NS from 'three';
import type { Sim3D } from './types';
import type { SimParams } from '../types';
import { FirstPersonController, type MoveKey } from './firstPersonController';
import { CameraFlight, flightBetween } from '../reality/cameraSequencer';
import type { HospitalStatus } from '../simulation/hospitalResource';
import type { ScenarioDaySample } from '../simulation/scenarioEngine';

/**
 * FIRST-PERSON LAB SCENE — czysta WARSTWA PREZENTACJI (Sim3D). Nigdy nie
 * liczy prawdy naukowej: przyjmuje gotowe, już policzone `ScenarioDaySample[]`
 * (patrz core/experimentFabric/labSession.ts, które woła istniejący
 * Scenario Engine) i wyłącznie POKAZUJE dzień po dniu realne
 * `sample.hospital.bedOccupancy/icuOccupancy/status` na naczyniu na
 * stanowisku. Kamera pierwszoosobowa (core/three/firstPersonController.ts,
 * czysta matematyka) i loty kinowe (core/reality/cameraSequencer.ts,
 * istniejące, niezmienione) to jedyne dwa systemy ruchu kamery — ta klasa
 * tylko je składa i stosuje do prawdziwej kamery WebGL.
 *
 * Reakcja kamery na przekroczenie CRITICAL jest WYŁĄCZNIE odczytem
 * `sample.hospital.status` dostarczonego przez wywołującego — scena nigdy
 * nie decyduje sama, kiedy coś jest "dramatyczne".
 */

export type LabCameraPhase = 'FREE' | 'FLIGHT' | 'FIXED';
export type LabFixedKind = 'NONE' | 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY';
export type LabPlayTag = 'NONE' | 'A' | 'B' | 'REPLAY';

const ROOM = { minX: -3.5, maxX: 3.5, minZ: -2.7, maxZ: 2.7 };
const STATION_OBSTACLE = { minX: -0.95, maxX: 0.95, minZ: -0.95, maxZ: 0.95 };
const CONSOLE_POSITION: THREE_NS.Vector3Tuple = [0, 0.55, 0.75];
const VESSEL_POSITION: THREE_NS.Vector3Tuple = [0, 0.8, -0.2];
const INTERACT_MAX_DISTANCE = 1.85;
const INTERACT_MIN_FACING_DOT = 0.45;
const DAYS_PER_SECOND = 10;

const STATUS_COLOR: Record<HospitalStatus, number> = {
  NORMAL: 0x3fa9f5,
  WARNING: 0xf0c542,
  HIGH: 0xf5943f,
  CRITICAL: 0xf24444,
};

function statusCode(status: HospitalStatus | 'IDLE'): number {
  if (status === 'IDLE' || status === 'NORMAL') return 0;
  if (status === 'WARNING') return 1;
  if (status === 'HIGH') return 2;
  return 3;
}

function phaseCode(phase: LabCameraPhase): number {
  return phase === 'FREE' ? 0 : phase === 'FLIGHT' ? 1 : 2;
}

function fixedKindCode(kind: LabFixedKind): number {
  return kind === 'NONE' ? 0 : kind === 'SCIENTIFIC' ? 1 : kind === 'ANOMALY' ? 2 : 3;
}

function tagCode(tag: LabPlayTag): number {
  return tag === 'NONE' ? 0 : tag === 'A' ? 1 : tag === 'B' ? 2 : 3;
}

/** Ramka kamery [pozycja, lookAt] u wskazanego "wachlarzowego" widoku instrumentu. */
function scientificFraming(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY'): { position: [number, number, number]; lookAt: [number, number, number] } {
  const lookAt: [number, number, number] = [VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.15, VESSEL_POSITION[2]];
  if (kind === 'ANOMALY') return { position: [0.55, 1.35, 0.65], lookAt };
  if (kind === 'REPLAY') return { position: [-0.85, 1.55, 1.15], lookAt };
  return { position: [0.85, 1.6, 1.25], lookAt };
}

export class LabScene3D implements Sim3D {
  disableOrbitControls = true;

  private THREE: typeof THREE_NS | null = null;
  private controller = new FirstPersonController({
    room: ROOM,
    obstacles: [STATION_OBSTACLE],
    startPosition: { x: 0, z: 2.3 },
    startYaw: 0,
  });

  private raycaster: THREE_NS.Raycaster | null = null;
  private consoleMesh: THREE_NS.Mesh | null = null;
  private consolePanel: THREE_NS.Mesh | null = null;
  private monitorScreen: THREE_NS.Mesh | null = null;
  private fluidMesh: THREE_NS.Mesh | null = null;
  private icuLight: THREE_NS.PointLight | null = null;
  private vesselLight: THREE_NS.PointLight | null = null;
  private vesselOuterMaterial: THREE_NS.MeshPhysicalMaterial | null = null;

  private nearStation = false;

  private cameraPhase: LabCameraPhase = 'FREE';
  private fixedKind: LabFixedKind = 'NONE';
  private flight: CameraFlight | null = null;
  private flightGoingToFree = false;
  private liveCameraPosition: [number, number, number] = [0, 1.7, 1.9];
  private liveCameraLookAt: [number, number, number] = [0, 1.7, 0.9];

  private playSeriesData: readonly ScenarioDaySample[] = [];
  private playTag: LabPlayTag = 'NONE';
  private playElapsed = 0;
  private playDayIndex = -1;
  private playbackDone = false;
  private playbackPaused = false;
  private anomalyTriggeredForRun = false;

  private vesselFraction = 0;
  private vesselIcuFraction = 0;
  private vesselStatus: HospitalStatus | 'IDLE' = 'IDLE';

  // --- Input, called from the React screen's key/mouse listeners ---
  setMoveKey(key: MoveKey, down: boolean): void {
    if (this.cameraPhase === 'FREE') this.controller.setKey(key, down);
  }

  addMouseLook(dx: number, dy: number): void {
    if (this.cameraPhase === 'FREE') this.controller.addMouseDelta(dx, dy);
  }

  // --- Experiment/session hooks, called from the React screen ---
  /** Zaczyna odtwarzanie REALNEJ, już policzonej serii dzień po dniu. */
  playSeries(series: readonly ScenarioDaySample[], tag: LabPlayTag): void {
    this.playSeriesData = series;
    this.playTag = tag;
    this.playElapsed = 0;
    this.playDayIndex = -1;
    this.playbackDone = series.length === 0;
    this.playbackPaused = false;
    this.anomalyTriggeredForRun = false;
    if (series.length > 0) this.applyDay(series[0]!);
  }

  pausePlayback(): void { this.playbackPaused = true; }
  resumePlayback(): void { this.playbackPaused = false; }

  resetVessel(): void {
    this.playSeriesData = [];
    this.playTag = 'NONE';
    this.playElapsed = 0;
    this.playDayIndex = -1;
    this.playbackDone = false;
    this.playbackPaused = false;
    this.vesselFraction = 0;
    this.vesselIcuFraction = 0;
    this.vesselStatus = 'IDLE';
  }

  /** Kamera naukowa przejmuje kontrolę — lot z bieżącego kadru do stałego widoku instrumentu. */
  focusScientific(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY'): void {
    if (this.cameraPhase === 'FIXED' && this.fixedKind === kind) return;
    const from = { position: [...this.liveCameraPosition] as [number, number, number], lookAt: [...this.liveCameraLookAt] as [number, number, number] };
    const to = scientificFraming(kind);
    this.flight = flightBetween(from, to, 1.15);
    this.cameraPhase = 'FLIGHT';
    this.flightGoingToFree = false;
    this.fixedKind = kind === 'SCIENTIFIC' ? 'SCIENTIFIC' : kind === 'ANOMALY' ? 'ANOMALY' : 'REPLAY';
  }

  /** Oddaje kontrolę pierwszoosobową — lot z bieżącego kadru z powrotem do gracza. */
  returnToFirstPerson(): void {
    if (this.cameraPhase === 'FREE') return;
    const state = this.controller.getState();
    const forward = this.controller.getForward();
    const from = { position: [...this.liveCameraPosition] as [number, number, number], lookAt: [...this.liveCameraLookAt] as [number, number, number] };
    const to: [number, number, number] = [state.position.x + forward.x, state.position.y, state.position.z + forward.z];
    this.flight = flightBetween(from, { position: [state.position.x, state.position.y, state.position.z], lookAt: to }, 1.0);
    this.cameraPhase = 'FLIGHT';
    this.flightGoingToFree = true;
    this.fixedKind = 'NONE';
  }

  getStats(): Record<string, number> {
    return {
      nearStation: this.nearStation ? 1 : 0,
      cameraPhase: phaseCode(this.cameraPhase),
      fixedKind: fixedKindCode(this.fixedKind),
      playing: this.playSeriesData.length > 0 && !this.playbackDone ? 1 : 0,
      playbackDone: this.playbackDone ? 1 : 0,
      dayIndex: this.playDayIndex,
      totalDays: this.playSeriesData.length,
      vesselFraction: this.vesselFraction,
      vesselIcuFraction: this.vesselIcuFraction,
      vesselStatusCode: statusCode(this.vesselStatus),
      playTag: tagCode(this.playTag),
    };
  }

  private applyDay(sample: ScenarioDaySample): void {
    this.vesselFraction = Math.max(0, Math.min(1, sample.hospital.bedOccupancy));
    this.vesselIcuFraction = Math.max(0, Math.min(1, sample.hospital.icuOccupancy));
    this.vesselStatus = sample.hospital.status;
    if (sample.hospital.status === 'CRITICAL' && !this.anomalyTriggeredForRun && this.playTag !== 'REPLAY') {
      this.anomalyTriggeredForRun = true;
      this.focusScientific('ANOMALY');
    }
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.THREE = THREE;
    this.raycaster = new THREE.Raycaster();
    scene.background = new THREE.Color(0x090c14);
    scene.fog = new THREE.Fog(0x090c14, 6, 16);

    // Ściany + sufit: jeden box renderowany od wewnątrz (BackSide) — tanie i wystarczające.
    const roomWidth = ROOM.maxX - ROOM.minX;
    const roomDepth = ROOM.maxZ - ROOM.minZ;
    const roomHeight = 3.2;
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth),
      new THREE.MeshStandardMaterial({ color: 0x333f59, roughness: 0.8, metalness: 0.08, side: THREE.BackSide }),
    );
    shell.position.set(0, roomHeight / 2, 0);
    scene.add(shell);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth - 0.05, roomDepth - 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1e2536, roughness: 0.35, metalness: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    scene.add(floor);
    // Cienka listwa świetlna wzdłuż podstawy ścian zamiast siatki-debug —
    // czysto dekoracyjna głębia, nie dane naukowe.
    const baseGlow = new THREE.Mesh(
      new THREE.RingGeometry(Math.min(roomWidth, roomDepth) / 2 - 0.04, Math.min(roomWidth, roomDepth) / 2, 48),
      new THREE.MeshBasicMaterial({ color: 0x2f5a8f, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    baseGlow.rotation.x = -Math.PI / 2;
    baseGlow.position.y = 0.015;
    scene.add(baseGlow);

    // "Okno" świecące — realistyczne źródło światła dziennego + głębia/parallax (czysto dekoracyjne).
    const windowMat = new THREE.MeshStandardMaterial({ color: 0x3a6fb5, emissive: 0x4d86d6, emissiveIntensity: 0.9, roughness: 0.4 });
    const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.15), windowMat);
    windowPane.position.set(-roomWidth / 2 + 0.02, 1.95, -0.6);
    windowPane.rotation.y = Math.PI / 2;
    scene.add(windowPane);
    const windowLight = new THREE.PointLight(0x6ea6e8, 0.6, 6, 2);
    windowLight.position.set(-roomWidth / 2 + 0.6, 1.95, -0.6);
    scene.add(windowLight);

    // Oświetlenie: miękkie wypełnienie z DWÓCH stron (żeby ściany nie ginęły w czerni)
    // + ciepłe światło robocze nad stanowiskiem + wisząca oprawa.
    // Uwaga: ściany/sufit renderowane od wewnątrz (BackSide) mają odwrócone
    // normalne, więc HemisphereLight przypisuje sufitowi kolor "gruntu", a
    // podłodze kolor "nieba" — oba ustawione podobnie jasno, żeby to
    // odwrócenie nie gasiło sufitu.
    scene.add(new THREE.HemisphereLight(0xb9cbf0, 0xaebbe0, 1.1));
    const skyLight = new THREE.DirectionalLight(0xcfe0ff, 0.7);
    skyLight.position.set(-2, 3, -1);
    scene.add(skyLight);
    const fillLight = new THREE.DirectionalLight(0x8fa8d6, 0.45);
    fillLight.position.set(2.5, 2.2, 2);
    scene.add(fillLight);
    const workLight = new THREE.PointLight(0xfff1d6, 1.6, 8, 2);
    workLight.position.set(0, 2.7, 0.1);
    scene.add(workLight);
    // Oprawa wisząca (widoczna geometria + realne źródło światła) — wzmacnia głębię sufitu.
    const pendantCable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.8 }),
    );
    pendantCable.position.set(0, 2.75, 0.1);
    scene.add(pendantCable);
    const pendantShade = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.16, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0xfff1d6, emissiveIntensity: 0.25, roughness: 0.5, side: THREE.DoubleSide }),
    );
    pendantShade.position.set(0, 2.28, 0.1);
    scene.add(pendantShade);

    // Stanowisko: podest + trzy nóżki (czyta się jak realna aparatura, nie geometria placeholder).
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.15, 0.15, 28),
      new THREE.MeshStandardMaterial({ color: 0x2c3650, roughness: 0.45, metalness: 0.35 }),
    );
    platform.position.set(VESSEL_POSITION[0], 0.075, VESSEL_POSITION[2]);
    scene.add(platform);
    const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 10);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x40485f, roughness: 0.4, metalness: 0.5 });
    for (const angle of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(VESSEL_POSITION[0] + Math.cos(angle) * 0.85, 0.21, VESSEL_POSITION[2] + Math.sin(angle) * 0.85);
      scene.add(leg);
    }

    // Naczynie: zewnętrzna "szklana" powłoka (statyczna) + metalowe pierścienie góra/dół
    // (czyta się jak realny bioreaktor/aparat, nie goły cylinder) + wewnętrzny
    // "płyn" skalowany realnym obłożeniem.
    this.vesselOuterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbfd6ff, roughness: 0.06, metalness: 0, transmission: 0.85, transparent: true, opacity: 0.35, thickness: 0.3,
    });
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 1.3, 32, 1, true), this.vesselOuterMaterial);
    outer.position.set(...VESSEL_POSITION);
    scene.add(outer);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4b5773, roughness: 0.3, metalness: 0.7 });
    const ringGeo = new THREE.TorusGeometry(0.565, 0.03, 12, 32);
    const topRing = new THREE.Mesh(ringGeo, ringMat);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.65, VESSEL_POSITION[2]);
    scene.add(topRing);
    const bottomRing = new THREE.Mesh(ringGeo, ringMat);
    bottomRing.rotation.x = Math.PI / 2;
    bottomRing.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] - 0.65, VESSEL_POSITION[2]);
    scene.add(bottomRing);

    const fluidMaterial = new THREE.MeshStandardMaterial({ color: STATUS_COLOR.NORMAL, emissive: STATUS_COLOR.NORMAL, emissiveIntensity: 0.45, roughness: 0.25 });
    this.fluidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 28), fluidMaterial);
    this.fluidMesh.position.set(VESSEL_POSITION[0], 0.15, VESSEL_POSITION[2]);
    this.fluidMesh.scale.y = 0.001;
    scene.add(this.fluidMesh);

    this.vesselLight = new THREE.PointLight(STATUS_COLOR.NORMAL, 0.2, 4, 2);
    this.vesselLight.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.6, VESSEL_POSITION[2]);
    scene.add(this.vesselLight);

    // Konsola — cel interakcji.
    const consoleBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.55, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2a3450, roughness: 0.4, metalness: 0.4 }),
    );
    consoleBody.position.set(CONSOLE_POSITION[0], CONSOLE_POSITION[1] - 0.15, CONSOLE_POSITION[2]);
    scene.add(consoleBody);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, emissive: 0x2f6fb0, emissiveIntensity: 0.5, roughness: 0.35 });
    this.consolePanel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), panelMaterial);
    this.consolePanel.position.set(CONSOLE_POSITION[0], CONSOLE_POSITION[1] + 0.12, CONSOLE_POSITION[2] - 0.18);
    this.consolePanel.rotation.x = -0.5;
    scene.add(this.consolePanel);
    this.consoleMesh = consoleBody;

    // Dwa instrumenty flankujące z górną opaską (czytelniejszy fokalny detal) — czysto wizualne.
    const instrumentGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.05, 20);
    const bandGeo = new THREE.CylinderGeometry(0.235, 0.235, 0.08, 20);
    const instrumentMat = new THREE.MeshStandardMaterial({ color: 0x394465, roughness: 0.45, metalness: 0.4 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x5ad1ff, emissive: 0x5ad1ff, emissiveIntensity: 0.6, roughness: 0.3 });
    for (const x of [-1.7, 1.7]) {
      const body = new THREE.Mesh(instrumentGeo, instrumentMat);
      body.position.set(x, 0.525, -0.7);
      scene.add(body);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.set(x, 0.98, -0.7);
      scene.add(band);
    }
    const accentA = new THREE.PointLight(0x5ad1ff, 0.5, 2.5, 2);
    accentA.position.set(-1.7, 1.05, -0.7);
    scene.add(accentA);
    const accentB = new THREE.PointLight(0x5ad1ff, 0.5, 2.5, 2);
    accentB.position.set(1.7, 1.05, -0.7);
    scene.add(accentB);
    this.icuLight = accentA;

    // Mały monitor obok konsoli — ekran jaśnieje TYLKO gdy realnie coś się odtwarza
    // (patrz syncScene: sygnał "playing", nie zmyślony wskaźnik).
    const monitorBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.24, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1c2334, roughness: 0.5, metalness: 0.3 }),
    );
    monitorBody.position.set(-0.55, 1.0, -0.85);
    monitorBody.rotation.y = 0.35;
    scene.add(monitorBody);
    const monitorMat = new THREE.MeshStandardMaterial({ color: 0x1c3a52, emissive: 0x3fc7ff, emissiveIntensity: 0.15, roughness: 0.3 });
    this.monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), monitorMat);
    this.monitorScreen.position.set(-0.55 + Math.sin(0.35) * 0.03, 1.0, -0.85 + Math.cos(0.35) * 0.03 - 0.02);
    this.monitorScreen.rotation.y = 0.35;
    scene.add(this.monitorScreen);

    const state = this.controller.getState();
    camera.position.set(state.position.x, state.position.y, state.position.z);
    camera.lookAt(state.position.x, state.position.y, state.position.z - 1);
    // FOV szerszy niż domyślne 50° useThreeLoop — 50° czyta się jak teleobiektyw i
    // ściska pokój; w pierwszej osobie 62° daje poczucie fizycznej obecności.
    camera.fov = 62;
    camera.updateProjectionMatrix();
  }

  update(dt: number, params: SimParams): void {
    void params;
    if (this.cameraPhase === 'FLIGHT' && this.flight) {
      const flightState = this.flight.advance(dt);
      this.liveCameraPosition = [flightState.position[0], flightState.position[1], flightState.position[2]];
      this.liveCameraLookAt = [flightState.lookAt[0], flightState.lookAt[1], flightState.lookAt[2]];
      if (flightState.done) {
        this.flight = null;
        if (this.flightGoingToFree) {
          this.cameraPhase = 'FREE';
          this.fixedKind = 'NONE';
        } else {
          this.cameraPhase = 'FIXED';
        }
      }
    } else if (this.cameraPhase === 'FREE') {
      const state = this.controller.update(dt);
      const forward = this.controller.getForward();
      this.liveCameraPosition = [state.position.x, state.position.y, state.position.z];
      this.liveCameraLookAt = [state.position.x + forward.x, state.position.y + Math.sin(state.pitch), state.position.z + forward.z];
    }
    // W stałym kadrze (FIXED) kamera nie potrzebuje aktualizacji co klatkę — pozostaje tam, gdzie zakończył się lot.

    if (this.playSeriesData.length > 0 && !this.playbackDone && !this.playbackPaused) {
      this.playElapsed += dt;
      const nextIndex = Math.min(this.playSeriesData.length - 1, Math.floor(this.playElapsed * DAYS_PER_SECOND));
      if (nextIndex !== this.playDayIndex) {
        this.playDayIndex = nextIndex;
        this.applyDay(this.playSeriesData[nextIndex]!);
        if (nextIndex >= this.playSeriesData.length - 1) {
          this.playbackDone = true;
          // REALNE zakończenie eksperymentu — jeśli anomalia nie zabrała już
          // kamery, dajemy "ujęcie rozstrzygnięcia" na tym samym stanowisku.
          // To reakcja na PRAWDZIWE zdarzenie (koniec serii), nie zmyślony dramat.
          if (this.playTag !== 'REPLAY' && this.cameraPhase === 'FREE') this.focusScientific('SCIENTIFIC');
        }
      }
    }
  }

  syncScene(scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    const THREE = this.THREE!;
    camera.position.set(...this.liveCameraPosition);
    if (this.cameraPhase === 'FREE') {
      const state = this.controller.getState();
      const euler = new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ');
      camera.quaternion.setFromEuler(euler);
      // Chód (head bob): wyłącznie prezentacyjne przesunięcie oka — patrz
      // firstPersonController.ts. Nigdy nie dotyka pozycji użytej do kolizji/interakcji.
      camera.position.y += state.bobOffset;
    } else {
      camera.lookAt(this.liveCameraLookAt[0], this.liveCameraLookAt[1], this.liveCameraLookAt[2]);
    }

    // Naczynie: wysokość = realne obłożenie łóżek, kolor = realny status (uwzględnia też ICU/unmetCare).
    if (this.fluidMesh) {
      const height = Math.max(0.02, this.vesselFraction) * 1.28;
      this.fluidMesh.scale.y = height;
      this.fluidMesh.position.y = 0.15 + height / 2;
      const color = this.vesselStatus === 'IDLE' ? STATUS_COLOR.NORMAL : STATUS_COLOR[this.vesselStatus];
      const material = this.fluidMesh.material as THREE_NS.MeshStandardMaterial;
      material.color.setHex(color);
      material.emissive.setHex(color);
      if (this.vesselLight) {
        this.vesselLight.color.setHex(color);
        this.vesselLight.intensity = 0.2 + this.vesselFraction * 1.1;
      }
    }
    // Drugi realny sygnał (obłożenie ICU) na akcentowym świetle instrumentu — nic wizualnego ponad to nie jest zmyślone.
    if (this.icuLight) this.icuLight.intensity = 0.3 + this.vesselIcuFraction * 1.4;
    // Ekran monitora jaśnieje wyłącznie wtedy, gdy realnie coś się właśnie odtwarza
    // (playSeriesData obecne i nie zakończone) — prawdziwy sygnał stanu, nie ozdoba.
    if (this.monitorScreen) {
      const isPlaying = this.playSeriesData.length > 0 && !this.playbackDone;
      const material = this.monitorScreen.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = isPlaying ? 0.85 : 0.15;
    }

    // Interakcja: promień z kamery na konsolę, w zasięgu i mniej więcej naprzeciw niej.
    if (this.raycaster && this.consoleMesh && this.cameraPhase === 'FREE') {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const toConsole = new THREE.Vector3(...CONSOLE_POSITION).sub(camera.position);
      const distance = toConsole.length();
      const facing = distance > 1e-6 ? forward.dot(toConsole.normalize()) : 0;
      this.nearStation = distance < INTERACT_MAX_DISTANCE && facing > INTERACT_MIN_FACING_DOT;
    } else {
      this.nearStation = false;
    }
    if (this.consolePanel) {
      const material = this.consolePanel.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = this.nearStation ? 1.1 : 0.5;
    }

    void scene;
  }

  onResize(): void { /* kamera pierwszoosobowa: brak dodatkowej logiki poza domyślnym aspect z useThreeLoop */ }

  dispose(): void { /* geometrie/materiały tej krótkotrwałej sceny zwalnia GC canvasa przy odmontowaniu */ }
}
