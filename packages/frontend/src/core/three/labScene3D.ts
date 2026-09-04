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
      new THREE.MeshStandardMaterial({ color: 0x1b2233, roughness: 0.92, metalness: 0.05, side: THREE.BackSide }),
    );
    shell.position.set(0, roomHeight / 2, 0);
    scene.add(shell);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth - 0.05, roomDepth - 0.05),
      new THREE.MeshStandardMaterial({ color: 0x232b3f, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    scene.add(floor);
    const grid = new THREE.GridHelper(Math.max(roomWidth, roomDepth), 20, 0x2f3a54, 0x1c2336);
    grid.position.y = 0.02;
    scene.add(grid);

    // "Okno" na ścianie — czysto dekoracyjna głębia/parallax, nie dane naukowe.
    const window_ = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.1),
      new THREE.MeshBasicMaterial({ color: 0x1c2f4a }),
    );
    window_.position.set(-roomWidth / 2 + 0.02, 1.9, -0.6);
    window_.rotation.y = Math.PI / 2;
    scene.add(window_);

    // Oświetlenie: miękkie wypełnienie + ciepłe światło robocze nad stanowiskiem.
    scene.add(new THREE.HemisphereLight(0x9fb3e0, 0x141824, 0.55));
    const skyLight = new THREE.DirectionalLight(0xcfe0ff, 0.35);
    skyLight.position.set(-2, 3, -1);
    scene.add(skyLight);
    const workLight = new THREE.PointLight(0xfff1d6, 1.5, 7, 2);
    workLight.position.set(0, 2.7, 0.1);
    scene.add(workLight);

    // Stanowisko: podest.
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.15, 0.15, 24),
      new THREE.MeshStandardMaterial({ color: 0x2c3650, roughness: 0.6, metalness: 0.2 }),
    );
    platform.position.set(VESSEL_POSITION[0], 0.075, VESSEL_POSITION[2]);
    scene.add(platform);

    // Naczynie: zewnętrzna "szklana" powłoka (statyczna) + wewnętrzny "płyn" skalowany realnym obłożeniem.
    this.vesselOuterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbfd6ff, roughness: 0.08, metalness: 0, transmission: 0.85, transparent: true, opacity: 0.35, thickness: 0.3,
    });
    const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 1.3, 28, 1, true), this.vesselOuterMaterial);
    outer.position.set(...VESSEL_POSITION);
    scene.add(outer);

    const fluidMaterial = new THREE.MeshStandardMaterial({ color: STATUS_COLOR.NORMAL, emissive: STATUS_COLOR.NORMAL, emissiveIntensity: 0.4, roughness: 0.3 });
    this.fluidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1, 24), fluidMaterial);
    this.fluidMesh.position.set(VESSEL_POSITION[0], 0.15, VESSEL_POSITION[2]);
    this.fluidMesh.scale.y = 0.001;
    scene.add(this.fluidMesh);

    this.vesselLight = new THREE.PointLight(STATUS_COLOR.NORMAL, 0.2, 4, 2);
    this.vesselLight.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.6, VESSEL_POSITION[2]);
    scene.add(this.vesselLight);

    // Konsola — cel interakcji.
    const consoleBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.55, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x2a3450, roughness: 0.5, metalness: 0.3 }),
    );
    consoleBody.position.set(CONSOLE_POSITION[0], CONSOLE_POSITION[1] - 0.15, CONSOLE_POSITION[2]);
    scene.add(consoleBody);
    const panelMaterial = new THREE.MeshStandardMaterial({ color: 0x2f6fb0, emissive: 0x2f6fb0, emissiveIntensity: 0.5, roughness: 0.4 });
    this.consolePanel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), panelMaterial);
    this.consolePanel.position.set(CONSOLE_POSITION[0], CONSOLE_POSITION[1] + 0.12, CONSOLE_POSITION[2] - 0.18);
    this.consolePanel.rotation.x = -0.5;
    scene.add(this.consolePanel);
    this.consoleMesh = consoleBody;

    // Dwa instrumenty flankujące — czysto wizualne, nie niosą osobnych danych.
    const instrumentGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.05, 16);
    const leftInstrument = new THREE.Mesh(instrumentGeo, new THREE.MeshStandardMaterial({ color: 0x394465, roughness: 0.55, metalness: 0.25 }));
    leftInstrument.position.set(-1.7, 0.525, -0.7);
    scene.add(leftInstrument);
    const rightInstrument = new THREE.Mesh(instrumentGeo, new THREE.MeshStandardMaterial({ color: 0x394465, roughness: 0.55, metalness: 0.25 }));
    rightInstrument.position.set(1.7, 0.525, -0.7);
    scene.add(rightInstrument);
    const accentA = new THREE.PointLight(0x5ad1ff, 0.5, 2.5, 2);
    accentA.position.set(-1.7, 1.05, -0.7);
    scene.add(accentA);
    const accentB = new THREE.PointLight(0x5ad1ff, 0.5, 2.5, 2);
    accentB.position.set(1.7, 1.05, -0.7);
    scene.add(accentB);
    this.icuLight = accentA;

    const state = this.controller.getState();
    camera.position.set(state.position.x, state.position.y, state.position.z);
    camera.lookAt(state.position.x, state.position.y, state.position.z - 1);
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
        if (nextIndex >= this.playSeriesData.length - 1) this.playbackDone = true;
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
