/**
 * Współdzielone narzędzia rysowania Canvas 2D.
 * Wydzielone z powtarzającego się wzorca `moveTo`/`lineTo` obecnego
 * w ~10 silnikach symulacji — jedno miejsce do poprawek i testów.
 */

export interface Point {
  x: number;
  y: number;
}

/** Rysuje łamaną przez punkty (nie domyka ani nie stroke'uje — wywołaj ctx.stroke() po). */
export function tracePolyline(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
}

/** Jak tracePolyline, ale z funkcją mapującą indeks → punkt (unika alokacji tablicy). */
export function tracePolylineBy(
  ctx: CanvasRenderingContext2D,
  count: number,
  at: (i: number) => Point,
): void {
  if (count === 0) return;
  ctx.beginPath();
  const p0 = at(0);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < count; i++) {
    const p = at(i);
    ctx.lineTo(p.x, p.y);
  }
}

/** Rysuje i odmalowuje łamaną jedną linią — najczęstszy przypadek użycia. */
export function strokePolyline(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  style: string,
  lineWidth = 1,
): void {
  if (points.length < 2) return;
  tracePolyline(ctx, points);
  ctx.strokeStyle = style;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}
