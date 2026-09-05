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
export type LabFixedKind = 'NONE' | 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY' | 'WIDE';
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
  if (kind === 'NONE') return 0;
  if (kind === 'SCIENTIFIC') return 1;
  if (kind === 'ANOMALY') return 2;
  if (kind === 'REPLAY') return 3;
  return 4;
}

function tagCode(tag: LabPlayTag): number {
  return tag === 'NONE' ? 0 : tag === 'A' ? 1 : tag === 'B' ? 2 : 3;
}

/**
 * Ramka kamery [pozycja, lookAt] u wskazanego "wachlarzowego" widoku instrumentu.
 * Odsunięte na tyle, by w kadrze mieściła się cała powiększona aparatura
 * (naczynie + rama + pierścień holograficzny nad nią), nie tylko jej fragment.
 */
function scientificFraming(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY' | 'WIDE'): { position: [number, number, number]; lookAt: [number, number, number] } {
  const lookAt: [number, number, number] = [VESSEL_POSITION[0], VESSEL_POSITION[1] + 0.5, VESSEL_POSITION[2]];
  if (kind === 'ANOMALY') return { position: [1.5, 1.9, 1.7], lookAt };
  if (kind === 'REPLAY') return { position: [-2.0, 2.5, 2.6], lookAt };
  // WIDE: kadr otwierający — cała hala z antresolą i drugą wieżą w kadrze,
  // aparatura jako punkt centralny, a nie szkło tuż przy obiektywie.
  if (kind === 'WIDE') return { position: [3.4, 2.6, 4.3], lookAt: [VESSEL_POSITION[0] - 0.2, VESSEL_POSITION[1] + 0.2, VESSEL_POSITION[2]] };
  return { position: [2.2, 2.3, 3.0], lookAt };
}

/**
 * Teksturę "szczotkowanego metalu" generujemy proceduralnie (canvas, bez
 * żadnego pliku/asseta) — tysiące cienkich, poziomych pasm o losowej
 * jasności dają anizotropowe rozproszenie światła zamiast płaskiego,
 * jednolitego koloru PBR. Reużywana jako roughnessMap na kilku metalowych
 * materiałach (różne .repeat na klonach), więc jeden canvas wystarcza.
 */
function makeBrushedMetalTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * size;
    const shade = 90 + Math.random() * 110;
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.04 + Math.random() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Drobny szum kropkowy — "polerowany beton" na podłodze, ta sama zasada co szczotkowany metal. */
function makeFloorNoiseTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a4258';
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const speck = Math.random() < 0.12 ? (Math.random() * 40 - 20) : (Math.random() * 14 - 7);
    image.data[i] = Math.max(0, Math.min(255, image.data[i] + speck));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1] + speck));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2] + speck));
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
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
  // Wewnętrzna "kolonia" wewnątrz płynu: czysto wizualna tekstura gęstości —
  // WIDOCZNA LICZBA punktów (drawRange) jest wprost proporcjonalna do
  // realnego vesselFraction, nigdy do zmyślonego pomiaru "liczby komórek".
  private colonyPoints: THREE_NS.Points | null = null;
  private colonyMaterial: THREE_NS.PointsMaterial | null = null;
  private colonyMaxCount = 0;
  // Wyściółka komory i pierścień podestu — kolor z REALNEGO statusu naczynia.
  private linerMaterial: THREE_NS.MeshBasicMaterial | null = null;
  private plinthMaterial: THREE_NS.MeshBasicMaterial | null = null;
  // Szafy aparaturowe w tle: świecą jaśniej WYŁĄCZNIE gdy realnie coś się
  // odtwarza (ten sam sygnał "playing" co mały monitor) — dekoracja
  // sterowana prawdziwym stanem, nie ozdobny placeholder.
  private rackScreens: THREE_NS.Mesh[] = [];
  // Subtelny "oddech" kamery w kadrze FIXED — czysto kosmetyczny drift,
  // nigdy nie dotyka liveCameraPosition/liveCameraLookAt używanych do lotów.
  private fixedBreatheT = 0;

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
  focusScientific(kind: 'SCIENTIFIC' | 'ANOMALY' | 'REPLAY' | 'WIDE'): void {
    if (this.cameraPhase === 'FIXED' && this.fixedKind === kind) return;
    const from = { position: [...this.liveCameraPosition] as [number, number, number], lookAt: [...this.liveCameraLookAt] as [number, number, number] };
    const to = scientificFraming(kind);
    this.flight = flightBetween(from, to, 1.15);
    this.cameraPhase = 'FLIGHT';
    this.flightGoingToFree = false;
    this.fixedKind = kind;
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
    // Tekstury proceduralne (canvas, zero nowych plików/assetów) — jedyny
    // sposób na detal materiału metalu/podłogi dostępny bez zatwierdzonego
    // w assetGovernance.ts zestawu PBR dla wnętrza laboratorium.
    const brushedMetalTex = makeBrushedMetalTexture(THREE);
    const floorNoiseTex = makeFloorNoiseTexture(THREE);
    const brushedFor = (repeatX: number, repeatY: number): THREE_NS.Texture => {
      const tex = brushedMetalTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(repeatX, repeatY);
      return tex;
    };
    // Tło: pionowy gradient (płótno->tekstura) zamiast płaskiego koloru —
    // tani, standardowy trik dający wrażenie atmosfery/głębi zamiast
    // jednolitej "ściany koloru" za sprzętem. Nadal żaden nowy asset/loader.
    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 8;
    gradientCanvas.height = 256;
    const gradientCtx = gradientCanvas.getContext('2d')!;
    const gradient = gradientCtx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#04060c');
    gradient.addColorStop(0.55, '#0a0f1d');
    gradient.addColorStop(1, '#141d30');
    gradientCtx.fillStyle = gradient;
    gradientCtx.fillRect(0, 0, 8, 256);
    const backgroundTexture = new THREE.CanvasTexture(gradientCanvas);
    backgroundTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = backgroundTexture;
    // Mgła ciaśniej dobrana do rzeczywistych rozmiarów sali (przekątna ~7.8 m) —
    // realny spadek widoczności w głąb, zamiast dekoracji, która nigdy się nie uruchamia.
    // Mgła zaczyna się DALEKO za aparaturą: ma oddzielać plany (ściany, antresola,
    // druga wieża), a nie zamulać pierwszego planu — przy 3.5 m zjadała samo naczynie.
    scene.fog = new THREE.Fog(0x0a1526, 7.5, 26);

    // Ściany + sufit: jeden box renderowany od wewnątrz (BackSide) — tanie i wystarczające.
    const roomWidth = ROOM.maxX - ROOM.minX;
    const roomDepth = ROOM.maxZ - ROOM.minZ;
    const roomHeight = 4.6;
    const roomCenterX = (ROOM.minX + ROOM.maxX) / 2;
    const roomCenterZ = (ROOM.minZ + ROOM.maxZ) / 2;
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(roomWidth, roomHeight, roomDepth),
      new THREE.MeshStandardMaterial({ color: 0x4d5871, roughness: 0.86, metalness: 0.06, side: THREE.BackSide }),
    );
    shell.position.set(roomCenterX, roomHeight / 2, roomCenterZ);
    scene.add(shell);

    floorNoiseTex.repeat.set(roomWidth / 1.4, roomDepth / 1.4);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(roomWidth - 0.05, roomDepth - 0.05),
      new THREE.MeshStandardMaterial({ color: 0x333d55, roughness: 0.42, metalness: 0.22, roughnessMap: floorNoiseTex }),
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

    // Oświetlenie warstwowe (key/fill/rim), nie płaskie wypełnienie ze
    // wszystkich stron: wypełnienie ambientowe ZREDUKOWANE, żeby światła
    // kierunkowe/punktowe dawały realny kontrast i cienie zamiast
    // jednolicie oświetlonej sceny bez głębi.
    // Uwaga: ściany/sufit renderowane od wewnątrz (BackSide) mają odwrócone
    // normalne, więc HemisphereLight przypisuje sufitowi kolor "gruntu", a
    // podłodze kolor "nieba".
    scene.add(new THREE.HemisphereLight(0x8ea4cc, 0x6b7593, 0.9));
    const skyLight = new THREE.DirectionalLight(0xcfe0ff, 0.6);
    skyLight.position.set(-2, 3, -1);
    scene.add(skyLight);
    const fillLight = new THREE.DirectionalLight(0x8fa8d6, 0.4);
    fillLight.position.set(2.5, 2.2, 2);
    scene.add(fillLight);
    // Światło od strony kadru otwierającego (WIDE stoi przy +X/+Z): bez niego
    // szeroki plan pokazywał wyłącznie nieoświetloną stronę aparatury.
    const cameraSideLight = new THREE.DirectionalLight(0xbcd4ff, 0.55);
    cameraSideLight.position.set(4, 3, 5);
    scene.add(cameraSideLight);
    const workLight = new THREE.PointLight(0xfff1d6, 1.4, 9, 2);
    workLight.position.set(0, roomHeight - 0.5, 0.1);
    scene.add(workLight);
    // KEY: ciepłe, skierowane światło z przodu-boku naczynia — główne
    // źródło modelunku na szkle/metalu bioreaktora.
    const keyLight = new THREE.SpotLight(0xffd9a8, 6.5, 9, Math.PI / 5, 0.55, 1.4);
    keyLight.position.set(2.4, 3.0, 1.8);
    keyLight.target.position.set(VESSEL_POSITION[0], VESSEL_POSITION[1], VESSEL_POSITION[2]);
    scene.add(keyLight, keyLight.target);
    // RIM: chłodne światło zza naczynia — odcina jego sylwetkę od tła,
    // dokładnie ten efekt, którego brakowało przy płaskim wypełnieniu.
    const rimLight = new THREE.PointLight(0x5ad1ff, 2.2, 6, 2);
    rimLight.position.set(VESSEL_POSITION[0] - 0.3, VESSEL_POSITION[1] + 1.4, VESSEL_POSITION[2] - 1.6);
    scene.add(rimLight);

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
      new THREE.MeshStandardMaterial({ color: 0x2c3650, roughness: 0.45, metalness: 0.35, roughnessMap: brushedFor(8, 1) }),
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
      color: 0xcfe8ff,
      roughness: 0.02,
      metalness: 0,
      // Szkło ODBICIOWE, nie transmisyjne: transmission 0.92 zamieniało
      // naczynie w miękką plamę (transmisja rozmywa wszystko za szybą i
      // zjada krawędzie). Przezroczystość opacity + mocny clearcoat daje
      // ostre refleksy na krawędziach i czytelną sylwetkę aparatury.
      transmission: 0,
      transparent: true,
      opacity: 0.26,
      ior: 1.5,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 2.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.9, VESSEL_HALF_HEIGHT * 2, 40, 1, true),
      this.vesselOuterMaterial,
    );
    outer.position.set(...VESSEL_POSITION);
    scene.add(outer);

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x4b5773, roughness: 0.22, metalness: 0.85, roughnessMap: brushedFor(6, 1) });
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
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x3d4760, roughness: 0.25, metalness: 0.8, roughnessMap: brushedFor(1, 6) });
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
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x5a677f, roughness: 0.25, metalness: 0.8, roughnessMap: brushedFor(5, 3) });
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

    // "Kolonia" wewnątrz płynu: rozproszone świecące punkty, DZIECKO fluidMesh
    // (dziedziczy jego pozycję/skalę, więc żyje dokładnie w realnej objętości
    // płynu). Liczba WIDOCZNYCH punktów = realny vesselFraction * pula — to
    // wizualizacja gęstości z realnego sygnału, nie fikcyjny licznik komórek.
    this.colonyMaxCount = 220;
    const colonyPositions = new Float32Array(this.colonyMaxCount * 3);
    for (let i = 0; i < this.colonyMaxCount; i++) {
      const r = Math.sqrt(Math.random()) * 0.6;
      const theta = Math.random() * Math.PI * 2;
      colonyPositions[i * 3] = Math.cos(theta) * r;
      colonyPositions[i * 3 + 1] = Math.random() - 0.5;
      colonyPositions[i * 3 + 2] = Math.sin(theta) * r;
    }
    const colonyGeometry = new THREE.BufferGeometry();
    colonyGeometry.setAttribute('position', new THREE.BufferAttribute(colonyPositions, 3));
    colonyGeometry.setDrawRange(0, 0);
    this.colonyMaterial = new THREE.PointsMaterial({
      color: STATUS_COLOR.NORMAL, size: 0.045, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.colonyPoints = new THREE.Points(colonyGeometry, this.colonyMaterial);
    this.fluidMesh.add(this.colonyPoints);

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

    // Podświetlana wyściółka komory: wewnętrzny walec emisyjny, który sprawia,
    // że reaktor świeci od środka i jest ewidentnym punktem centralnym kadru.
    // Kolor sterowany REALNYM statusem w syncScene, tak jak płyn.
    this.linerMaterial = new THREE.MeshBasicMaterial({
      color: STATUS_COLOR.NORMAL, transparent: true, opacity: 0.14, side: THREE.BackSide, depthWrite: false,
    });
    const liner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.84, VESSEL_HALF_HEIGHT * 2 - 0.06, 32, 1, true),
      this.linerMaterial,
    );
    liner.position.set(...VESSEL_POSITION);
    scene.add(liner);
    // Pierścień akcentowy w podeście — odcina aparaturę od podłogi.
    this.plinthMaterial = new THREE.MeshBasicMaterial({ color: STATUS_COLOR.NORMAL, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const plinthRing = new THREE.Mesh(new THREE.RingGeometry(1.02, 1.1, 48), this.plinthMaterial);
    plinthRing.rotation.x = -Math.PI / 2;
    plinthRing.position.set(VESSEL_POSITION[0], 0.152, VESSEL_POSITION[2]);
    scene.add(plinthRing);

    this.vesselLight = new THREE.PointLight(STATUS_COLOR.NORMAL, 2.2, 6, 2);
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
      new THREE.MeshStandardMaterial({ color: 0x2f3a52, roughness: 0.3, metalness: 0.6, roughnessMap: brushedFor(4, 4) }),
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
    // Podświetlenie krawędzi antresoli — architektoniczny akcent (jak w
    // realnych halach przemysłowych), czysto dekoracyjne, stałe natężenie.
    const railGlowMat = new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.55 });
    const railGlow = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.012, 4.42), railGlowMat);
    railGlow.position.set(4.9, mezzY + 0.06, -0.6);
    scene.add(railGlow);
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
    // Cienka linia LED wzdłuż górnej ramy ścianki — odcina jej krawędź od
    // ciemnego tła, ten sam architektoniczny akcent co antresola.
    const partitionEdge = new THREE.Mesh(
      new THREE.BoxGeometry(4.42, 0.015, 0.015),
      new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.6 }),
    );
    partitionEdge.position.set(-0.5, 2.43, -3.28);
    scene.add(partitionEdge);
    const beyondGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.6),
      new THREE.MeshBasicMaterial({ color: 0x2a4f7a, transparent: true, opacity: 0.5 }),
    );
    beyondGlow.position.set(-0.5, 1.2, -3.9);
    scene.add(beyondGlow);
    const beyondLight = new THREE.PointLight(0x5ad1ff, 0.5, 4, 2);
    beyondLight.position.set(-0.5, 1.6, -3.7);
    scene.add(beyondLight);

    // ==================================================================
    // WYPOSAŻENIE HALI — gęsta zabudowa laboratoryjna budowana z kilku
    // parametrycznych zespołów (stół, szafa, przewody, butle, kratownica),
    // a nie z pojedynczych prymitywów rozstawionych po pokoju. Wszystkie
    // materiały/geometrie są współdzielone między instancjami, więc gęstość
    // sceny rośnie bez proporcjonalnego wzrostu liczby draw calls.
    // ==================================================================
    const MAT = {
      steel: new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.32, metalness: 0.92, roughnessMap: brushedFor(3, 3) }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x39415a, roughness: 0.5, metalness: 0.75, roughnessMap: brushedFor(2, 2) }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xc8d4e6, roughness: 0.08, metalness: 1, envMapIntensity: 1.6 }),
      worktop: new THREE.MeshStandardMaterial({ color: 0x22283a, roughness: 0.62, metalness: 0.15 }),
      plastic: new THREE.MeshStandardMaterial({ color: 0x2a3350, roughness: 0.78, metalness: 0.05 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.95, metalness: 0 }),
      ceramic: new THREE.MeshStandardMaterial({ color: 0xd8e2ee, roughness: 0.42, metalness: 0.04 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.3, metalness: 0.95 }),
      display: new THREE.MeshStandardMaterial({ color: 0x0d2233, emissive: 0x3fc7ff, emissiveIntensity: 0.55, roughness: 0.24 }),
      amberLed: new THREE.MeshStandardMaterial({ color: 0x100c06, emissive: 0xffb545, emissiveIntensity: 1.1, roughness: 0.4 }),
      panelGlass: new THREE.MeshPhysicalMaterial({ color: 0x9fc4e8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 1.8, depthWrite: false }),
    };
    const GEO = {
      boltHead: new THREE.CylinderGeometry(0.018, 0.018, 0.022, 6),
      flange: new THREE.CylinderGeometry(0.062, 0.062, 0.026, 14),
      knob: new THREE.CylinderGeometry(0.022, 0.026, 0.03, 10),
      handWheel: new THREE.TorusGeometry(0.055, 0.011, 6, 14),
      gaugeBody: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14),
      gaugeFace: new THREE.CircleGeometry(0.037, 14),
      vent: new THREE.BoxGeometry(0.3, 0.012, 0.012),
    };

    /** Pierścień śrub wokół kołnierza — detal, który natychmiast czyta się jako realny sprzęt. */
    const addBoltRing = (cx: number, cy: number, cz: number, radius: number, count: number): void => {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const bolt = new THREE.Mesh(GEO.boltHead, MAT.chrome);
        bolt.position.set(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius);
        scene.add(bolt);
      }
    };

    /** Manometr: korpus + tarcza + króciec. Używany na reaktorze i przy rurociągach. */
    const addGauge = (x: number, y: number, z: number, rotY: number): void => {
      const body = new THREE.Mesh(GEO.gaugeBody, MAT.steel);
      body.rotation.set(Math.PI / 2, 0, 0);
      body.rotation.z = rotY;
      body.position.set(x, y, z);
      scene.add(body);
      const face = new THREE.Mesh(GEO.gaugeFace, MAT.ceramic);
      face.position.set(x + Math.sin(rotY) * 0.017, y, z + Math.cos(rotY) * 0.017);
      face.rotation.y = rotY;
      scene.add(face);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8), MAT.steel);
      stem.position.set(x, y - 0.05, z);
      scene.add(stem);
    };

    /** Stół laboratoryjny: blat, rama, półka, fronty szuflad i aparatura na blacie. */
    const addBench = (x: number, z: number, rotY: number, length: number, instruments: number): void => {
      const bench = new THREE.Group();
      bench.position.set(x, 0, z);
      bench.rotation.y = rotY;
      const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.055, 0.68), MAT.worktop);
      top.position.y = 0.9;
      bench.add(top);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.035, 0.035), MAT.steel);
      rail.position.set(0, 1.32, -0.3);
      bench.add(rail);
      for (const sx of [-length / 2 + 0.08, length / 2 - 0.08]) {
        for (const sz of [-0.28, 0.28]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.87, 0.05), MAT.darkSteel);
          leg.position.set(sx, 0.435, sz);
          bench.add(leg);
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8), MAT.steel);
        post.position.set(sx, 1.11, -0.3);
        bench.add(post);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(length - 0.2, 0.03, 0.5), MAT.darkSteel);
      shelf.position.y = 0.28;
      bench.add(shelf);
      const drawers = Math.max(2, Math.round(length / 0.45));
      for (let i = 0; i < drawers; i++) {
        const front = new THREE.Mesh(new THREE.BoxGeometry(length / drawers - 0.04, 0.19, 0.02), MAT.plastic);
        front.position.set(-length / 2 + (i + 0.5) * (length / drawers), 0.74, 0.35);
        bench.add(front);
        const handle = new THREE.Mesh(new THREE.BoxGeometry(length / drawers * 0.45, 0.016, 0.016), MAT.chrome);
        handle.position.set(front.position.x, 0.74, 0.37);
        bench.add(handle);
      }
      for (let i = 0; i < instruments; i++) {
        const ix = -length / 2 + (i + 0.5) * (length / instruments);
        const h = 0.16 + (i % 3) * 0.07;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, h, 0.32), MAT.plastic);
        box.position.set(ix, 0.93 + h / 2, -0.02);
        bench.add(box);
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.19, h * 0.45), MAT.display);
        screen.position.set(ix, 0.95 + h * 0.62, 0.161);
        bench.add(screen);
        for (let k = 0; k < 3; k++) {
          const knob = new THREE.Mesh(GEO.knob, k === 0 ? MAT.amberLed : MAT.chrome);
          knob.rotation.x = Math.PI / 2;
          knob.position.set(ix - 0.07 + k * 0.06, 0.95 + h * 0.2, 0.165);
          bench.add(knob);
        }
      }
      scene.add(bench);
    };

    /** Szafa aparaturowa na ścianie: korpus, przeszklone drzwi, półki, uchwyty. */
    const addWallCabinet = (x: number, y: number, z: number, rotY: number, width: number): void => {
      const cab = new THREE.Group();
      cab.position.set(x, y, z);
      cab.rotation.y = rotY;
      const body = new THREE.Mesh(new THREE.BoxGeometry(width, 0.62, 0.3), MAT.darkSteel);
      cab.add(body);
      const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.07, 0.52), MAT.panelGlass);
      doorGlass.position.z = 0.152;
      cab.add(doorGlass);
      for (const sy of [-0.1, 0.14]) {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.09, 0.015, 0.24), MAT.steel);
        shelf.position.y = sy;
        cab.add(shelf);
        for (let i = 0; i < Math.round(width / 0.12); i++) {
          const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.11, 8), MAT.ceramic);
          vial.position.set(-width / 2 + 0.08 + i * 0.12, sy + 0.062, 0);
          cab.add(vial);
        }
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.02), MAT.chrome);
      handle.position.set(width / 2 - 0.06, 0, 0.16);
      cab.add(handle);
      scene.add(cab);
    };

    /** Poziomy rurociąg z kołnierzami i wspornikami — biegnie wzdłuż osi X pod sufitem. */
    const addPipeRun = (y: number, z: number, x1: number, x2: number, radius: number, material: THREE_NS.Material): void => {
      const length = Math.abs(x2 - x1);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 14), material);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set((x1 + x2) / 2, y, z);
      scene.add(pipe);
      const flanges = Math.max(2, Math.floor(length / 1.5));
      for (let i = 0; i <= flanges; i++) {
        const fx = x1 + (i / flanges) * (x2 - x1);
        const flange = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.5, radius * 1.5, 0.03, 14), MAT.steel);
        flange.rotation.z = Math.PI / 2;
        flange.position.set(fx, y, z);
        scene.add(flange);
        if (i % 2 === 0) {
          const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.02), MAT.darkSteel);
          hanger.position.set(fx, y + 0.17, z);
          scene.add(hanger);
        }
      }
    };

    /** Zwisający kabel — realna krzywa (CatmullRom + TubeGeometry), nie prosty walec. */
    const addCable = (from: THREE_NS.Vector3Tuple, to: THREE_NS.Vector3Tuple, sag: number, radius: number): void => {
      const mid: THREE_NS.Vector3Tuple = [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - sag, (from[2] + to[2]) / 2];
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(...from), new THREE.Vector3(...mid), new THREE.Vector3(...to),
      ]);
      const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, radius, 6, false), MAT.rubber);
      scene.add(cable);
    };

    /** Butle gazowe w stojaku z łańcuchem zabezpieczającym. */
    const addGasCylinders = (x: number, z: number, rotY: number, count: number): void => {
      const rack = new THREE.Group();
      rack.position.set(x, 0, z);
      rack.rotation.y = rotY;
      const colors = [0x2f6f52, 0x8a3030, 0x2a4a7a, 0x6a6a70];
      for (let i = 0; i < count; i++) {
        const bx = -((count - 1) * 0.17) / 2 + i * 0.17;
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075, 0.075, 1.15, 14),
          new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.42, metalness: 0.65 }),
        );
        body.position.set(bx, 0.575, 0);
        rack.add(body);
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), body.material as THREE_NS.Material);
        shoulder.position.set(bx, 1.15, 0);
        rack.add(shoulder);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.12, 8), MAT.chrome);
        neck.position.set(bx, 1.2, 0);
        rack.add(neck);
        const wheel = new THREE.Mesh(GEO.handWheel, MAT.chrome);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(bx, 1.27, 0);
        rack.add(wheel);
      }
      const chain = new THREE.Mesh(new THREE.BoxGeometry(count * 0.17 + 0.08, 0.02, 0.02), MAT.chrome);
      chain.position.set(0, 0.82, 0.08);
      rack.add(chain);
      for (const sx of [-(count * 0.17) / 2 - 0.02, (count * 0.17) / 2 + 0.02]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8), MAT.darkSteel);
        post.position.set(sx, 0.5, 0.08);
        rack.add(post);
      }
      scene.add(rack);
    };

    /** Dwuteownik z trzech płaskowników — kratownica sufitowa czytelna jako konstrukcja. */
    const addIBeam = (x: number, y: number, z: number, length: number, alongX: boolean): void => {
      const beam = new THREE.Group();
      beam.position.set(x, y, z);
      if (!alongX) beam.rotation.y = Math.PI / 2;
      const web = new THREE.Mesh(new THREE.BoxGeometry(length, 0.2, 0.022), MAT.darkSteel);
      beam.add(web);
      for (const fy of [-0.1, 0.1]) {
        const flange = new THREE.Mesh(new THREE.BoxGeometry(length, 0.024, 0.13), MAT.darkSteel);
        flange.position.y = fy;
        beam.add(flange);
      }
      scene.add(beam);
    };

    // --- Kratownica sufitowa: dwa dwuteowniki wzdłuż + poprzeczki co 1.6 m ---
    for (const bz of [-2.6, 1.4]) addIBeam(0, roomHeight - 0.62, bz, roomWidth - 0.4, true);
    for (let bx = -4.4; bx <= 4.4; bx += 1.6) addIBeam(bx, roomHeight - 0.62, -0.6, 4.2, false);

    // --- Panele świetlne w suficie (emisyjne prostokąty w regularnej siatce) ---
    const ceilingPanelMat = new THREE.MeshStandardMaterial({ color: 0xe8f2ff, emissive: 0xdcecff, emissiveIntensity: 1.5, roughness: 0.9 });
    for (const px of [-3.6, -1.2, 1.2, 3.6]) {
      for (const pz of [-3.2, -1.0, 1.2]) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.42), ceilingPanelMat);
        panel.rotation.x = Math.PI / 2;
        panel.position.set(px, roomHeight - 0.03, pz);
        scene.add(panel);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.06, 0.54), MAT.darkSteel);
        housing.position.set(px, roomHeight - 0.01, pz);
        scene.add(housing);
      }
    }
    // Materiał emisyjny sam NIE oświetla sceny w Three.js — bez tych źródeł
    // panele sufitowe świeciły, a hala zostawała czarna. Sześć realnych świateł
    // (co drugi panel) daje równomierne oświetlenie robocze całej zabudowy.
    for (const [lx, lz] of [[-3.6, -3.2], [1.2, -3.2], [-1.2, -1.0], [3.6, -1.0], [-3.6, 1.2], [1.2, 1.2]] as const) {
      const panelLight = new THREE.PointLight(0xeaf3ff, 11, 14, 2);
      panelLight.position.set(lx, roomHeight - 0.35, lz);
      scene.add(panelLight);
    }

    // --- Rurociągi technologiczne pod sufitem (różne średnice i materiały) ---
    addPipeRun(roomHeight - 0.95, -3.9, -5.7, 5.7, 0.075, MAT.steel);
    addPipeRun(roomHeight - 1.12, -3.9, -5.7, 5.7, 0.045, MAT.copper);
    addPipeRun(roomHeight - 0.95, -4.15, -5.7, 2.2, 0.055, MAT.darkSteel);
    addPipeRun(roomHeight - 1.35, 3.9, -3.0, 5.7, 0.06, MAT.steel);

    // --- Koryta kablowe + realnie zwisające kable wzdłuż tylnej ściany ---
    const trayMat = MAT.darkSteel;
    for (const tz of [-4.35, 4.15]) {
      const tray = new THREE.Mesh(new THREE.BoxGeometry(roomWidth - 0.6, 0.05, 0.22), trayMat);
      tray.position.set(0, roomHeight - 1.6, tz);
      scene.add(tray);
      for (let cx = -5.0; cx < 5.0; cx += 1.25) {
        addCable([cx, roomHeight - 1.63, tz], [cx + 1.25, roomHeight - 1.63, tz], 0.12 + (cx % 2 === 0 ? 0.05 : 0), 0.013);
      }
    }
    // Zejścia kablowe do szaf aparaturowych i do konsoli.
    addCable([2.6, roomHeight - 1.63, -4.15], [3.15, 1.8, -2.0], 0.25, 0.016);
    addCable([-2.4, roomHeight - 1.63, -4.15], [-3.4, 2.4, -2.0], 0.3, 0.016);
    addCable([0.4, roomHeight - 1.63, 4.15], [0.35, 0.75, 0.95], 0.35, 0.014);

    // --- Stoły laboratoryjne wzdłuż ścian (gęsta zabudowa obwodowa) ---
    addBench(-4.4, 2.4, Math.PI / 2, 2.6, 4);
    addBench(-4.4, -0.4, Math.PI / 2, 2.0, 3);
    addBench(1.6, 3.7, Math.PI, 2.8, 4);
    addBench(-1.9, -4.35, 0, 2.4, 3);

    // --- Szafy na ścianach nad stołami ---
    addWallCabinet(-5.85, 2.0, 2.4, Math.PI / 2, 1.5);
    addWallCabinet(-5.85, 2.0, -0.4, Math.PI / 2, 1.2);
    addWallCabinet(1.6, 2.05, 4.42, Math.PI, 1.6);

    // --- Butle gazowe: dwa stanowiska w rogach ---
    addGasCylinders(-5.5, -3.6, 0.35, 4);
    addGasCylinders(5.4, 2.9, -0.5, 3);

    // --- Detale samego reaktora: kołnierze ze śrubami, manometry, koło zaworu ---
    for (const offset of [VESSEL_HALF_HEIGHT - 0.07, -(VESSEL_HALF_HEIGHT - 0.07)]) {
      addBoltRing(VESSEL_POSITION[0], VESSEL_POSITION[1] + offset + 0.05, VESSEL_POSITION[2], 0.9, 16);
    }
    addGauge(VESSEL_POSITION[0] + 0.62, VESSEL_POSITION[1] + 0.72, VESSEL_POSITION[2] + 0.66, 0.7);
    addGauge(VESSEL_POSITION[0] - 0.66, VESSEL_POSITION[1] + 0.52, VESSEL_POSITION[2] + 0.6, -0.6);
    addGauge(VESSEL_POSITION[0] + 0.78, VESSEL_POSITION[1] - 0.35, VESSEL_POSITION[2] - 0.42, 1.9);
    const mainWheel = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 8, 18), MAT.chrome);
    mainWheel.rotation.x = Math.PI / 2;
    mainWheel.position.set(VESSEL_POSITION[0] + 0.88, VESSEL_POSITION[1] + 0.2, VESSEL_POSITION[2] + 0.3);
    scene.add(mainWheel);
    // Rury procesowe wychodzące z reaktora do instalacji sufitowej i do podłogi.
    const reactorPipeMat = MAT.steel;
    const upPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.5, 12), reactorPipeMat);
    upPipe.position.set(VESSEL_POSITION[0] + 0.72, VESSEL_POSITION[1] + 1.5, VESSEL_POSITION[2] - 0.5);
    scene.add(upPipe);
    const downPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 12), reactorPipeMat);
    downPipe.position.set(VESSEL_POSITION[0] - 0.78, 0.45, VESSEL_POSITION[2] + 0.42);
    scene.add(downPipe);
    for (const [fx, fy, fz] of [[0.72, VESSEL_POSITION[1] + 0.78, -0.5], [-0.78, 0.9, 0.42]] as const) {
      const flange = new THREE.Mesh(GEO.flange, MAT.steel);
      flange.position.set(VESSEL_POSITION[0] + fx, fy, VESSEL_POSITION[2] + fz);
      scene.add(flange);
    }

    // --- Pomost technologiczny przy reaktorze: krata, barierka, drabinka ---
    const catwalk = new THREE.Group();
    catwalk.position.set(-1.75, 0, -1.5);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.1), MAT.darkSteel);
    deck.position.y = 1.0;
    catwalk.add(deck);
    for (let g = 0; g < 9; g++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.02, 0.03), MAT.steel);
      bar.position.set(0, 1.035, -0.5 + g * 0.125);
      catwalk.add(bar);
    }
    for (const cx of [-0.5, 0.5]) {
      for (const cz of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), MAT.darkSteel);
        leg.position.set(cx, 0.5, cz);
        catwalk.add(leg);
      }
    }
    for (const railY of [1.35, 1.65]) {
      const railBar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.028, 0.028), MAT.steel);
      railBar.position.set(0, railY, -0.53);
      catwalk.add(railBar);
    }
    for (const px of [-0.53, 0.53]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.7, 8), MAT.steel);
      post.position.set(px, 1.35, -0.53);
      catwalk.add(post);
    }
    for (let s = 0; s < 4; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.025, 0.09), MAT.steel);
      step.position.set(0, 0.24 + s * 0.24, 0.62);
      catwalk.add(step);
    }
    scene.add(catwalk);

    // --- Kolumny konstrukcyjne w narożnikach (dwuteowniki pionowe) ---
    for (const [cx, cz] of [[-5.7, -4.6], [5.7, -4.6], [5.7, 4.1]] as const) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.16, roomHeight, 0.16), MAT.darkSteel);
      col.position.set(cx, roomHeight / 2, cz);
      scene.add(col);
      const capPlate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.3), MAT.steel);
      capPlate.position.set(cx, 0.02, cz);
      scene.add(capPlate);
    }

    // --- Kratka wentylacyjna + żaluzje na ścianie tylnej (rytm wizualny) ---
    for (const vz of [-4.44]) {
      for (const vx of [-4.6, 4.6]) {
        const grille = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.05), MAT.darkSteel);
        grille.position.set(vx, 2.7, vz);
        scene.add(grille);
        for (let l = 0; l < 6; l++) {
          const louver = new THREE.Mesh(GEO.vent, MAT.steel);
          louver.scale.x = 2.3;
          louver.position.set(vx, 2.46 + l * 0.09, vz + 0.03);
          scene.add(louver);
        }
      }
    }

    // KADR OTWIERAJĄCY: scena startuje w szerokim, skomponowanym ujęciu całej
    // hali (FIXED/WIDE), a nie tuż przy szkle naczynia. Pierwszą rzeczą, którą
    // widzi użytkownik, jest więc laboratorium jako całość; dopiero wejście w
    // tryb pierwszoosobowy (returnToFirstPerson) oddaje mu sterowanie.
    const opening = scientificFraming('WIDE');
    this.liveCameraPosition = [...opening.position];
    this.liveCameraLookAt = [...opening.lookAt];
    this.cameraPhase = 'FIXED';
    this.fixedKind = 'WIDE';
    camera.position.set(...opening.position);
    camera.lookAt(...opening.lookAt);
    // FOV szerszy niż domyślne 50° useThreeLoop — 50° czyta się jak teleobiektyw i
    // ściska pokój; 68° w pierwszej osobie mieści całą powiększoną aparaturę
    // nawet z bliska, zamiast kadrować sam środek kopuły/klatki.
    camera.fov = 68;
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
    // Poza samą pozycją: licznik "oddechu" narasta tylko w FIXED (patrz syncScene) — subtelny drift kamery, żeby ujęcie nie było martwym stopklatka-kadrem.
    if (this.cameraPhase === 'FIXED') this.fixedBreatheT += dt;

    // Agitator i pierścień holograficzny: czysto wizualna animacja, ale jej
    // PRĘDKOŚĆ jest funkcją REALNEGO obłożenia — nigdy stała/zmyślona liczba.
    if (this.agitatorGroup) this.agitatorGroup.rotation.y += dt * (0.6 + this.vesselFraction * 5.2);
    if (this.hologramRing) this.hologramRing.rotation.z += dt * (0.25 + this.vesselIcuFraction * 1.6);
    if (this.colonyPoints) this.colonyPoints.rotation.y += dt * (0.3 + this.vesselFraction * 1.8);

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
      if (this.cameraPhase === 'FIXED') {
        // Kinowy "oddech": mikroskopijny, ciągły drift — tak jak przy statywie
        // z operatorem, nie martwa stopklatka. Amplituda celowo mała, żeby
        // nigdy nie psuć kompozycji ustawionej w scientificFraming().
        camera.position.x += Math.sin(this.fixedBreatheT * 0.35) * 0.035;
        camera.position.y += Math.sin(this.fixedBreatheT * 0.5 + 1.3) * 0.02;
      }
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
        this.vesselLight.intensity = 2.2 + this.vesselFraction * 3.4;
      }
      if (this.linerMaterial) this.linerMaterial.color.setHex(vesselColor);
      if (this.plinthMaterial) this.plinthMaterial.color.setHex(vesselColor);
      if (this.colonyMaterial && this.colonyPoints) {
        this.colonyMaterial.color.setHex(vesselColor);
        this.colonyPoints.geometry.setDrawRange(0, Math.round(this.colonyMaxCount * this.vesselFraction));
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
    // Ekspozycja podniesiona razem z obniżonym wypełnieniem ambientowym:
    // ciemniejsze tło + jaśniejsze źródła kierunkowe dają filmowy kontrast
    // zamiast płaskiej, jednolicie oświetlonej sceny.
    renderer.toneMappingExposure = 1.32;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    void this.loadHdri(renderer);
    const composer = new modules.EffectComposer(renderer);
    composer.addPass(new modules.RenderPass(scene, camera));
    // Bloom niżej progowany i mocniejszy: wspiera światło (poświata na
    // krawędziach szkła/emisyjnych elementach), ale go nie zastępuje —
    // ciemniejsze materiały bazowe (patrz init()) robią resztę kontrastu.
    const bloom = new modules.UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.42, 0.86);
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
        // Podniesione z 0.35: przy obniżonym świetle ambientowym to teraz
        // IBL niesie większość odbić na szkle/metalu, więc musi być czytelne.
        this.scene.environmentIntensity = 0.65;
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
