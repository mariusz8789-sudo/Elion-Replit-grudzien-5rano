import type { SimAgent } from './types';

/**
 * ANALYSIS — warstwa „→ ANALIZA" pipeline'u Visual Scene Engine
 * (model → agenci → zachowanie → interakcja → wizualizacja → kamera → ANALIZA).
 *
 * Liczy POLE analityczne wprost ze STANU AGENTÓW (nie z osobnego źródła):
 *  - density  : gęstość obecnych agentów (gdzie są tłumy → gdzie grożą kontakty),
 *  - risk     : ciśnienie transmisji = gęstość ZAKAŹNYCH, rozmyta o sąsiedztwo
 *               (przybliża zasięg kontaktu) — pokazuje, GDZIE epidemia napiera,
 *  - immunity : udział ODPORNYCH w komórce (0..1) — gdzie populacja jest chroniona.
 *
 * Czyste funkcje (bez Canvasu) → testowalne. Heatmapa to WNIOSEK z modelu,
 * a nie dekoracja: przy zerze zakaźnych pole „risk" jest zerowe.
 */

export type AnalysisMode = 'none' | 'density' | 'risk' | 'immunity';

export const ANALYSIS_MODES: { id: AnalysisMode; label: string }[] = [
  { id: 'none', label: 'Brak' },
  { id: 'density', label: 'Gęstość' },
  { id: 'risk', label: 'Ryzyko transmisji' },
  { id: 'immunity', label: 'Odporność' },
];

export interface AnalysisField {
  cols: number;
  rows: number;
  values: Float32Array; // znormalizowane 0..1
  max: number;          // wartość surowa odpowiadająca 1.0 (do legendy)
  mode: AnalysisMode;
}

export function computeField(
  agents: readonly SimAgent[], worldW: number, worldH: number, mode: AnalysisMode,
  cols = 36, rows = 24,
): AnalysisField {
  const n = cols * rows;
  const values = new Float32Array(n);
  if (mode === 'none') return { cols, rows, values, max: 0, mode };

  const cellW = worldW / cols, cellH = worldH / rows;
  const idx = (cx: number, cy: number) => cy * cols + cx;
  const cellOf = (a: SimAgent) => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(a.x / cellW)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(a.y / cellH)));
    return idx(cx, cy);
  };

  if (mode === 'immunity') {
    const tot = new Float32Array(n);
    for (const a of agents) {
      if (a.state === 'D') continue;
      const i = cellOf(a); tot[i]++; if (a.state === 'R') values[i]++;
    }
    for (let i = 0; i < n; i++) values[i] = tot[i] > 0 ? values[i] / tot[i] : 0;
    return { cols, rows, values, max: 1, mode };
  }

  // density / risk: zliczanie do siatki.
  for (const a of agents) {
    if (a.state === 'D') continue;
    if (mode === 'risk') { if (a.state === 'I' && !a.isolated) values[cellOf(a)]++; }
    else { values[cellOf(a)]++; } // density
  }

  if (mode === 'risk') boxBlur(values, cols, rows); // rozmycie ~ zasięg kontaktu

  let max = 0;
  for (let i = 0; i < n; i++) if (values[i] > max) max = values[i];
  if (max > 0) for (let i = 0; i < n; i++) values[i] /= max;
  return { cols, rows, values, max, mode };
}

/** Jednoprzebiegowe rozmycie pudełkowe 3×3 (rozlewa ciśnienie na sąsiadów). */
function boxBlur(v: Float32Array, cols: number, rows: number): void {
  const out = new Float32Array(v.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let sum = 0, cnt = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        sum += v[ny * cols + nx]; cnt++;
      }
      out[y * cols + x] = sum / cnt;
    }
  }
  v.set(out);
}

/** Rampa cieplna 0..1 → [r,g,b] (niebieski→cyjan→zielony→żółty→czerwony). */
export function heatColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  // 4 odcinki interpolacji.
  const stops: [number, [number, number, number]][] = [
    [0.0, [40, 90, 200]],   // niebieski
    [0.35, [40, 200, 200]], // cyjan
    [0.6, [80, 210, 90]],   // zielony
    [0.8, [240, 210, 60]],  // żółty
    [1.0, [235, 70, 70]],   // czerwony
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    if (x <= t1) {
      const f = (x - t0) / Math.max(1e-6, t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}
