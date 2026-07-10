/**
 * Genesis OS — rdzeń typów.
 *
 * Każde laboratorium jest modułem zgodnym z LabDefinition. Symulacje są
 * niezależne od Reacta (czysty canvas), więc w przyszłości można je przenieść
 * do silnika natywnego / WebGPU bez przepisywania logiki.
 */

/** Wartości parametrów sterujących symulacją. */
export type SimParams = Record<string, number | boolean | string>;

/** Poziom uczciwości naukowej modelu — zawsze widoczny w UI. */
export type HonestyLevel = 'exact' | 'simplified' | 'educational' | 'theoretical';

export const HONESTY_LABELS: Record<HonestyLevel, string> = {
  exact: 'Dokładne wzory fizyczne',
  simplified: 'Model uproszczony',
  educational: 'Model edukacyjny',
  theoretical: 'Model teoretyczny / hipoteza',
};

/** Deklaratywna definicja parametru — UI kontrolek generuje się z tego. */
export interface ParamDef {
  key: string;
  label: string;
  type: 'slider' | 'toggle' | 'select';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
  /** Formatowanie wartości do wyświetlenia (np. notacja naukowa). */
  format?: (v: number) => string;
}

/**
 * Symulacja niezależna od frameworka UI.
 * Kontrakt: init() przy montażu i zmianie rozmiaru, update() co klatkę,
 * render() co klatkę. Współrzędne w pikselach CSS (skalowanie DPR robi hook).
 */
export interface Sim {
  init(w: number, h: number): void;
  update(dt: number, params: SimParams): void;
  render(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** Statystyki żywej symulacji dla Narratora AI (np. liczba rozpadów). */
  getStats?(): Record<string, number>;
  /** Restart stanu (przycisk "od nowa"). */
  reset?(): void;
  /** Interakcja dotykiem/myszą (współrzędne CSS px). */
  pointer?(x: number, y: number, type: 'down' | 'move' | 'up'): void;
  /** Sprzątanie zasobów spoza Canvasu (np. AudioContext) przy odmontowaniu. */
  dispose?(): void;
}

/** Jeden blok narracji AI — tytuł + treść generowana z żywych parametrów. */
export interface NarrationBlock {
  title: string;
  body: string;
  kind?: 'insight' | 'warning' | 'hypothesis';
  /** Skąd pochodzi twierdzenie w tym bloku — opcjonalne, patrz core/citation.ts. */
  citation?: import('./citation').Citation;
}

/** Funkcja narracyjna laboratorium: parametry + statystyki → bloki tekstu. */
export type NarrateFn = (params: SimParams, stats: Record<string, number>) => NarrationBlock[];

/**
 * Eksperyment — pojedyncza symulacja wewnątrz laboratorium (Etap 1).
 * Laboratorium = kolekcja eksperymentów; każdy ma własną fizykę, parametry,
 * etykietę uczciwości i narrację.
 */
export interface ExperimentDef {
  id: string;
  name: string;
  honesty: HonestyLevel;
  honestyNote: string;
  params: ParamDef[];
  narrate: NarrateFn;
  /**
   * Dokładnie jedno z createSim/createSim3D musi być obecne (egzekwowane
   * przez komentarz, nie typy — jak createSim?/CustomView w LabDefinition).
   * createSim: scena Canvas 2D (domyślna, zdecydowana większość eksperymentów).
   */
  createSim?: () => Sim;
  /**
   * Opcjonalna scena 3D (Three.js) — patrz core/three/types.ts::Sim3D i
   * ARCHITECTURE.md „Sceny 3D". Fizyka (narrate, params) jest tym samym
   * kontraktem co dla 2D; różni się tylko warstwa renderująca.
   */
  createSim3D?: () => import('./three/types').Sim3D;
}

export interface LabDefinition {
  id: string;
  name: string;
  /** Krótki opis pod nazwą na karcie i w nagłówku. */
  tagline: string;
  /** Glif/emoji karty laboratorium. */
  icon: string;
  accent: string;
  honesty: HonestyLevel;
  /** Jedno zdanie: co ten model upraszcza / czego nie twierdzi. */
  honestyNote: string;
  params: ParamDef[];
  createSim?: () => Sim;
  narrate: NarrateFn;
  /**
   * Dodatkowe eksperymenty laboratorium (Etap 1+). Pola params/createSim/
   * narrate/honesty laboratorium opisują eksperyment pierwszy (bazowy);
   * ta lista dodaje kolejne.
   */
  experiments?: ExperimentDef[];
  /** Laboratorium z własnym ekranem (np. Atom Lab z układem okresowym). */
  CustomView?: React.ComponentType<{ lab: LabDefinition }>;
}
