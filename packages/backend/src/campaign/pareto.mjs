/**
 * Front Pareto i miary postępu (minimalizacja wielokryterialna). Czyste,
 * deterministyczne, testowalne funkcje — bez zależności od RDKit czy bazy.
 */

/** a dominuje b (min): nie gorsze na wszystkich, lepsze na co najmniej jednym. */
export function dominates(a, b) {
  let strictly = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return false;
    if (a[i] < b[i]) strictly = true;
  }
  return strictly;
}

/** Zwraca indeksy niezdominowanych punktów (front Pareto). vectors: number[][]. */
export function paretoFrontIndices(vectors) {
  const front = [];
  for (let i = 0; i < vectors.length; i++) {
    let dominated = false;
    for (let j = 0; j < vectors.length; j++) {
      if (i !== j && dominates(vectors[j], vectors[i])) { dominated = true; break; }
    }
    if (!dominated) front.push(i);
  }
  return front;
}

/**
 * Hiperobjętość zdominowana 2D (MINIMALIZACJA) względem punktu odniesienia ref
 * = [refX, refY] (gorszy niż wszystkie punkty). Większa = lepszy front i JEST
 * monotoniczna: dodanie punktów nigdy jej nie zmniejsza.
 *
 * Metoda: mapujemy minimalizację na maksymalizację przez X=ref−p (≥0), po czym
 * sumujemy rozłączne prostokąty frontu posortowanego malejąco po X (standardowy
 * algorytm 2D HV dla maksymalizacji względem początku układu).
 */
export function hypervolume2D(points, ref) {
  const maxPts = points
    .filter((p) => p[0] <= ref[0] && p[1] <= ref[1])
    .map((p) => [ref[0] - p[0], ref[1] - p[1]]); // ≥ 0
  if (maxPts.length === 0) return 0;
  // Front niezdominowany dla MAKSYMALIZACJI.
  const nd = maxPts.filter((p, i) =>
    !maxPts.some((q, j) => j !== i && q[0] >= p[0] && q[1] >= p[1] && (q[0] > p[0] || q[1] > p[1])),
  );
  nd.sort((a, b) => b[0] - a[0] || b[1] - a[1]); // X malejąco
  let hv = 0;
  let prevY = 0;
  for (const [x, y] of nd) {
    if (y > prevY) { hv += x * (y - prevY); prevY = y; }
  }
  return hv;
}

/** Najlepsza (najmniejsza) skalaryzacja sumy znormalizowanej — pomocniczy skalar postępu. */
export function bestScalar(vectors) {
  let best = Infinity;
  for (const v of vectors) {
    const s = v.reduce((a, b) => a + b, 0);
    if (s < best) best = s;
  }
  return Number.isFinite(best) ? best : null;
}
