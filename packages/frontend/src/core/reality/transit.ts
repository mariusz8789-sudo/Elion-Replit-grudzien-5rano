/**
 * Reality Transit — model STANU przejścia między dwiema rzeczywistościami,
 * zbudowany PRZED jakąkolwiek warstwą wizualną (świadomie, zgodnie z
 * dyrektywą: „zbuduj przejście stanu zanim zbudujesz tunel").
 *
 * To jest czysta maszyna stanów (bez THREE.js) — testowalna bez WebGL.
 * Warstwa wizualna (RealityEngine + scena tunelu) CZYTA ten stan, żeby
 * wiedzieć, gdzie w przejściu jesteśmy; nigdy odwrotnie. Dzięki temu
 * „gdzie jesteśmy w przejściu" jest jednoznacznym, testowalnym faktem, a
 * nie efektem ubocznym animacji.
 *
 * Cykl życia (fazy, w kolejności):
 *   idle → departing → in-transit → arriving → complete → (idle)
 *
 * - idle: brak aktywnego przejścia.
 * - departing: kamera/scena źródłowa zaczyna się deformować/oddalać.
 * - in-transit: „w tunelu" — pełny efekt przejścia, obie rzeczywistości
 *   niewidoczne bezpośrednio.
 * - arriving: rzeczywistość docelowa wyłania się.
 * - complete: przejście zakończone; jednorazowy stan przed powrotem do idle
 *   (pozwala konsumentowi wykryć „właśnie dotarliśmy" dokładnie raz).
 */

export type TransitPhase = 'idle' | 'departing' | 'in-transit' | 'arriving' | 'complete';

export interface TransitContext {
  /** Id gałęzi rzeczywistości źródłowej (skąd). */
  fromBranchId: string;
  /** Id gałęzi rzeczywistości docelowej (dokąd). */
  toBranchId: string;
  /** Id sceny źródłowej (kontekst grafu/sceny — skąd). */
  fromSceneId: string;
  /** Id sceny docelowej (dokąd). Równy fromSceneId, jeśli przejście zmienia tylko gałąź, nie typ sceny. */
  toSceneId: string;
}

export interface TransitState {
  phase: TransitPhase;
  /** 0..1 postęp CAŁEGO przejścia (przez wszystkie fazy). */
  progress: number;
  /** 0..1 postęp WEWNĄTRZ bieżącej fazy — do sterowania efektem danej fazy. */
  phaseProgress: number;
  context: TransitContext | null;
}

interface PhaseSpec {
  phase: Exclude<TransitPhase, 'idle' | 'complete'>;
  duration: number;
}

const DEFAULT_PHASES: PhaseSpec[] = [
  { phase: 'departing', duration: 0.9 },
  { phase: 'in-transit', duration: 1.2 },
  { phase: 'arriving', duration: 0.9 },
];

export class TransitController {
  private phases: PhaseSpec[];
  private totalDuration: number;
  private elapsed = 0;
  private active = false;
  private context: TransitContext | null = null;
  private completeConsumed = false;
  private listeners = new Set<(s: TransitState) => void>();

  constructor(phases: PhaseSpec[] = DEFAULT_PHASES) {
    if (phases.length === 0) throw new Error('TransitController wymaga co najmniej jednej fazy');
    this.phases = phases;
    this.totalDuration = phases.reduce((s, p) => s + p.duration, 0);
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Rozpoczyna przejście z podanym kontekstem. Ignoruje wywołanie, jeśli przejście już trwa (nie przerywamy w połowie). */
  begin(context: TransitContext): boolean {
    if (this.active) return false;
    this.context = context;
    this.elapsed = 0;
    this.active = true;
    this.completeConsumed = false;
    this.emit();
    return true;
  }

  /** Posuwa przejście o dt sekund i zwraca bieżący stan. No-op (zwraca idle), gdy nieaktywne. */
  advance(dt: number): TransitState {
    if (!this.active) return this.idleState();
    this.elapsed = Math.min(this.totalDuration, this.elapsed + Math.max(0, dt));
    const state = this.stateAt(this.elapsed);
    this.emit();
    return state;
  }

  /**
   * Zwraca true DOKŁADNIE RAZ, gdy przejście osiągnęło fazę 'complete' —
   * pozwala konsumentowi (RealityEngine) wykonać „zamianę na scenę docelową"
   * pojedynczo, nie w każdej klatce fazy complete. Po skonsumowaniu wraca do idle.
   */
  consumeCompletion(): TransitContext | null {
    if (!this.active) return null;
    if (this.elapsed < this.totalDuration) return null;
    if (this.completeConsumed) return null;
    this.completeConsumed = true;
    const ctx = this.context;
    this.active = false;
    this.context = null;
    this.elapsed = 0;
    this.emit();
    return ctx;
  }

  getState(): TransitState {
    return this.active ? this.stateAt(this.elapsed) : this.idleState();
  }

  private idleState(): TransitState {
    return { phase: 'idle', progress: 0, phaseProgress: 0, context: null };
  }

  private stateAt(elapsed: number): TransitState {
    const clamped = Math.max(0, Math.min(this.totalDuration, elapsed));
    if (clamped >= this.totalDuration) {
      return { phase: 'complete', progress: 1, phaseProgress: 1, context: this.context };
    }
    let acc = 0;
    for (const spec of this.phases) {
      if (clamped < acc + spec.duration) {
        const phaseProgress = spec.duration > 0 ? (clamped - acc) / spec.duration : 1;
        return {
          phase: spec.phase,
          progress: this.totalDuration > 0 ? clamped / this.totalDuration : 1,
          phaseProgress,
          context: this.context,
        };
      }
      acc += spec.duration;
    }
    // Bezpieczny fallback (nieosiągalny przy clamped < totalDuration).
    return { phase: 'complete', progress: 1, phaseProgress: 1, context: this.context };
  }

  subscribe(fn: (s: TransitState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const s = this.getState();
    for (const fn of this.listeners) fn(s);
  }
}
