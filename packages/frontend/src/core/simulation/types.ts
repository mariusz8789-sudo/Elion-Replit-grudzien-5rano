/**
 * VISUAL SCENE ENGINE — uniwersalne typy (nie tylko epidemia).
 *
 * Kontrakt oddziela ŚWIAT (obiekty sceny) i AGENTÓW (obiekty symulacji) od
 * WARSTWY RENDERUJĄCEJ i UI. Dowolny model (epidemia, ruch uliczny, tłum,
 * ekosystem, ekonomia…) implementuje `VisualSimulation`, a ten sam renderer
 * i ten sam ekran React potrafią go pokazać. Zasada nadrzędna:
 * „wizualizujemy PROCES symulacji, nie gotowy wynik".
 */

/** Statyczny obiekt świata (budynek, strefa, przeszkoda). Współrzędne w pikselach świata. */
export interface WorldObject {
  kind: string;          // np. 'home' | 'shop' | 'school' | 'hospital' | 'isolation' | 'park'
  x: number; y: number; w: number; h: number;
  label?: string;
  /** Czy zamknięty przez interwencję (renderer wyszarza). */
  closed?: boolean;
}

/** Agent — pełny obiekt symulacji (pozycja, ruch, cel, stan, czas w stanie…). */
export interface SimAgent {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  /** Cel ruchu (punkt w świecie). */
  goalX: number; goalY: number;
  /** Klucz stanu do kolorowania (np. 'S' | 'E' | 'I' | 'R' | 'D'). */
  state: string;
  /** Czas przebywania w bieżącym stanie [dni]. */
  stateSince: number;
  /** Czy odizolowany (interwencja/kwarantanna) — renderer i logika ruchu to uwzględniają. */
  isolated: boolean;
  /** Widoczne zachowanie proceduralne. */
  behavior: string;
  /** ID agenta-źródła zakażenia (provenance transmisji) lub -1. */
  infectedBy: number;
}

/** Zdarzenie transmisji w bieżącym ticku (do podświetlenia na scenie). */
export interface TransmissionEvent { from: number; to: number; x: number; y: number }

/**
 * Uniwersalna symulacja wizualna. Silnik jest źródłem prawdy; renderer i UI
 * tylko czytają. `tick(dtDays)` MUSI zaktualizować: ruch, interakcje, ekspozycję,
 * transmisję, przejścia stanów, interwencje i statystyki — w tej kolejności.
 */
export interface VisualSimulation {
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly stateColors: Record<string, string>;
  objects(): readonly WorldObject[];
  agents(): readonly SimAgent[];
  /** Zdarzenia transmisji z ostatniego ticku (efemeryczne, do renderu iskier). */
  lastTransmissions(): readonly TransmissionEvent[];
  tick(dtDays: number): void;
  reset(): void;
  setParam(key: string, value: number | boolean): void;
  getParams(): Record<string, number | boolean>;
  /** Bieżące liczniki (S/E/I/R/D, szczyt…) — źródło dla panelu i wykresu. */
  stats(): Record<string, number>;
  /** Szereg czasowy zbudowany Z PRZEBIEGU świata (wykres jest skutkiem, nie źródłem). */
  history(): readonly Record<string, number>[];
  /** Dane debug dla konkretnego agenta (Observability / Debug Mode). */
  debugInfo(agentId: number): Record<string, string | number> | null;
}
