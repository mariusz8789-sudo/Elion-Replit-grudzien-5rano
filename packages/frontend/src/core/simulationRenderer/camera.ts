/**
 * CAMERA — zoom / pan / follow dla Visual Scene Engine.
 *
 * Czysta matematyka transformacji świat↔ekran (bez Canvasu), więc testowalna.
 * Kamera nie zna modelu — dostaje tylko rozmiar świata i widoku. „Follow"
 * realizuje się ustawiając target na pozycję agenta (robi to warstwa UI).
 */

export interface Camera {
  zoom: number;   // 1 = dopasowanie świata do widoku
  /** Punkt świata w centrum widoku. */
  cx: number; cy: number;
}

export function defaultCamera(worldW: number, worldH: number): Camera {
  return { zoom: 1, cx: worldW / 2, cy: worldH / 2 };
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Skala bazowa: ile px ekranu na jednostkę świata przy zoom=1 (contain). */
export function baseScale(worldW: number, worldH: number, viewW: number, viewH: number): number {
  return Math.min(viewW / worldW, viewH / worldH);
}

export interface Transform { scale: number; offsetX: number; offsetY: number }

/** Wyznacza transformację świat→ekran: sx = wx*scale + offsetX. */
export function computeTransform(cam: Camera, worldW: number, worldH: number, viewW: number, viewH: number): Transform {
  const scale = baseScale(worldW, worldH, viewW, viewH) * cam.zoom;
  const offsetX = viewW / 2 - cam.cx * scale;
  const offsetY = viewH / 2 - cam.cy * scale;
  return { scale, offsetX, offsetY };
}

export function worldToScreen(t: Transform, wx: number, wy: number): { x: number; y: number } {
  return { x: wx * t.scale + t.offsetX, y: wy * t.scale + t.offsetY };
}

export function screenToWorld(t: Transform, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - t.offsetX) / t.scale, y: (sy - t.offsetY) / t.scale };
}

/** Zoom „do kursora": po zmianie zoom punkt świata pod kursorem zostaje na miejscu. */
export function zoomAt(cam: Camera, factor: number, screenX: number, screenY: number, worldW: number, worldH: number, viewW: number, viewH: number): Camera {
  const before = computeTransform(cam, worldW, worldH, viewW, viewH);
  const w = screenToWorld(before, screenX, screenY);
  const zoom = clampZoom(cam.zoom * factor);
  const next: Camera = { ...cam, zoom };
  const after = computeTransform(next, worldW, worldH, viewW, viewH);
  const w2 = screenToWorld(after, screenX, screenY);
  // Przesuń centrum tak, by punkt pod kursorem się nie ruszył.
  next.cx = clamp(cam.cx + (w.x - w2.x), 0, worldW);
  next.cy = clamp(cam.cy + (w.y - w2.y), 0, worldH);
  return next;
}

export function panBy(cam: Camera, dxWorld: number, dyWorld: number, worldW: number, worldH: number): Camera {
  return { ...cam, cx: clamp(cam.cx - dxWorld, 0, worldW), cy: clamp(cam.cy - dyWorld, 0, worldH) };
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }
