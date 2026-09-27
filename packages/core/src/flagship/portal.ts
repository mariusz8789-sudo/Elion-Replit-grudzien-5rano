/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';
import type { FlagshipEpistemicStatus, FlagshipMode } from './epistemicGuard.js';
import { guardWorldMode } from './epistemicGuard.js';

/**
 * CIRCULAR GATE / PHASE TUNNEL (D-130) — an original portal mechanic as a
 * pure state machine (concept-level only; no franchise set design, glyphs or
 * dialogue). A portal is TRANSPORT + PRESENTATION: it carries the traveller
 * to a destination world and carries that world's epistemic mode with it —
 * it never changes what is true. The phase-tunnel visual parameters come
 * from the existing relativistic engine's `warpFactor` (MODEL), and every
 * visual mode declares its status: no effect is evidence that a traversable
 * wormhole exists.
 */
export type PortalStyle = 'CIRCULAR_GATE' | 'PHASE_TUNNEL';
export type PortalPhase = 'DORMANT' | 'POWERUP' | 'RING_ALIGNMENT' | 'FIELD_STABILIZATION' | 'THRESHOLD_OPEN' | 'TRAVERSAL' | 'STABILIZE' | 'CLOSE';
export const PORTAL_SEQUENCE: readonly PortalPhase[] = ['DORMANT', 'POWERUP', 'RING_ALIGNMENT', 'FIELD_STABILIZATION', 'THRESHOLD_OPEN', 'TRAVERSAL', 'STABILIZE', 'CLOSE'];
export type TunnelVisualMode = 'VISUAL_TUNNEL_ONLY' | 'CONCEPTUAL_PHYSICS_MODEL' | 'INTERACTIVE_SIMULATION' | 'FICTIONAL';
export const TUNNEL_MODE_STATUS: Readonly<Record<TunnelVisualMode, FlagshipEpistemicStatus>> = { VISUAL_TUNNEL_ONLY: 'FICTIONAL', CONCEPTUAL_PHYSICS_MODEL: 'MODEL', INTERACTIVE_SIMULATION: 'SIMULATION', FICTIONAL: 'FICTIONAL' };

export interface PortalSnapshot {
  readonly portalId: string; readonly style: PortalStyle; readonly phase: PortalPhase; readonly sourceWorldId: string; readonly destinationWorldId: string;
  readonly destinationMode: FlagshipMode; readonly destinationStatus: FlagshipEpistemicStatus; readonly tunnelMode: TunnelVisualMode; readonly tunnelStatus: FlagshipEpistemicStatus;
  readonly visual: { readonly ringCount: number; readonly warp: number; readonly note: string }; readonly traversed: boolean; readonly refusals: readonly string[]; readonly fingerprint: string;
}
function seal(p: Omit<PortalSnapshot, 'fingerprint'>): PortalSnapshot { return { ...p, fingerprint: sha256hex(stableStringify(p)) }; }

// The Schwarzschild radius / warp-factor formulas are reproduced locally (not imported from
// GenesisSpacetimePortalEngine.ts) so this frontend-reachable module never pulls in that
// engine's `node:crypto` import — Vite cannot bundle it for the browser. Same physics, no coupling.
const PORTAL_G = 6.67430e-11; const PORTAL_C = 299792458;
function localSchwarzschildRadius(massKg: number): number { return (2 * PORTAL_G * massKg) / (PORTAL_C * PORTAL_C); }
function localWarpFactor(massKg: number, r: number): number { const rs = 2 * localSchwarzschildRadius(massKg); return 1 / Math.sqrt(Math.max(1e-9, 1 - rs / Math.max(r, rs + 1e-9))); }

export function createPortal(input: { readonly sessionId: string; readonly style: PortalStyle; readonly sourceWorldId: string; readonly destinationWorldId: string; readonly destinationMode: FlagshipMode; readonly requestedDestinationStatus: FlagshipEpistemicStatus; readonly tunnelMode?: TunnelVisualMode; readonly massKgForVisual?: number }): PortalSnapshot {
  const guard = guardWorldMode(input.destinationMode, input.requestedDestinationStatus);
  const tunnelMode = input.tunnelMode ?? 'VISUAL_TUNNEL_ONLY';
  const mass = input.massKgForVisual ?? 0; const warp = mass > 0 ? +localWarpFactor(mass, 2.5 * localSchwarzschildRadius(mass)).toFixed(6) : 1;
  return seal({ portalId: `portal:${sha256hex(`${input.sessionId}|${input.sourceWorldId}|${input.destinationWorldId}`).slice(0, 12)}`, style: input.style, phase: 'DORMANT', sourceWorldId: input.sourceWorldId, destinationWorldId: input.destinationWorldId, destinationMode: input.destinationMode, destinationStatus: guard.status, tunnelMode, tunnelStatus: TUNNEL_MODE_STATUS[tunnelMode], visual: { ringCount: input.style === 'CIRCULAR_GATE' ? 9 : 24, warp, note: mass > 0 ? `tunnel shading from the relativistic warp factor at 2.5 r_s of a ${mass} kg mass (MODEL); not a claim of traversability` : 'decorative tunnel shading only' }, traversed: false, refusals: guard.allowed ? [] : [guard.reason] });
}

/** Advance one phase in order; traversal marks the portal traversed; any skip is refused. */
export function advancePortal(p: PortalSnapshot, to: PortalPhase): PortalSnapshot {
  const i = PORTAL_SEQUENCE.indexOf(p.phase); const j = PORTAL_SEQUENCE.indexOf(to);
  if (j !== i + 1) return seal({ ...p, refusals: [...p.refusals, `ILLEGAL_PHASE:${p.phase}->${to}`] });
  return seal({ ...p, phase: to, traversed: p.traversed || to === 'TRAVERSAL' });
}
export function openAndTraverse(p: PortalSnapshot): PortalSnapshot { let cur = p; for (const ph of PORTAL_SEQUENCE.slice(1)) cur = advancePortal(cur, ph); return cur; }
