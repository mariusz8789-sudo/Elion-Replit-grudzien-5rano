/**
 * Kinowy sekwencer kamery — jawnie, osobno oznaczona warstwa INTERPRETACJI
 * (patrz core/types.ts::HonestyLevel 'cinematic'): TRASA lotu kamery
 * (easing, czas trwania, kadrowanie) jest reżyserską decyzją, nie
 * przewidywaniem fizycznym. To, co kamera POKAZUJE (pozycje ciał, wartości
 * węzłów Grafu Modeli), pozostaje dokładnie tak uczciwe, jak węzeł, z
 * którego pochodzi — sekwencer NIGDY nie modyfikuje wartości fizycznych,
 * tylko trasę, którą je oglądamy.
 *
 * Czysta matematyka (bez THREE.js) — testowalna bez WebGL. RealityEngine.ts
 * dostarcza jedyne miejsce, gdzie wynik dotyka prawdziwej kamery.
 */
import type { CameraFraming } from './types';

export type Vec3 = readonly [number, number, number];

export type Easing = (t: number) => number;

export const Easings = {
  linear: (t: number): number => t,
  easeInOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutQuint: (t: number): number => 1 - Math.pow(1 - t, 5),
} as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Kopia Vec3 do MUTOWALNEJ krotki (CameraFraming.position/lookAt są mutowalne w types.ts). */
function mut(v: Vec3): [number, number, number] {
  return [v[0], v[1], v[2]];
}

export interface FlightKeyframe {
  /** Sekundy od startu lotu, w kolejności rosnącej; pierwszy powinien być 0. */
  t: number;
  position: Vec3;
  lookAt: Vec3;
  /** Easing zastosowany DO tego segmentu (od poprzedniej klatki kluczowej do tej). Domyślnie easeInOutCubic. */
  easing?: Easing;
  /** Opcjonalna etykieta wyświetlana w UI podczas przelotu przez ten segment — np. nazwa węzła Grafu Modeli, który staje się widoczny. */
  label?: string;
}

export interface FlightState {
  position: Vec3;
  lookAt: Vec3;
  /** Etykieta bieżącego segmentu (dla panelu "co teraz widać"), null gdy lot się zakończył. */
  label: string | null;
  /** 0..1 postęp całego lotu. */
  progress: number;
  done: boolean;
}

/**
 * Odtwarza ciągłą trasę przez N≥2 klatek kluczowych. Zamiast pojedynczego
 * cięcia (stary wzorzec: `camera.position.set(...)` raz w init()), pozwala
 * na WIELOETAPOWY, ciągły przelot — dokładnie to, czego brakowało w 13
 * dotychczasowych labach (tam kamera tylko orbituje wokół stałego celu).
 */
export class CameraFlight {
  private keyframes: FlightKeyframe[];
  private elapsed = 0;

  constructor(keyframes: FlightKeyframe[]) {
    if (keyframes.length < 2) throw new Error('CameraFlight wymaga co najmniej 2 klatek kluczowych');
    for (let i = 1; i < keyframes.length; i++) {
      if (keyframes[i].t <= keyframes[i - 1].t) {
        throw new Error('Klatki kluczowe CameraFlight muszą mieć rosnący czas t');
      }
    }
    this.keyframes = keyframes;
  }

  get totalDuration(): number {
    return this.keyframes[this.keyframes.length - 1].t;
  }

  reset(): void {
    this.elapsed = 0;
  }

  advance(dt: number): FlightState {
    this.elapsed = Math.min(this.totalDuration, this.elapsed + dt);
    return this.stateAt(this.elapsed);
  }

  stateAt(elapsed: number): FlightState {
    const total = this.totalDuration;
    const clamped = Math.max(0, Math.min(total, elapsed));
    let segIndex = 0;
    for (let i = 0; i < this.keyframes.length - 1; i++) {
      if (clamped >= this.keyframes[i].t && clamped <= this.keyframes[i + 1].t) {
        segIndex = i;
        break;
      }
      segIndex = i;
    }
    const a = this.keyframes[segIndex];
    const b = this.keyframes[segIndex + 1];
    const segDur = b.t - a.t;
    const localT = segDur > 0 ? (clamped - a.t) / segDur : 1;
    const eased = (b.easing ?? Easings.easeInOutCubic)(Math.max(0, Math.min(1, localT)));
    return {
      position: lerpVec3(a.position, b.position, eased),
      lookAt: lerpVec3(a.lookAt, b.lookAt, eased),
      label: b.label ?? a.label ?? null,
      progress: total > 0 ? clamped / total : 1,
      done: clamped >= total,
    };
  }

  get isDone(): boolean {
    return this.elapsed >= this.totalDuration;
  }
}

/** Buduje prosty dwu-klatkowy lot A→B — najczęstszy przypadek (zmiana sceny/kadru). */
export function flightBetween(from: CameraFraming, to: CameraFraming, duration: number, easing: Easing = Easings.easeInOutCubic, label?: string): CameraFlight {
  return new CameraFlight([
    { t: 0, position: from.position, lookAt: from.lookAt },
    { t: duration, position: to.position, lookAt: to.lookAt, easing, label },
  ]);
}

/**
 * Reużywalne PRYMITYWY choreografii kamery — nazwane wzorce lotu, zamiast
 * kodować każdą sekwencję jako jeden wielki, ręcznie pisany timeline. Każdy
 * zwraca gotowy CameraFlight, który silnik może odtworzyć (playFlight).
 * Wszystkie należą do warstwy 'cinematic' (patrz HonestyLevel) — decydują,
 * JAK oglądamy scenę, nie zmieniają żadnej wartości fizycznej.
 *
 * Konwencja: `focus` to punkt zainteresowania (lookAt), `dist` skala
 * odległości sceny (zwykle promień istotnej struktury × kilka).
 */
export const CameraMoves = {
  /** Ujęcie ustanawiające — szeroki, lekko górny kadr całej sceny. */
  establishingShot(focus: Vec3, dist: number, duration = 2.4, label?: string): CameraFlight {
    const to: CameraFraming = { position: [focus[0] + dist * 0.55, focus[1] + dist * 0.6, focus[2] + dist * 1.15], lookAt: mut(focus) };
    return flightBetween({ position: to.position, lookAt: to.lookAt }, to, duration, Easings.easeInOutCubic, label);
  },

  /** Przylot z daleka do celu — kamera „przybywa" z dużej odległości do bliskiego kadru. */
  arrival(from: CameraFraming, focus: Vec3, dist: number, duration = 2.2, label?: string): CameraFlight {
    return flightBetween(from, { position: [focus[0] + dist * 0.4, focus[1] + dist * 0.35, focus[2] + dist * 0.7], lookAt: mut(focus) }, duration, Easings.easeOutQuint, label);
  },

  /** Podejście do węzła — z bieżącego kadru do zbliżenia na konkretny punkt (np. węzeł grafu). */
  nodeApproach(from: CameraFraming, nodePos: Vec3, duration = 1.6, label?: string): CameraFlight {
    return flightBetween(from, { position: [nodePos[0] + 0.7, nodePos[1] + 0.5, nodePos[2] + 0.7], lookAt: mut(nodePos) }, duration, Easings.easeInOutCubic, label);
  },

  /** Orbita wokół celu — łuk o zadanym kącie na stałym promieniu (3 klatki dla gładkości). */
  orbit(focus: Vec3, radius: number, height: number, startAngle: number, sweep: number, duration = 3, label?: string): CameraFlight {
    const at = (a: number): [number, number, number] => [focus[0] + Math.cos(a) * radius, focus[1] + height, focus[2] + Math.sin(a) * radius];
    return new CameraFlight([
      { t: 0, position: at(startAngle), lookAt: mut(focus) },
      { t: duration / 2, position: at(startAngle + sweep / 2), lookAt: mut(focus), easing: Easings.linear, label },
      { t: duration, position: at(startAngle + sweep), lookAt: mut(focus), easing: Easings.linear, label },
    ]);
  },

  /** Zatrzymanie na detalu — bardzo powolny, minimalny dojazd, żeby „przytrzymać" uwagę na jednym miejscu. */
  holdOnDetail(at: CameraFraming, duration = 1.4, label?: string): CameraFlight {
    const nudged: CameraFraming = { position: [at.position[0] * 0.98, at.position[1] * 0.98, at.position[2] * 0.98], lookAt: at.lookAt };
    return flightBetween(at, nudged, duration, Easings.easeInOutCubic, label);
  },

  /** Odsłonięcie gałęzi — odjazd i przesunięcie w bok, żeby druga rzeczywistość („duch") weszła w kadr. */
  branchReveal(from: CameraFraming, focus: Vec3, dist: number, sideOffset: number, duration = 2.2, label?: string): CameraFlight {
    return flightBetween(from, { position: [focus[0] + sideOffset * 0.5 + dist * 0.4, focus[1] + dist * 0.7, focus[2] + dist * 1.3], lookAt: [focus[0] + sideOffset * 0.5, focus[1], focus[2]] }, duration, Easings.easeInOutCubic, label);
  },

  /** Wyjście z transitu — szybkie „wyłonienie" do domyślnego kadru rzeczywistości docelowej. */
  transitExit(destinationFraming: CameraFraming, dist: number, duration = 1.8, label?: string): CameraFlight {
    const from: CameraFraming = { position: [destinationFraming.position[0], destinationFraming.position[1] + dist * 0.4, destinationFraming.position[2] + dist * 0.9], lookAt: destinationFraming.lookAt };
    return flightBetween(from, destinationFraming, duration, Easings.easeOutQuint, label);
  },
} as const;
