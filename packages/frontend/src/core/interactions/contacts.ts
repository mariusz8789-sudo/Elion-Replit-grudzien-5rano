import type { SimAgent, TransmissionEvent } from '../simulation/types';

/**
 * INTERACTIONS — wykrywanie kontaktów przestrzennych i transmisja.
 *
 * Zakażenie wynika WYŁĄCZNIE z bliskości agentów (nie z góry ustalonego
 * harmonogramu ani z modelu przedziałowego). Siatka przestrzenna daje złożoność
 * O(n) dla dużej liczby agentów. Prawdopodobieństwo zakażenia na kontakt-krok:
 * P = 1 − exp(−β·Δt) (proces Poissona) — dłuższy kontakt = więcej kroków =
 * więcej szans, więc „czas kontaktu" liczy się realnie. β = R0/D_zak.
 */

export interface ContactResult {
  /** Nowo narażeni: id agenta → id źródła. */
  exposures: Map<number, number>;
  /** Zdarzenia transmisji (do wizualizacji iskier). */
  events: TransmissionEvent[];
  /** Liczba par w kontakcie (statystyka/obserwowalność). */
  contactPairs: number;
}

export interface ContactParams {
  contactRadius: number;
  beta: number;   // R0 / D_zak
  dt: number;     // krok [dni]
  rng: () => number;
  /** Mnożnik zaraźliwości od interwencji (np. maski) 0..1. */
  transmissionScale: number;
  /** Który stan jest podatny / zakaźny. */
  susceptible: string;
  infectious: string;
}

/**
 * Rozwiązuje kontakty dla jednego kroku. Nie mutuje agentów — zwraca listę
 * ekspozycji, którą silnik zastosuje (rozdział odpowiedzialności). Agenci
 * odizolowani nie biorą udziału w kontaktach.
 */
export function resolveContacts(agents: readonly SimAgent[], p: ContactParams): ContactResult {
  const R = p.contactRadius;
  const pInfect = (1 - Math.exp(-p.beta * p.dt)) * clamp01(p.transmissionScale);
  const exposures = new Map<number, number>();
  const events: TransmissionEvent[] = [];
  let contactPairs = 0;
  if (R <= 0) return { exposures, events, contactPairs };

  const cell = R;
  const grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 100000 + cy;
  const infectious: number[] = [];
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    if (a.state === 'D' || a.isolated) continue;
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    const k = key(cx, cy);
    let bucket = grid.get(k); if (!bucket) { bucket = []; grid.set(k, bucket); }
    bucket.push(i);
    if (a.state === p.infectious) infectious.push(i);
  }
  const R2 = R * R;
  for (const si of infectious) {
    const src = agents[si];
    const cx = Math.floor(src.x / cell), cy = Math.floor(src.y / cell);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const bucket = grid.get(key(cx + ox, cy + oy));
        if (!bucket) continue;
        for (const ti of bucket) {
          const tgt = agents[ti];
          if (tgt.state !== p.susceptible) continue;
          const dx = tgt.x - src.x, dy = tgt.y - src.y;
          if (dx * dx + dy * dy > R2) continue;
          contactPairs++;
          if (!exposures.has(ti) && p.rng() < pInfect) {
            exposures.set(ti, src.id);
            events.push({ from: src.id, to: tgt.id, x: tgt.x, y: tgt.y });
          }
        }
      }
    }
  }
  return { exposures, events, contactPairs };
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
