import type * as THREE_NS from 'three';
import type { Sim3D, PostProcessingModules, PostProcessor } from './types';
import type { SimParams } from '../types';
import { FirstPersonController, type MoveKey } from './firstPersonController';
import { CameraFlight, flightBetween } from '../reality/cameraSequencer';
import type { HospitalStatus } from '../simulation/hospitalResource';
import type { ScenarioDaySample } from '../simulation/scenarioEngine';
import { isWorldAssetApproved } from './assetGovernance';

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

// Sala powiększona i asymetryczna: naczynie zostaje na środku (STATION_OBSTACLE
// bez zmian), ale wokół niej mieści się teraz antresola, druga wieża
// zbiornika, szereg szaf aparaturowych i przeszklona ścianka — nie tylko
// cztery ściany wokół jednego cylindra.
const ROOM = { minX: -6, maxX: 6, minZ: -5, maxZ: 4.5 };
const STATION_OBSTACLE = { minX: -0.95, maxX: 0.95, minZ: -0.95, maxZ: 0.95 };
const CONSOLE_POSITION: THREE_NS.Vector3Tuple = [0, 0.55, 0.75];
// Naczynie powiększone do skali centralnej aparatury laboratoryjnej — spód
// opiera się dokładnie na podeście (y=0.15), środek podniesiony proporcjonalnie.
const VESSEL_POSITION: THREE_NS.Vector3Tuple = [0, 1.1, -0.2];
const VESSEL_HALF_HEIGHT = 0.95;
const VESSEL_MAX_FILL_HEIGHT = 1.87;
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

/**
 * Ramka kamery [pozycja, lookAt] u wskazanego "wachlarzowego" widoku instrumentu.
 * Odsunięte na tyle, by w kadrze mieściła się cała powiększona aparatura
 * (naczynie + rama + pierścień holograficzny nad nią), nie tylko jej fragment.
 */
function scientificFraming(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY'): { position: [number, number, number]; lookAt: [number, number, number] } {
  const lookAt: [number, number, number] = [VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.5, VESSEL_POSITION[2]];
  if (kind === 'ANOMALY') return { position: [1.5, 1.9, 1.7], lookAt };
  if (kind === 'REPLAY') return { position: [-2.0, 2.5, 2.6], lookAt };
  return { position: [2.2, 2.3, 3.0], lookAt };
}

export class LabScene3D implements Sim3D {
  disableOrbitControls = true;

  private THREE: typeof THREE_NS | null = null;
  private controller = new FirstPersonController({
    room: ROOM,
    obstacles: [STATION_OBSTACLE],
    startPosition: { x: 0, z: 3.3 },
    startYaw: 0,
  });

  private scene: THREE_NS.Scene | null = null;
  private raycaster: THREE_NS.Raycaster | null = null;
  private consoleMesh: THREE_NS.Mesh | null = null;
  private consolePanel: THREE_NS.Mesh | null = null;
  private monitorScreen: THREE_NS.Mesh | null = null;
  private fluidMesh: THREE_NS.Mesh | null = null;
  private icuLight: THREE_NS.PointLight | null = null;
  private vesselLight: THREE_NS.PointLight | null = null;
  private vesselOuterMaterial: THREE_NS.MeshPhysicalMaterial | null = null;
  // Agitator wewnątrz naczynia i pierścień holograficzny nad nim — czysto
  // dekoracyjne, ale ich prędkość obrotu/intensywność są sterowane REALNYMI
  // wartościami (vesselFraction/vesselIcuFraction), nigdy zmyśloną liczbą
  // wyświetlaną na scenie.
  private agitatorGroup: THREE_NS.Group | null = null;
  private hologramRing: THREE_NS.Mesh | null = null;
  private hologramMaterial: THREE_NS.MeshBasicMaterial | null = null;
  // Szafy aparaturowe w tle: świecą jaśniej WYŁĄCZNIE gdy realnie coś się
  // odtwarza (ten sam sygnał "playing" co mały monitor) — dekoracja
  // sterowana prawdziwym stanem, nie ozdobny placeholder.
  private rackScreens: THREE_NS.Mesh[] = [];

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
    this.scene = scene;
    this.raycaster = new THREE.Raycaster();
    scene.background = new THREE.Color(0x090c14);
    scene.fog = new THREE.Fog(0x090c14, 6, 16);

    // Ściany + sufit: jeden box renderowany od wewnątrz (BackSide) — tanie i wystarczające.
    const roomWidth = ROOM.maxX - ROOM.minX;
    const roomDepth = ROOM.maxZ - ROOM.minZ;
    const roomHeight = 4.6;
    const roomCenterX = (ROOM.minX + ROOM.maxX) / 2;
    const roomCenterZ = (ROOM.minZ + ROOM.maxZ) / 2;
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth),
      new THREE.MeshStandardMaterial({ color: 0x333f59, roughness: 0.8, metalness: 0.08, side: THREE.BackSide }),
    );
    shell.position.set(roomCenterX, roomHeight / 2, roomCenterZ);
    scene.add(shell);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth - 0.05, roomDepth - 0.05),
      new THREE.MeshStandardMaterial({ color: 0x1e2536, roughness: 0.35, metalness: 0.25 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(roomCenterX, 0.01, roomCenterZ);
    scene.add(floor);
    // Dwustrefowa podłoga: jaśniejszy, metaliczny "chodnik" wokół stanowiska
    // centralnego odróżnia strefę roboczą od reszty hali — głębia przez
    // kontrast materiału, nie tylko przez geometrię.
    const walkway = new THREE.Mesh(
      new THREE.RingGeometry(1.3, 2.6, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a3552, roughness: 0.28, metalness: 0.45 }),
    );
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.set(VESSEL_POSITION[0], 0.012, VESSEL_POSITION[2]);
    scene.add(walkway);
    // Cienka listwa świetlna wzdłuż podstawy ścian zamiast siatki-debug —
    // czysto dekoracyjna głębia, nie dane naukowe.
    const baseGlow = new THREE.Mesh(
      new THREE.RingGeometry(2.7, 2.78, 48),
      new THREE.MeshBasicMaterial({ color: 0x2f5a8f, transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    );
    baseGlow.rotation.x = -Math.PI / 2;
    baseGlow.position.set(VESSEL_POSITION[0], 0.015, VESSEL_POSITION[2]);
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
    const workLight = new THREE.PointLight(0xfff1d6, 1.6, 9, 2);
    workLight.position.set(0, roomHeight - 0.5, 0.1);
    scene.add(workLight);

    // Belka technologiczna (gantry) pod sufitem — niesie trzy oprawy wiszące
    // zamiast jednej pojedynczej lampy, wzmacnia poczucie przemysłowej hali
    // nad centralną aparaturą i sąsiadującym z nią sprzętem.
    const gantryY = roomHeight - 0.35;
    const gantryBeam = new THREE.Mesh(
      new THREE.BoxGeometry(7.4, 0.16, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x2c3348, roughness: 0.45, metalness: 0.65 }),
    );
    gantryBeam.position.set(-0.4, gantryY, 0.1);
    scene.add(gantryBeam);
    const crossBeam = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x2c3348, roughness: 0.45, metalness: 0.65 }),
    );
    crossBeam.position.set(2.9, gantryY, -1.0);
    scene.add(crossBeam);

    const pendantMat = new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.8 });
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0xfff1d6, emissiveIntensity: 0.25, roughness: 0.5, side: THREE.DoubleSide });
    const pendantFixtures: Array<{ x: number; z: number; color: number; intensity: number }> = [
      { x: 0, z: 0.1, color: 0xfff1d6, intensity: 1.6 },
      { x: -3.2, z: -2.0, color: 0xffe3b0, intensity: 0.9 },
      { x: 2.9, z: -1.7, color: 0xbfe4ff, intensity: 0.8 },
    ];
    for (const fixture of pendantFixtures) {
      const cableLength = gantryY - 2.28;
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cableLength, 8), pendantMat);
      cable.position.set(fixture.x, 2.28 + cableLength / 2, fixture.z);
      scene.add(cable);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 20, 1, true), shadeMat);
      shade.position.set(fixture.x, 2.28, fixture.z);
      scene.add(shade);
      if (fixture.x !== 0) {
        const rigLight = new THREE.PointLight(fixture.color, fixture.intensity, 5, 2);
        rigLight.position.set(fixture.x, 2.15, fixture.z);
        scene.add(rigLight);
      }
    }

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

    // Naczynie: centralny bioreaktor — powiększona "szklana" powłoka (realistyczny
    // szkło PBR: IOR, clearcoat, tłumienie koloru w grubości) + rama z trzech
    // metalowych pierścieni + cztery pionowe wsporniki z sensor-padami (czyta
    // się jak realna aparatura laboratoryjna, nie goły cylinder) + wewnętrzny
    // "płyn" skalowany realnym obłożeniem + wirujący agitator wewnątrz.
    this.vesselOuterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xbfe4ff,
      roughness: 0.035,
      metalness: 0,
      transmission: 0.92,
      transparent: true,
      opacity: 0.4,
      thickness: 0.45,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      attenuationColor: new THREE.Color(0x8fc4ff),
      attenuationDistance: 1.2,
    });
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.9, VESSEL_HALF_HEIGHT * 2, 40, 1, true),
      this.vesselOuterMaterial,
    );
    outer.position.set(...VESSEL_POSITION);
    scene.add(outer);

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4b5773, roughness: 0.22, metalness: 0.85 });
    const ringGeo = new THREE.TorusGeometry(0.87, 0.045, 14, 40);
    for (const offset of [VESSEL_HALF_HEIGHT - 0.07, 0, -(VESSEL_HALF_HEIGHT - 0.07)]) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + offset, VESSEL_POSITION[2]);
      scene.add(ring);
    }

    // Cztery pionowe wsporniki (klatka reaktora) + sensor-pady ze świecącymi
    // końcówkami — czysto dekoracyjny detal otoczenia aparatury.
    const strutGeo = new THREE.CylinderGeometry(0.035, 0.035, VESSEL_HALF_HEIGHT * 2 + 0.05, 10);
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x3d4760, roughness: 0.25, metalness: 0.8 });
    const podGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    const podMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0x5ad1ff, emissiveIntensity: 0.9, roughness: 0.4 });
    for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
      const sx = VESSEL_POSITION[0] + Math.cos(angle) * 0.98;
      const sz = VESSEL_POSITION[2] + Math.sin(angle) * 0.98;
      const strut = new THREE.Mesh(strutGeo, strutMat);
      strut.position.set(sx, VESSEL_POSITION[1], sz);
      scene.add(strut);
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.set(sx, VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT - 0.15, sz);
      scene.add(pod);
    }

    // Kopuła zamykająca naczynie od góry — zastępuje otwarty cylinder
    // sylwetką realnego, złożonego instrumentu, nie gołej rury. Dwa pierścienie
    // zaworów pod kopułą dodają detal "prawdziwej aparatury" bez żadnych
    // zmyślonych odczytów.
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x5a677f, roughness: 0.25, metalness: 0.8 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.87, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT, VESSEL_POSITION[2]);
    scene.add(dome);
    const valveGeo = new THREE.BoxGeometry(0.1, 0.14, 0.1);
    const valveMat = new THREE.MeshStandardMaterial({ color: 0x394465, roughness: 0.4, metalness: 0.55 });
    for (const angle of [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4]) {
      const vx = VESSEL_POSITION[0] + Math.cos(angle) * 0.55;
      const vz = VESSEL_POSITION[2] + Math.sin(angle) * 0.55;
      const valve = new THREE.Mesh(valveGeo, valveMat);
      valve.position.set(vx, VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 0.55, vz);
      scene.add(valve);
    }

    const fluidMaterial = new THREE.MeshStandardMaterial({ color: STATUS_COLOR.NORMAL, emissive: STATUS_COLOR.NORMAL, emissiveIntensity: 0.45, roughness: 0.25 });
    this.fluidMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1, 32), fluidMaterial);
    this.fluidMesh.position.set(VESSEL_POSITION[0], 0.15, VESSEL_POSITION[2]);
    this.fluidMesh.scale.y = 0.001;
    scene.add(this.fluidMesh);

    // Agitator: wirujący wewnątrz naczynia trzon + dwie łopatki — prędkość
    // obrotu sterowana REALNYM vesselFraction w update(), nigdy zmyśloną liczbą.
    this.agitatorGroup = new THREE.Group();
    this.agitatorGroup.position.set(VESSEL_POSITION[0], 0.15, VESSEL_POSITION[2]);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x8892ac, roughness: 0.25, metalness: 0.85 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, VESSEL_MAX_FILL_HEIGHT * 0.94, 10), shaftMat);
    shaft.position.y = (VESSEL_MAX_FILL_HEIGHT * 0.94) / 2;
    this.agitatorGroup.add(shaft);
    const bladeGeo = new THREE.BoxGeometry(0.5, 0.035, 0.08);
    const bladeA = new THREE.Mesh(bladeGeo, shaftMat);
    bladeA.position.y = 0.16;
    this.agitatorGroup.add(bladeA);
    const bladeB = new THREE.Mesh(bladeGeo, shaftMat);
    bladeB.position.y = 0.16;
    bladeB.rotation.y = Math.PI / 2;
    this.agitatorGroup.add(bladeB);
    scene.add(this.agitatorGroup);

    this.vesselLight = new THREE.PointLight(STATUS_COLOR.NORMAL, 0.2, 5, 2);
    this.vesselLight.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.5, VESSEL_POSITION[2]);
    scene.add(this.vesselLight);

    // Pierścień holograficzny nad naczyniem: addytywne, przezroczyste "skanowanie"
    // sterowane REALNYM vesselIcuFraction/statusem (obrót/opacity/kolor) — bez
    // żadnej zmyślonej liczby czy tekstu na nim.
    this.hologramMaterial = new THREE.MeshBasicMaterial({
      color: STATUS_COLOR.NORMAL, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    });
    this.hologramRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 8, 56), this.hologramMaterial);
    this.hologramRing.rotation.x = Math.PI / 2;
    this.hologramRing.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 1.05, VESSEL_POSITION[2]);
    scene.add(this.hologramRing);

    // Tani, statyczny "wolumetryczny" snop światła nad aparaturą (addytywny stożek) —
    // czysto atmosferyczny, nie źródło danych.
    const shaftLight = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 1.7, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }),
    );
    shaftLight.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1] + VESSEL_HALF_HEIGHT + 1.7, VESSEL_POSITION[2]);
    scene.add(shaftLight);

    // Statyczna sylwetka referencyjna skali człowieka — czysto wizualna, bez
    // żadnej roli w symulacji ani interakcji.
    const figureMat = new THREE.MeshStandardMaterial({ color: 0x20242f, roughness: 0.9, metalness: 0.05 });
    const figureBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.06, 4, 12), figureMat);
    figureBody.position.set(-1.9, 0.75, 1.15);
    scene.add(figureBody);
    const figureHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), figureMat);
    figureHead.position.set(-1.9, 1.55, 1.15);
    scene.add(figureHead);

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

    // === OTOCZENIE: druga wieża zbiornika, szafy aparaturowe, antresola,
    // przeszklona ścianka i okablowanie — hala wygląda jak kompleks
    // laboratoryjny, nie jeden cylinder na środku pustego pokoju. ===
    const metalDarkMat = new THREE.MeshStandardMaterial({ color: 0x2c3650, roughness: 0.4, metalness: 0.5 });
    const metalMidMat = new THREE.MeshStandardMaterial({ color: 0x3b4661, roughness: 0.35, metalness: 0.6 });
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a566f, roughness: 0.3, metalness: 0.75 });
    const junctionMat = new THREE.MeshStandardMaterial({ color: 0x0e1220, emissive: 0x5ad1ff, emissiveIntensity: 0.7, roughness: 0.4 });

    /** Prosty przewód L-kształtny (pion + poziom) z łącznikiem — tani, ale czytelny jako "instalacja". */
    const addConduit = (x: number, z1: number, z2: number, topY: number): void => {
      const vertical = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, topY, 10), pipeMat);
      vertical.position.set(x, topY / 2, z1);
      scene.add(vertical);
      const runLength = Math.abs(z2 - z1);
      if (runLength > 0.05) {
        const horizontal = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, runLength, 10), pipeMat);
        horizontal.rotation.x = Math.PI / 2;
        horizontal.position.set(x, topY, (z1 + z2) / 2);
        scene.add(horizontal);
      }
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), pipeMat);
      elbow.position.set(x, topY, z1);
      scene.add(elbow);
      const junction = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), junctionMat);
      junction.position.set(x, 0.1, z1);
      scene.add(junction);
    };

    // Druga wieża zbiornika — asymetryczne, duże urządzenie w tle, wizualnie
    // "siostrzane" do centralnego naczynia, ale mniejsze i BEZ powiązania z
    // danymi (żadnej fikcyjnej wartości — tylko otoczenie).
    const tankPos: THREE_NS.Vector3Tuple = [-3.4, 0, -2.0];
    const tankPlatform = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.14, 24), metalDarkMat);
    tankPlatform.position.set(tankPos[0], 0.07, tankPos[2]);
    scene.add(tankPlatform);
    const tankBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.54, 2.3, 28),
      new THREE.MeshStandardMaterial({ color: 0x2f3a52, roughness: 0.3, metalness: 0.6 }),
    );
    tankBody.position.set(tankPos[0], 1.3, tankPos[2]);
    scene.add(tankBody);
    const tankRingGeo = new THREE.TorusGeometry(0.52, 0.03, 12, 32);
    for (const offset of [0.95, -0.1, -0.95]) {
      const ring = new THREE.Mesh(tankRingGeo, metalMidMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(tankPos[0], 1.3 + offset, tankPos[2]);
      scene.add(ring);
    }
    const tankBeacon = new THREE.PointLight(0xffe3b0, 0.7, 3.5, 2);
    tankBeacon.position.set(tankPos[0], 2.55, tankPos[2]);
    scene.add(tankBeacon);
    addConduit(tankPos[0] + 0.6, tankPos[2], VESSEL_POSITION[2], 0.35);

    // Szereg szaf aparaturowych — infrastruktura serwerowa/pomiarowa z
    // pionowymi paskami LED. Jasność pasków rośnie WYŁĄCZNIE z realnym
    // sygnałem "playing" (dokładnie ta sama zasada co mały monitor obok
    // konsoli) — nigdy zmyślone dane na wyświetlaczu.
    const rackBodyMat = new THREE.MeshStandardMaterial({ color: 0x232b40, roughness: 0.5, metalness: 0.35 });
    const rackScreenMat = new THREE.MeshStandardMaterial({ color: 0x123044, emissive: 0x5ad1ff, emissiveIntensity: 0.2, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const rz = -2.0 + i * 0.62;
      const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.55), rackBodyMat);
      rack.position.set(3.15, 0.9, rz);
      scene.add(rack);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.5), rackScreenMat.clone());
      strip.position.set(3.15 - 0.26, 0.9, rz);
      strip.rotation.y = Math.PI / 2;
      scene.add(strip);
      this.rackScreens.push(strip);
    }
    const rackAccent = new THREE.PointLight(0x5ad1ff, 0.4, 3, 2);
    rackAccent.position.set(3.0, 1.7, -1.1);
    scene.add(rackAccent);
    addConduit(2.7, -2.0, VESSEL_POSITION[2], 0.28);

    // Antresola — podniesiony pomost wzdłuż ściany +X z barierką i podporami,
    // plus krótkie schody — czysta warstwa głębi architektonicznej w tle,
    // niedostępna fizycznie dla gracza (brak kolizji, jak pozostałe rekwizyty).
    const mezzY = 1.75;
    const mezzPlatform = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 4.4), metalMidMat);
    mezzPlatform.position.set(4.9, mezzY, -0.6);
    scene.add(mezzPlatform);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x5a6786, roughness: 0.4, metalness: 0.6 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.05), railMat);
    rail.position.set(4.9, mezzY + 0.55, -2.75);
    scene.add(rail);
    const railFar = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.05, 0.05), railMat);
    railFar.position.set(4.9, mezzY + 0.55, 1.55);
    scene.add(railFar);
    const pillarGeo = new THREE.CylinderGeometry(0.05, 0.05, mezzY, 10);
    for (const pz of [-2.6, -1.0, 0.6, 2.2]) {
      const pillar = new THREE.Mesh(pillarGeo, metalDarkMat);
      pillar.position.set(4.9, mezzY / 2, pz);
      scene.add(pillar);
    }
    for (let s = 0; s < 5; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.32), metalMidMat);
      step.position.set(4.15 - s * 0.12, (s + 1) * (mezzY / 5) - mezzY / 10, 3.1);
      scene.add(step);
    }

    // Przeszklona ścianka za naczyniem — sugeruje kolejne pomieszczenie w
    // głębi (czysta iluzja przestrzeni, brak interakcji), z przyciemnionym
    // wnętrzem widocznym przez szkło.
    const partitionMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe4ff, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25, thickness: 0.1, ior: 1.4,
    });
    const partition = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.3), partitionMat);
    partition.position.set(-0.5, 1.3, -3.3);
    scene.add(partition);
    const partitionFrame = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.06, 0.06), metalMidMat);
    partitionFrame.position.set(-0.5, 2.46, -3.3);
    scene.add(partitionFrame);
    const beyondGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x2a4f7a, transparent: true, opacity: 0.5 }),
    );
    beyondGlow.position.set(-0.5, 1.2, -3.9);
    scene.add(beyondGlow);
    const beyondLight = new THREE.PointLight(0x5ad1ff, 0.5, 4, 2);
    beyondLight.position.set(-0.5, 1.6, -3.7);
    scene.add(beyondLight);

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

    // Agitator i pierścień holograficzny: czysto wizualna animacja, ale jej
    // PRĘDKOŚĆ jest funkcją REALNEGO obłożenia — nigdy stała/zmyślona liczba.
    if (this.agitatorGroup) this.agitatorGroup.rotation.y += dt * (0.6 + this.vesselFraction * 5.2);
    if (this.hologramRing) this.hologramRing.rotation.z += dt * (0.25 + this.vesselIcuFraction * 1.6);

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
    let vesselColor = STATUS_COLOR.NORMAL;
    if (this.fluidMesh) {
      const height = Math.max(0.02, this.vesselFraction) * VESSEL_MAX_FILL_HEIGHT;
      this.fluidMesh.scale.y = height;
      this.fluidMesh.position.y = 0.15 + height / 2;
      vesselColor = this.vesselStatus === 'IDLE' ? STATUS_COLOR.NORMAL : STATUS_COLOR[this.vesselStatus];
      const material = this.fluidMesh.material as THREE_NS.MeshStandardMaterial;
      material.color.setHex(vesselColor);
      material.emissive.setHex(vesselColor);
      if (this.vesselLight) {
        this.vesselLight.color.setHex(vesselColor);
        this.vesselLight.intensity = 0.2 + this.vesselFraction * 1.1;
      }
    }
    // Drugi realny sygnał (obłożenie ICU) na akcentowym świetle instrumentu — nic wizualnego ponad to nie jest zmyślone.
    if (this.icuLight) this.icuLight.intensity = 0.3 + this.vesselIcuFraction * 1.4;
    // Pierścień holograficzny: kolor = ten sam realny status naczynia, opacity
    // rośnie z realnym obłożeniem ICU — żadna wartość liczbowa nie jest na nim wyświetlana.
    if (this.hologramMaterial) {
      this.hologramMaterial.color.setHex(vesselColor);
      this.hologramMaterial.opacity = 0.3 + this.vesselIcuFraction * 0.5;
    }
    // Ekran monitora jaśnieje wyłącznie wtedy, gdy realnie coś się właśnie odtwarza
    // (playSeriesData obecne i nie zakończone) — prawdziwy sygnał stanu, nie ozdoba.
    const isPlaying = this.playSeriesData.length > 0 && !this.playbackDone;
    if (this.monitorScreen) {
      const material = this.monitorScreen.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = isPlaying ? 0.85 : 0.15;
    }
    // Szafy aparaturowe w tle: ten sam realny sygnał "playing" co mały monitor
    // — infrastruktura "budzi się" podczas prawdziwego przebiegu, nic więcej.
    for (const strip of this.rackScreens) {
      const material = strip.material as THREE_NS.MeshStandardMaterial;
      material.emissiveIntensity = isPlaying ? 0.75 : 0.2;
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

  /**
   * Postprocessing kinowy: tone mapping ACES + delikatny bloom na źródłach
   * światła (naczynie/hologram/pady) — WYŁĄCZNIE przez już wstrzyknięte przez
   * useThreeLoop.ts moduły EffectComposer/UnrealBloomPass (patrz types.ts).
   * Żaden nowy silnik renderujący, żaden nowy loader poza już zatwierdzonym
   * (assetGovernance.ts) HDRI reużytym z highFidelitySlice3D.ts.
   */
  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const THREE = this.THREE!;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    void this.loadHdri(renderer);
    const composer = new modules.EffectComposer(renderer);
    composer.addPass(new modules.RenderPass(scene, camera));
    const bloom = new modules.UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.6, 0.8);
    composer.addPass(bloom);
    composer.addPass(new modules.OutputPass());
    return { render: () => composer.render(), setSize: (width, height) => composer.setSize(width, height), dispose: () => composer.dispose() };
  }

  /**
   * HDRI TYLKO jako mapa środowiska (reflections/IBL na szkle i metalu) —
   * BEZ podmiany tła, żeby zachować nastrój ciemnego laboratorium. Reużywa
   * jedyny zatwierdzony w assetGovernance.ts asset środowiskowy CC0, nie
   * dodaje żadnego nowego pliku.
   */
  private async loadHdri(renderer: THREE_NS.WebGLRenderer): Promise<void> {
    const hdriPath = '/assets/genesis-hf/hdr/braustuble_alley_1k.hdr';
    if (!isWorldAssetApproved(hdriPath)) return;
    try {
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      if (!this.THREE || !this.scene) return;
      const pmrem = new this.THREE.PMREMGenerator(renderer);
      new RGBELoader().load(hdriPath, (texture) => {
        if (!this.scene) { texture.dispose(); pmrem.dispose(); return; }
        const environment = pmrem.fromEquirectangular(texture).texture;
        this.scene.environment = environment;
        this.scene.environmentIntensity = 0.35;
        texture.dispose();
        pmrem.dispose();
      }, undefined, () => pmrem.dispose());
    } catch {
      // Materiały PBR i światła sceny pozostają pełnym fallbackiem bez HDRI.
    }
  }

  onResize(): void { /* kamera pierwszoosobowa: brak dodatkowej logiki poza domyślnym aspect z useThreeLoop */ }

  dispose(): void { /* geometrie/materiały tej krótkotrwałej sceny zwalnia GC canvasa przy odmontowaniu */ }
}
