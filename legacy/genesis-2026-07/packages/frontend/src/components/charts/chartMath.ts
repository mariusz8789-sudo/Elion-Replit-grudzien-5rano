/**
 * chartMath — pure geometry helpers for the SVG charts (V5). No DOM, no React →
 * unit-tested directly. All functions are deterministic and total (empty/degenerate
 * inputs return safe defaults) so a chart never throws on real, messy data.
 */

/** Map values to an SVG polyline path within [pad, w-pad] × [pad, h-pad]. */
export function sparklinePath(values: number[], w: number, h: number, pad = 2): string {
  if (values.length === 0) return '';
  if (values.length === 1) { const y = h / 2; return `M${pad} ${y.toFixed(2)} L${(w - pad).toFixed(2)} ${y.toFixed(2)}`; }
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const iw = w - pad * 2, ih = h - pad * 2;
  return values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * iw;
      const y = pad + ih - ((v - min) / span) * ih;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Closed area under the sparkline (for gradient fill). */
export function sparklineArea(values: number[], w: number, h: number, pad = 2): string {
  const line = sparklinePath(values, w, h, pad);
  if (!line) return '';
  return `${line} L${(w - pad).toFixed(2)} ${(h - pad).toFixed(2)} L${pad} ${(h - pad).toFixed(2)} Z`;
}

/**
 * Donut arc segments as stroke-dasharray/offset on a circle of radius r.
 * Returns, per value, the {dash, offset} to render a proportional arc.
 */
export function donutSegments(values: number[], r: number, gap = 0): { dash: string; offset: number }[] {
  const circ = 2 * Math.PI * r;
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0) return values.map(() => ({ dash: `0 ${circ}`, offset: 0 }));
  let acc = 0;
  return values.map((v) => {
    const frac = Math.max(0, v) / total;
    const len = Math.max(0, frac * circ - (gap > 0 ? 1 : 0));
    const seg = { dash: `${len.toFixed(2)} ${(circ - len).toFixed(2)}`, offset: -acc };
    acc += frac * circ;
    return seg;
  });
}

/** Cartesian point on a radar/polar axis i of n, at radius r around centre c. */
export function polar(c: number, r: number, i: number, n: number): { x: number; y: number } {
  const ang = (i / n) * 2 * Math.PI - Math.PI / 2; // start at top
  return { x: c + r * Math.cos(ang), y: c + r * Math.sin(ang) };
}

/** Radar polygon vertices for normalised values (0..1). */
export function radarPoints(values: number[], c: number, r: number): { x: number; y: number }[] {
  const n = values.length;
  return values.map((v, i) => polar(c, r * v, i, n));
}

/** "Nice" evenly spaced axis ticks between min and max (inclusive-ish). */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [min || 0];
  const range = max - min;
  const rawStep = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 0.5; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks.length ? ticks : [min, max];
}
