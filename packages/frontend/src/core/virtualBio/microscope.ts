import type { BioExperimentRecord, CellState, DrawCommand, MicroscopeFrame, MicroscopeViewSpec } from './contracts';
import { fingerprintOf, mulberry32 } from './core';

/**
 * VISUAL PROVENANCE: the microscope view is a DETERMINISTIC function of the
 * frozen `BioExperimentRecord` plus the view parameters — never a live
 * simulation, never re-derived from anything the record doesn't already
 * carry. "What you see is what was computed": a screenshot's
 * `viewFingerprint` is a real, checkable hash, not decoration.
 *
 * Mandate item 9: `viewFingerprint` is deterministic and depends on exactly
 * `recordFingerprint + seed + zoom + fieldIndex + stain` (the full
 * `MicroscopeViewSpec`, hashed together with the record's own
 * `reproducibilityFingerprint`) — nothing else, so two renders of the
 * identical record at identical view parameters are byte-identical, and
 * changing any one of the four view parameters changes the fingerprint.
 */

const COLORS: Readonly<Record<CellState, string>> = {
  LIVE: '#22c55e',
  APOPTOTIC: '#f59e0b',
  NECROTIC: '#ef4444',
  RESISTANT: '#a78bfa',
};

export function renderMicroscopeFrame(rec: BioExperimentRecord, view: MicroscopeViewSpec): MicroscopeFrame {
  const viewFingerprint = fingerprintOf({ rec: rec.reproducibilityFingerprint, view });

  if (rec.result.summary.viabilityFinal === undefined) {
    return { commands: [], viewFingerprint, note: 'no cellular field for this model family' };
  }

  const rnd = mulberry32(parseInt(viewFingerprint.slice(0, 8), 16));
  const viab = rec.result.summary.viabilityFinal;
  const rf = rec.result.summary.resistantFractionFinal ?? 0;
  const live = Math.max(0, viab * (1 - rf));
  const resist = Math.max(0, viab * rf);
  const dead = Math.max(0, 1 - viab);

  const fractions: readonly { readonly state: CellState; readonly f: number }[] = [
    { state: 'LIVE', f: live },
    { state: 'RESISTANT', f: resist },
    { state: 'APOPTOTIC', f: dead * 0.6 },
    { state: 'NECROTIC', f: dead * 0.4 },
  ];

  const N = 220;
  const commands: DrawCommand[] = [];
  for (let i = 0; i < N; i++) {
    const u = rnd();
    let acc = 0;
    let state: CellState = 'LIVE';
    for (const s of fractions) {
      acc += s.f;
      state = s.state;
      if (u <= acc) break;
    }
    const zoom = view.zoom;
    const color = view.stain === 'NONE' ? '#334' : view.stain === 'VIABILITY' ? (state === 'LIVE' || state === 'RESISTANT' ? COLORS.LIVE : COLORS.NECROTIC) : COLORS[state];
    commands.push({ kind: 'cell', x: rnd(), y: rnd(), r: (0.012 + rnd() * 0.012) * zoom, state, color });
  }
  return { commands, viewFingerprint };
}
