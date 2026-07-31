/**
 * graphLayout — a small, DETERMINISTIC force-directed layout for the Knowledge
 * Graph (V5). No Math.random (so the same graph always renders identically and
 * the layout is unit-testable): nodes start on a circle by index, then a fixed
 * number of Fruchterman-Reingold-style relaxation steps (repulsion between all
 * nodes + spring attraction along edges) settle them inside the viewport.
 */
export interface GNode { id: string; type: string; label: string }
export interface GEdge { source: string; target: string; label?: string }
export interface Positioned { id: string; type: string; label: string; x: number; y: number }

export function layoutGraph(
  nodes: GNode[],
  edges: GEdge[],
  { width = 640, height = 420, iterations = 140, seedRadius }: { width?: number; height?: number; iterations?: number; seedRadius?: number } = {},
): Positioned[] {
  const n = nodes.length;
  if (n === 0) return [];
  const cx = width / 2, cy = height / 2;
  const R = seedRadius ?? Math.min(width, height) * 0.36;
  // Deterministic seed: evenly spaced on a circle by index.
  const pos = nodes.map((nd, i) => {
    const a = (i / n) * 2 * Math.PI;
    return { ...nd, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  if (n === 1) return [{ ...pos[0], x: cx, y: cy }];

  const idx = new Map(nodes.map((nd, i) => [nd.id, i]));
  const k = Math.sqrt((width * height) / n) * 0.8; // ideal edge length
  let temp = Math.min(width, height) * 0.12;
  const cool = temp / (iterations + 1);

  for (let it = 0; it < iterations; it++) {
    const dispX = new Array(n).fill(0);
    const dispY = new Array(n).fill(0);
    // Repulsion (all pairs).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy) || 0.01;
        if (dist < 0.01) { dx = (i - j) * 0.01; dy = 0.01; dist = 0.02; }
        const force = (k * k) / dist;
        const ux = dx / dist, uy = dy / dist;
        dispX[i] += ux * force; dispY[i] += uy * force;
        dispX[j] -= ux * force; dispY[j] -= uy * force;
      }
    }
    // Attraction (along edges).
    for (const e of edges) {
      const a = idx.get(e.source), b = idx.get(e.target);
      if (a == null || b == null) continue;
      const dx = pos[a].x - pos[b].x, dy = pos[a].y - pos[b].y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist * dist) / k;
      const ux = dx / dist, uy = dy / dist;
      dispX[a] -= ux * force; dispY[a] -= uy * force;
      dispX[b] += ux * force; dispY[b] += uy * force;
    }
    // Apply, bounded by temperature; keep inside the viewport with a margin.
    const m = 26;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(dispX[i], dispY[i]) || 0.01;
      pos[i].x += (dispX[i] / d) * Math.min(d, temp);
      pos[i].y += (dispY[i] / d) * Math.min(d, temp);
      pos[i].x = Math.max(m, Math.min(width - m, pos[i].x));
      pos[i].y = Math.max(m, Math.min(height - m, pos[i].y));
    }
    temp = Math.max(0, temp - cool);
  }
  return pos.map((p) => ({ id: p.id, type: p.type, label: p.label, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
}
