import type { EarthquakeCityOverlayProjection } from './earthquakeCoordinateMapping';

let pendingOverlay: EarthquakeCityOverlayProjection | null = null;

export function setPendingEarthquakeOverlay(overlay: EarthquakeCityOverlayProjection | null): void {
  pendingOverlay = overlay;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('genesis:earthquake-overlay-ready'));
}

export function consumePendingEarthquakeOverlay(): EarthquakeCityOverlayProjection | null {
  const overlay = pendingOverlay;
  pendingOverlay = null;
  return overlay;
}

export function clearPendingEarthquakeOverlay(): void {
  pendingOverlay = null;
}
