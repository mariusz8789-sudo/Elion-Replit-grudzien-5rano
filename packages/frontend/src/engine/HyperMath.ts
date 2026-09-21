export type Vec4 = [number, number, number, number];
export type Vec5 = [number, number, number, number, number];

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rotate4D(v: Vec4, plane: 'xy' | 'xz' | 'xw' | 'yz' | 'yw' | 'zw', angle: number): Vec4 {
  const out: Vec4 = [...v];
  const pairs: Record<typeof plane, [number, number]> = { xy: [0, 1], xz: [0, 2], xw: [0, 3], yz: [1, 2], yw: [1, 3], zw: [2, 3] };
  const [a, b] = pairs[plane];
  const c = Math.cos(angle); const s = Math.sin(angle);
  out[a] = v[a] * c - v[b] * s;
  out[b] = v[a] * s + v[b] * c;
  return out;
}

export function project5D(v: Vec5, time: number, focal = 5): Vec4 {
  const w = focal / Math.max(0.25, focal - v[4] * Math.sin(time * 0.37));
  return [v[0] * w, v[1] * w, v[2] * w, v[3] * w];
}

export function hyperNode(i: number, rng: () => number): Vec5 {
  const radius = 1.4 + Math.pow(rng(), 0.44) * 4.2;
  const theta = rng() * Math.PI * 2;
  const phi = Math.acos(2 * rng() - 1);
  return [
    Math.sin(phi) * Math.cos(theta) * radius,
    Math.cos(phi) * radius,
    Math.sin(phi) * Math.sin(theta) * radius,
    rng() * 2 - 1,
    (i % 9) / 4 - 1,
  ];
}
