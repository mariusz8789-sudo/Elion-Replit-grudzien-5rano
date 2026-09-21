/**
 * HOLO TELEMETRY — the bridge between the full-bleed WebGL world and the 5D
 * manifold engine on the backend.
 *
 * The backdrop records the camera's real flight path as 5D samples
 * (x, y, z, t = seconds, w = signed distance to the portal plane); the shell
 * posts that path to `/api/manifold/evaluate` and shows the computed geometry
 * (curvature, stability, SDF occupancy) in the HUD, next to the machine's
 * measured telemetry from `/api/system/telemetry`. Nothing displayed is a
 * constant: no samples → no manifold readout; no backend → no readout.
 */

export interface HoloPoint5D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly temporalT: number;
  readonly hyperspaceW: number;
}

const CAPACITY = 64;
const ring: HoloPoint5D[] = [];

/** Called by the backdrop's frame loop (throttled by the caller). */
export function pushHoloPoint(p: HoloPoint5D): void {
  ring.push(p);
  if (ring.length > CAPACITY) ring.splice(0, ring.length - CAPACITY);
}

/** A copy of the recorded path, oldest first. */
export function snapshotHoloPath(): HoloPoint5D[] {
  return ring.slice();
}

/** Test hook. */
export function resetHoloPath(): void {
  ring.length = 0;
}

export interface SystemTelemetryView {
  readonly cpuCount: number;
  readonly totalMemBytes: number;
  readonly freeMemBytes: number;
  readonly loadAvg: readonly number[];
}

export interface ManifoldView {
  readonly curvature: { readonly mean: number };
  readonly temporalStabilityIndex: number;
  readonly sdf: { readonly insideFraction: number };
  readonly pointCount: number;
}

const gb = (bytes: number): string => (bytes / 1e9).toFixed(1);

/** Pure formatter: only what the backend measured or computed, or nothing. */
export function formatHudTelemetry(sys: SystemTelemetryView | null, manifold: ManifoldView | null): string {
  const parts: string[] = [];
  if (sys) {
    const used = Math.max(0, sys.totalMemBytes - sys.freeMemBytes);
    parts.push(`CPU ${sys.cpuCount}`, `MEM ${gb(used)}/${gb(sys.totalMemBytes)}G`, `LOAD ${(sys.loadAvg[0] ?? 0).toFixed(2)}`);
  }
  if (manifold && manifold.pointCount >= 3) {
    parts.push(`M5D κ=${manifold.curvature.mean.toFixed(3)}`, `S=${manifold.temporalStabilityIndex.toFixed(2)}`, `SDF∈${Math.round(manifold.sdf.insideFraction * 100)}%`);
  }
  return parts.join(' · ');
}
