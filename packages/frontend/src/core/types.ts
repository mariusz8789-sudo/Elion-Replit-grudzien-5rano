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
}

/** Jeden blok narracji AI — tytuł + treść generowana z żywych parametrów. */
export interface NarrationBlock {
  title: string;
  body: string;
  kind?: 'insight' | 'warning' | 'hypothesis';
}

/** Funkcja narracyjna laboratorium: parametry + statystyki → bloki tekstu. */
export type NarrateFn = (params: SimParams, stats: Record<string, number>) => NarrationBlock[];

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
  /** Laboratorium z własnym ekranem (np. Atom Lab z układem okresowym). */
  CustomView?: React.ComponentType<{ lab: LabDefinition }>;
  /** Zjawiska zaplanowane w tym laboratorium na kolejne etapy. */
  roadmap: string[];
}
