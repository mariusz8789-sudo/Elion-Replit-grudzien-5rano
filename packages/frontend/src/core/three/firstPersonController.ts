/**
 * FIRST-PERSON CONTROLLER — czysta matematyka (bez THREE.js), testowalna bez
 * WebGL, świadome lustro core/reality/cameraSequencer.ts (tam kinowe loty,
 * tu ruch pierwszoosobowy). Jedyne zadanie: przerobić trzymane klawisze i
 * skumulowaną deltę myszy na pozycję/yaw/pitch oka gracza — z przyspieszeniem,
 * hamowaniem, grawitacją i kolizją z granicami pomieszczenia oraz preceptem.
 *
 * Nie jest silnikiem gry: brak skoku, brak fizyki ciał sztywnych, brak
 * nawigacji. Dokładnie tyle, ile potrzeba, żeby kamera przestała wyglądać
 * jak debugowa orbita, a zaczęła czuć się jak fizyczna obecność w pokoju.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Prostokątna przeszkoda (rzut z góry) — np. stanowisko eksperymentu na środku pokoju. */
export interface Obstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type MoveKey = 'forward' | 'back' | 'left' | 'right';

export interface FirstPersonControllerOptions {
  room: RoomBounds;
  obstacles?: readonly Obstacle[];
  eyeHeight?: number;
  moveSpeed?: number;
  acceleration?: number;
  deceleration?: number;
  gravity?: number;
  mouseSensitivity?: number;
  pitchLimit?: number;
  /** Promień gracza użyty do odsunięcia od ścian/przeszkód (kapsuła uproszczona do koła). */
  collisionRadius?: number;
  startPosition?: Vec2;
  startYaw?: number;
}

export interface FirstPersonState {
  position: Vec3;
  yaw: number;
  pitch: number;
  /** Prędkość pozioma. */
  speed: number;
  /**
   * Pionowe przesunięcie oka od chodu (metry) — WYŁĄCZNIE prezentacyjne:
   * zanika do ~0 w spoczynku (skalowane realną prędkością), nigdy nie
   * wpływa na `position`/kolizje. Warstwa prezentacji (labScene3D.ts) dodaje
   * je do wysokości kamery przy renderze; to jedyny efekt tej wartości.
   */
  bobOffset: number;
}

const DEFAULTS = {
  eyeHeight: 1.7,
  moveSpeed: 2.6,
  acceleration: 14,
  deceleration: 18,
  gravity: 9.8,
  mouseSensitivity: 0.0022,
  pitchLimit: 1.45,
  collisionRadius: 0.4,
  bobFrequency: 7.2,
  bobAmplitude: 0.028,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Odsuwa punkt na zewnątrz jednej przeszkody (AABB rozszerzonej o promień gracza) po osi najmniejszej penetracji. */
function resolveObstacle(x: number, z: number, obstacle: Obstacle, radius: number): Vec2 {
  const minX = obstacle.minX - radius;
  const maxX = obstacle.maxX + radius;
  const minZ = obstacle.minZ - radius;
  const maxZ = obstacle.maxZ + radius;
  if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) return { x, z };
  const penLeft = x - minX;
  const penRight = maxX - x;
  const penNear = z - minZ;
  const penFar = maxZ - z;
  const minPen = Math.min(penLeft, penRight, penNear, penFar);
  if (minPen === penLeft) return { x: minX, z };
  if (minPen === penRight) return { x: maxX, z };
  if (minPen === penNear) return { x, z: minZ };
  return { x, z: maxZ };
}

/**
 * Ruch pierwszoosobowy: klawisze + delta myszy → pozycja/yaw/pitch. Bez
 * zależności od THREE — warstwa prezentacji (labScene3D.ts) tylko odczytuje
 * `getState()` i ustawia nim prawdziwą kamerę WebGL.
 */
export class FirstPersonController {
  private readonly room: RoomBounds;
  private readonly obstacles: readonly Obstacle[];
  private readonly eyeHeight: number;
  private readonly moveSpeed: number;
  private readonly acceleration: number;
  private readonly deceleration: number;
  private readonly gravity: number;
  private readonly mouseSensitivity: number;
  private readonly pitchLimit: number;
  private readonly collisionRadius: number;
  private readonly bobFrequency: number;
  private readonly bobAmplitude: number;

  private keys: Record<MoveKey, boolean> = { forward: false, back: false, left: false, right: false };
  private pendingDx = 0;
  private pendingDy = 0;
  private velocity: Vec2 = { x: 0, z: 0 };
  private verticalVelocity = 0;
  private position: Vec3;
  private yaw: number;
  private pitch = 0;
  private bobPhase = 0;
  private bobOffset = 0;

  constructor(options: FirstPersonControllerOptions) {
    this.room = options.room;
    this.obstacles = options.obstacles ?? [];
    this.eyeHeight = options.eyeHeight ?? DEFAULTS.eyeHeight;
    this.moveSpeed = options.moveSpeed ?? DEFAULTS.moveSpeed;
    this.acceleration = options.acceleration ?? DEFAULTS.acceleration;
    this.deceleration = options.deceleration ?? DEFAULTS.deceleration;
    this.gravity = options.gravity ?? DEFAULTS.gravity;
    this.mouseSensitivity = options.mouseSensitivity ?? DEFAULTS.mouseSensitivity;
    this.pitchLimit = options.pitchLimit ?? DEFAULTS.pitchLimit;
    this.collisionRadius = options.collisionRadius ?? DEFAULTS.collisionRadius;
    this.bobFrequency = DEFAULTS.bobFrequency;
    this.bobAmplitude = DEFAULTS.bobAmplitude;
    const start = options.startPosition ?? { x: 0, z: (this.room.minZ + this.room.maxZ) / 2 };
    this.position = { x: start.x, y: this.eyeHeight, z: start.z };
    this.yaw = options.startYaw ?? 0;
  }

  setKey(key: MoveKey, down: boolean): void {
    this.keys[key] = down;
  }

  clearKeys(): void {
    this.keys = { forward: false, back: false, left: false, right: false };
  }

  addMouseDelta(dx: number, dy: number): void {
    this.pendingDx += dx;
    this.pendingDy += dy;
  }

  teleport(position: Vec2, yaw?: number): void {
    this.position = { x: position.x, y: this.eyeHeight, z: position.z };
    this.velocity = { x: 0, z: 0 };
    this.verticalVelocity = 0;
    this.bobPhase = 0;
    this.bobOffset = 0;
    if (yaw !== undefined) this.yaw = yaw;
  }

  getState(): FirstPersonState {
    return {
      position: { ...this.position },
      yaw: this.yaw,
      pitch: this.pitch,
      speed: Math.hypot(this.velocity.x, this.velocity.z),
      bobOffset: this.bobOffset,
    };
  }

  getForward(): Vec2 {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  getRight(): Vec2 {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
  }

  /**
   * Krok fizyki. `dt` w sekundach. Wołane co klatkę z Sim3D.update() — czysta
   * arytmetyka, zero dotyku THREE.Object3D (patrz kontrakt Sim3D).
   */
  update(dt: number): FirstPersonState {
    // Mysz: kumulacja deltas konsumowana raz na krok, żeby wiele zdarzeń
    // pointermove między klatkami rAF nie zgubiło ruchu.
    this.yaw -= this.pendingDx * this.mouseSensitivity;
    this.pitch = clamp(this.pitch - this.pendingDy * this.mouseSensitivity, -this.pitchLimit, this.pitchLimit);
    this.pendingDx = 0;
    this.pendingDy = 0;

    const forward = this.getForward();
    const right = this.getRight();
    let dirX = 0;
    let dirZ = 0;
    if (this.keys.forward) { dirX += forward.x; dirZ += forward.z; }
    if (this.keys.back) { dirX -= forward.x; dirZ -= forward.z; }
    if (this.keys.right) { dirX += right.x; dirZ += right.z; }
    if (this.keys.left) { dirX -= right.x; dirZ -= right.z; }
    const dirLen = Math.hypot(dirX, dirZ);
    const hasInput = dirLen > 1e-6;
    const targetX = hasInput ? (dirX / dirLen) * this.moveSpeed : 0;
    const targetZ = hasInput ? (dirZ / dirLen) * this.moveSpeed : 0;
    const rate = hasInput ? this.acceleration : this.deceleration;
    const moveToward = (current: number, target: number): number => {
      const diff = target - current;
      const maxStep = rate * dt;
      if (Math.abs(diff) <= maxStep) return target;
      return current + Math.sign(diff) * maxStep;
    };
    this.velocity = { x: moveToward(this.velocity.x, targetX), z: moveToward(this.velocity.z, targetZ) };

    let nextX = this.position.x + this.velocity.x * dt;
    let nextZ = this.position.z + this.velocity.z * dt;

    // Grawitacja: brak skoku w tym doświadczeniu, więc jedyny obserwowalny
    // efekt to trzymanie oka dokładnie na wysokości podłogi — ale liczona
    // naprawdę, nie ustawiona na sztywno.
    this.verticalVelocity -= this.gravity * dt;
    let nextY = this.position.y + this.verticalVelocity * dt;
    if (nextY <= this.eyeHeight) {
      nextY = this.eyeHeight;
      this.verticalVelocity = 0;
    }

    // Granice pomieszczenia (kolizja ze ścianami).
    nextX = clamp(nextX, this.room.minX + this.collisionRadius, this.room.maxX - this.collisionRadius);
    nextZ = clamp(nextZ, this.room.minZ + this.collisionRadius, this.room.maxZ - this.collisionRadius);

    // Kolizja ze stanowiskiem/przeszkodami — odsunięcie po osi najmniejszej penetracji.
    for (const obstacle of this.obstacles) {
      const resolved = resolveObstacle(nextX, nextZ, obstacle, this.collisionRadius);
      nextX = resolved.x;
      nextZ = resolved.z;
    }

    this.position = { x: nextX, y: nextY, z: nextZ };

    // Chód (head bob): WYŁĄCZNIE prezentacyjne — amplituda skalowana bieżącą
    // prędkością względem docelowej, więc zanika do ~0 w spoczynku zamiast
    // zamrażać się w dowolnej fazie. Nie dotyka `position`.
    const speedNow = Math.hypot(this.velocity.x, this.velocity.z);
    const speedRatio = this.moveSpeed > 0 ? clamp(speedNow / this.moveSpeed, 0, 1) : 0;
    this.bobPhase += dt * this.bobFrequency * speedRatio;
    this.bobOffset = Math.sin(this.bobPhase) * this.bobAmplitude * speedRatio;

    return this.getState();
  }
}
