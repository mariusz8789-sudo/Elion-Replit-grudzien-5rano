import { useState } from 'react';
import type React from 'react';
import { runSim, specFingerprint, DISCLOSURE, RANGES, type SimKind, type SimSpec, type SimState } from '../core/simWorld/engine';
import { FingerprintChip } from './genesis-ui/FingerprintChip';

/**
 * SIM WORLD — deterministic procedural telemetry, read-only UI.
 *
 * SCOPE: this is the lightweight, testable subset of the source bundle
 * (docs/DECISIONS.md D-056) — a real, click-to-run projection of
 * `core/simWorld/engine.ts::runSim`. The bundle's first-person 3D scenes
 * (hands, holographic monitors, a black hole with an accretion disk, an
 * Einstein-Rosen bridge, a "Philadelphia Experiment" cloaking field) are
 * NOT built here; see this screen's own on-page note and D-056 for why.
 * Every number below is a real, deterministic sample from the real engine
 * — never a live animation standing in for one (same "no theatre"
 * discipline as `GovDrugCampaignScreen.tsx`).
 */

const PRESETS: Readonly<Record<SimKind, Readonly<Record<string, number>>>> = {
  LAB_CELL: { dose_uM: 5 },
  LAB_PLASMA: { drive_Hz: 27 },
  LAB_CENTRIFUGE: { rpmTarget: 9000 },
  SPACE_BLACKHOLE: { spin_a: 0.9, isco_r: 6 },
  SPACE_WORMHOLE: { throat_r: 1.4, flow_rate: 40 },
  SPACE_PHILLY: { field_strength: 0.85 },
  WORLD_CITY: { cityBlocks: 96 },
};

export function SimWorldDashboard(): React.ReactElement {
  const [kind, setKind] = useState<SimKind>('LAB_CELL');
  const [params, setParams] = useState<Readonly<Record<string, number>>>(PRESETS.LAB_CELL);
  const [seed, setSeed] = useState(7);
  const [state, setState] = useState<SimState | null>(null);

  const selectKind = (k: SimKind): void => {
    setKind(k);
    setParams(PRESETS[k]);
    setState(null);
  };

  const spec: SimSpec = { kind, seed, params, dt: 0.05, tEnd: 30 };

  const sample = (): void => setState(runSim(spec));

  return (
    <div className="settings-view">
      <section className="settings-section">
        <h2>Sim World</h2>
        <p className="settings-hint">
          Deterministic procedural telemetry (state = f(seed, params, t)) — not a physical simulation, not real
          equipment. This screen renders the real, testable engine; the full first-person 3D scenes from the source
          bundle are deliberately not built in this pass (see docs/DECISIONS.md D-056).
        </p>
        <div className="gu-locale-switch" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {(Object.keys(PRESETS) as SimKind[]).map((k) => (
            <button key={k} type="button" className={k === kind ? 'chip-btn primary' : 'chip-btn'} onClick={() => selectKind(k)}>
              {k}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {Object.entries(params).map(([k, v]) => (
            <label key={k} className="gu-hint" style={{ display: 'block' }}>
              {k}
              <input
                type="range"
                min={RANGES[k]?.[0] ?? 0}
                max={RANGES[k]?.[1] ?? 1}
                step={((RANGES[k]?.[1] ?? 1) - (RANGES[k]?.[0] ?? 0)) / 200}
                value={v}
                onChange={(e) => setParams((p) => ({ ...p, [k]: parseFloat(e.target.value) }))}
                style={{ display: 'block', width: 160 }}
              />
            </label>
          ))}
          <label className="gu-hint" style={{ display: 'block' }}>
            seed
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value || '0', 10))}
              style={{ display: 'block', width: 80 }}
            />
          </label>
        </div>
        <button type="button" className="chip-btn primary" onClick={sample}>
          Sample (real, deterministic)
        </button>
        <div style={{ marginTop: 8 }}>
          <FingerprintChip label="spec fingerprint" value={specFingerprint(spec)} />
        </div>
      </section>

      {state === null ? (
        <section className="settings-section">
          <p className="empty-state">Nothing is computed until you click Sample. This screen never shows a result that did not run.</p>
        </section>
      ) : kind === 'WORLD_CITY' ? (
        <section className="settings-section">
          <h3 className="section-label">Deterministic block heightmap</h3>
          <svg viewBox="0 0 600 200" style={{ width: '100%', height: 200 }} role="img" aria-label="city block heightmap">
            {state.series.map((h, i) => (
              <rect key={i} x={i * (600 / state.series.length)} y={200 - h * 180} width={600 / state.series.length - 1} height={h * 180} fill="var(--green)" />
            ))}
          </svg>
        </section>
      ) : (
        <section className="settings-section">
          <h3 className="section-label">Sampled trace</h3>
          <svg viewBox="0 0 600 160" style={{ width: '100%', height: 160 }} role="img" aria-label="sampled telemetry trace">
            {state.series.length > 1 && (
              <polyline
                fill="none"
                stroke="var(--green)"
                strokeWidth={2}
                points={state.series
                  .map((v, i) => `${(i / (state.series.length - 1)) * 580 + 10},${150 - v * 130}`)
                  .join(' ')}
              />
            )}
          </svg>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {Object.entries(state.scalars).map(([k, v]) => (
              <span key={k} className="gu-hint" style={{ margin: 0 }}>
                {k}={v.toPrecision(4)}
              </span>
            ))}
          </div>
        </section>
      )}

      <p className="gu-hint" style={{ color: kind === 'SPACE_PHILLY' ? 'var(--gold)' : undefined }}>
        {kind === 'SPACE_PHILLY' ? "SCENARIO: 'PHILADELPHIA EXPERIMENT' = SCIENCE-FICTION LEGEND (unconfirmed). Visualization only." : DISCLOSURE}
      </p>
    </div>
  );
}
